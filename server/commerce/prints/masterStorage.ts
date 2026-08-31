/**
 * PRINT MASTER STORAGE — the high-resolution production master belongs to a PRINT PRODUCT (1:1),
 * lives in PERSISTENT OBJECT STORAGE (Replit Object Storage), never in Postgres, and never public.
 *
 * OWNERSHIP: keys are PRINT-owned (`prints/<printId>/master-<rand>.<ext>`). Two prints of the same
 * source artwork have INDEPENDENT masters, so replacing one never touches the other.
 *
 * WHY OBJECT STORAGE (not a local disk): production is a Replit Autoscale deployment whose filesystem
 * is EPHEMERAL — a locally-written master vanishes on the next Publish/redeploy while the DB still says
 * `ready`, breaking fulfilment for a sold print. The bytes therefore live in Replit Object Storage
 * (see `masterObjectStore.ts`); Postgres keeps only the reference (`master_asset_key`) + metadata.
 *
 * VERSIONED KEYS FOR SAFE REPLACEMENT: every upload writes a NEW, unique key. The old object is
 * deleted only AFTER the DB commits to the new key (done by the route). So a failed upload or a failed
 * DB write can never destroy the previous valid master — nothing overwrites it.
 *
 * STAGING IS LOCAL AND DISPOSABLE: an upload streams to a local temp file only long enough to validate
 * the real bytes (sharp) and compute checksum/size; then it is uploaded to Object Storage and the temp
 * file is deleted. Permanent bytes NEVER depend on local filesystem persistence.
 *
 * NEVER PUBLIC: the only way out is a short-lived, HMAC-signed, per-PRINT token URL minted at fulfilment
 * time — it expires, is scoped to one print's master, carries no admin auth, and is never a permanent
 * public link. The app streams the object; Prodigi never receives a bucket URL.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { createReadStream } from "fs";
import { mkdir, stat, unlink, readdir } from "fs/promises";
import os from "os";
import path from "path";
import type { Readable } from "stream";
import sharp from "sharp";
import { getMasterStore, MasterStorageError } from "./masterObjectStore";

/** LOCAL staging only — disposable temp files while an upload is validated. NOT permanent storage.
 *  Overridable for tests via MASTER_STAGING_DIR; defaults to the OS temp dir (ephemeral by design). */
const STAGING_DIR = process.env.MASTER_STAGING_DIR?.trim() || path.join(os.tmpdir(), "print-master-staging");

/** A validation problem the CLIENT caused (bad format / unreadable) → the route returns 4xx, not 500. */
export class MasterValidationError extends Error {
  constructor(message: string) { super(message); this.name = "MasterValidationError"; }
}

/** Sharp's format names we accept — the formats the print provider (Prodigi) actually prints from.
 *  WebP/GIF/etc. are rejected: Prodigi's print assets are JPEG/PNG/TIFF. */
const ACCEPTED_FORMATS: Record<string, { ext: string; contentType: string }> = {
  jpeg: { ext: ".jpg", contentType: "image/jpeg" },
  png: { ext: ".png", contentType: "image/png" },
  tiff: { ext: ".tif", contentType: "image/tiff" },
};

export async function ensureMasterDirs(): Promise<void> {
  await mkdir(STAGING_DIR, { recursive: true });
}
export function stagingDir(): string {
  return STAGING_DIR;
}

function md5OfFile(p: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("md5");
    createReadStream(p).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

export interface StoredMaster {
  assetKey: string;      // Object Storage key, e.g. "prints/42/master-9f3a1c2b4d5e.tif"
  filename: string;
  contentType: string;
  widthPx: number;
  heightPx: number;
  byteSize: number;
  checksumMd5: string;
}

/** The print-owned key PREFIX under which this print's master object(s) live. */
function printPrefix(printId: number): string {
  return `prints/${printId}/`;
}

/** Remove EVERY master object for a print (used on removal). Throws MasterStorageError if the storage
 *  delete fails, so the caller can log a possible orphan and still clear the DB reference. */
export async function removeMasterFiles(printId: number): Promise<void> {
  await getMasterStore().removeByPrefix(printPrefix(printId));
}

/** Remove ONE master object by its exact key (used to roll back a just-uploaded object, or to delete
 *  the obsolete previous master only after the DB has committed to the replacement). Best-effort. */
export async function removeMasterObject(assetKey: string): Promise<void> {
  if (!assetKey) return;
  await getMasterStore().remove(assetKey);
}

/** Does this master object actually exist in storage? (Used by the Publish gate.) */
export async function masterObjectExists(assetKey: string): Promise<boolean> {
  if (!assetKey) return false;
  return getMasterStore().exists(assetKey);
}

/**
 * Finalise a STAGED upload as a master for a PRINT, safely:
 *   1. validate the real bytes (sharp) — accepted format + readable dimensions, or throw (staged file
 *      stays for the caller to clean; nothing in storage has been touched),
 *   2. compute checksum + size,
 *   3. upload the validated file to a NEW, unique Object Storage key (never overwrites the old master),
 *   4. verify the write landed.
 * Returns the new object's key + metadata. The caller updates the DB, then deletes the OLD object only
 * after that commit succeeds. A validation error (step 1) or an upload/storage error (step 3–4) leaves
 * any previous master completely untouched.
 */
export async function storeMasterFromStaging(
  printId: number, stagedPath: string, originalName: string, _mime: string,
): Promise<StoredMaster> {
  // 1) Validate ACTUAL contents. sharp throws on non-images; we also require an accepted format.
  let meta: sharp.Metadata;
  try {
    meta = await sharp(stagedPath, { limitInputPixels: false }).metadata();
  } catch {
    throw new MasterValidationError("That file is not a readable image.");
  }
  const format = meta.format ?? "";
  const accepted = ACCEPTED_FORMATS[format];
  if (!accepted) {
    throw new MasterValidationError(
      `Unsupported image type "${format || "unknown"}". Please upload a JPEG, PNG or TIFF.`,
    );
  }
  const widthPx = meta.width ?? 0;
  const heightPx = meta.height ?? 0;
  if (!widthPx || !heightPx) {
    throw new MasterValidationError("The image dimensions could not be read from that file.");
  }

  // 2) checksum + size (streamed — never the whole file in memory).
  const checksumMd5 = await md5OfFile(stagedPath);
  const { size: byteSize } = await stat(stagedPath);

  // 3) upload to a NEW unique key. The random suffix guarantees we never overwrite the previous master,
  //    so a later DB failure can be rolled back by deleting exactly this key.
  const assetKey = `${printPrefix(printId)}master-${randomBytes(8).toString("hex")}${accepted.ext}`;
  await getMasterStore().put(assetKey, stagedPath, accepted.contentType);

  // 4) verify the object is really there before we let the DB point at it.
  if (!(await getMasterStore().exists(assetKey))) {
    // Best-effort clean of a half-written object, then fail loud.
    await getMasterStore().remove(assetKey).catch(() => {});
    throw new MasterStorageError("The master upload could not be confirmed in storage.");
  }

  return {
    assetKey,
    filename: originalName || `master${accepted.ext}`,
    contentType: accepted.contentType,
    widthPx, heightPx, byteSize, checksumMd5,
  };
}

/** A readable stream for a stored master, or null if the object is genuinely absent (→ route 410).
 *  Throws MasterStorageError on a storage failure (→ route 5xx). Reads from Object Storage now, not a disk. */
export async function readMasterStream(assetKey: string): Promise<Readable | null> {
  if (!assetKey) return null;
  return getMasterStore().readStream(assetKey);
}

/** Best-effort deletion of a single staged temp file (used on every error/abort/success path). */
export async function cleanupStaged(p: string | undefined | null): Promise<void> {
  if (p) await unlink(p).catch(() => {});
}

/** Backstop: remove staging leftovers older than `maxAgeMs` (aborted/half uploads). Called at boot. */
export async function sweepStaging(maxAgeMs = 60 * 60 * 1000): Promise<void> {
  try {
    const now = Date.now();
    for (const name of await readdir(STAGING_DIR)) {
      const p = path.join(STAGING_DIR, name);
      const s = await stat(p).catch(() => null);
      if (s && now - s.mtimeMs > maxAgeMs) await unlink(p).catch(() => {});
    }
  } catch { /* no staging dir yet */ }
}

/**
 * DEV fallback only: with no database the DB has no asset_key, so resolve a print's master object by
 * listing its key prefix. In production the DB record is authoritative and this is unused.
 */
export async function findMasterObjectKey(printId: number): Promise<string | null> {
  try {
    const keys = await getMasterStore().listKeys(printPrefix(printId));
    return keys.find((k) => /\/master[-.]/.test(k)) ?? keys[0] ?? null;
  } catch {
    return null;
  }
}

// ── Signed, expiring, per-PRINT download tokens (for the fulfilment provider) ──
function tokenSecret(): string {
  return (
    process.env.MASTER_DOWNLOAD_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    "dev-only-insecure-master-secret"
  );
}

/** A cryptographically-signed token that grants time-limited read of ONE print's master. */
export function signMasterToken(printId: number, ttlSeconds = 900): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${printId}.${exp}`;
  const sig = createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

/** True only for an unexpired token whose signature is valid AND that is scoped to this print. */
export function verifyMasterToken(token: string | undefined | null, printId: number): boolean {
  if (!token || typeof token !== "string") return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return false;
  }
  const expected = createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const [pid, exp] = payload.split(".");
  if (Number(pid) !== printId) return false;
  if (!Number.isFinite(Number(exp)) || Number(exp) < Math.floor(Date.now() / 1000)) return false;
  return true;
}

/** The absolute, signed URL handed to the fulfilment provider at order time (never stored). When a
 *  `variantId` is given AND that variant has a crop, the route serves the crop-derived asset (the master
 *  is only read, never modified); the token stays scoped to the PRINT. */
export function signedMasterUrl(baseUrl: string, printId: number, ttlSeconds = 900, variantId?: number): string {
  const base = baseUrl.replace(/\/+$/, "");
  const variantParam = variantId != null ? `&variant=${variantId}` : "";
  return `${base}/api/commerce/prints/master-file/${printId}?token=${signMasterToken(printId, ttlSeconds)}${variantParam}`;
}
