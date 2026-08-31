/**
 * PRINT MASTER STORAGE — the high-resolution production master belongs to a PRINT PRODUCT (1:1),
 * lives on a PERSISTENT DISK, never in Postgres, and never under public/.
 *
 * OWNERSHIP: keyed by printId. Two prints of the same source artwork have INDEPENDENT masters
 * (`<printId>/master.<ext>`), so replacing one never touches the other.
 *
 * WHY A DISK: a 300-DPI fine-art master is tens–hundreds of MB. Postgres keeps only a reference +
 * metadata; the bytes go to the Render Persistent Disk (PRINT_MASTERS_DIR, default /var/data/print-masters).
 *
 * NEVER PUBLIC: the file is never a static asset. The only way out is a short-lived, HMAC-signed,
 * per-PRINT token URL minted at fulfilment time for the print provider — it expires, is scoped to one
 * print's master, carries no admin auth, and is never a permanent public link.
 *
 * ATOMIC REPLACEMENT: a new upload is validated + finalised in a temp file, then atomically renamed
 * into place; only after that are stale files removed. A failed/invalid upload can NEVER destroy the
 * previous valid master.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { createReadStream, existsSync } from "fs";
import { mkdir, stat, rename, unlink, readdir } from "fs/promises";
import path from "path";
import sharp from "sharp";

export const MASTER_DIR =
  process.env.PRINT_MASTERS_DIR?.trim() ||
  (process.env.NODE_ENV === "production"
    ? "/var/data/print-masters"
    : path.join(process.cwd(), ".print-masters"));

const STAGING_DIR = path.join(MASTER_DIR, ".staging");

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
  assetKey: string;      // relative path under MASTER_DIR, e.g. "42/master.tif"
  filename: string;
  contentType: string;
  widthPx: number;
  heightPx: number;
  byteSize: number;
  checksumMd5: string;
}

function printDir(printId: number): string {
  return path.join(MASTER_DIR, String(printId));
}

/** Delete every master file for a print (used on remove + stale-extension cleanup after replace). */
export async function removeMasterFiles(printId: number): Promise<void> {
  try {
    for (const name of await readdir(printDir(printId))) {
      if (name.startsWith("master")) await unlink(path.join(printDir(printId), name)).catch(() => {});
    }
  } catch {
    // no directory yet — nothing to remove
  }
}

/**
 * Finalise a STAGED upload as the master for a PRINT, ATOMICALLY and safely:
 *   1. validate the real bytes (sharp) — accepted format + readable dimensions, or throw (staged file
 *      stays for the caller to clean, the OLD master is untouched),
 *   2. compute checksum + size,
 *   3. move the validated file to a TEMP name in the print's folder, then ATOMICALLY rename it onto
 *      `master.<ext>` (overwrites the same-extension old master in one syscall — never a partial file),
 *   4. remove any stale different-extension master files.
 * A failure at step 1–2 never deletes the previous master; a failure at step 3 leaves the old master
 * in place (the atomic rename either fully happened or did not).
 */
export async function storeMasterFromStaging(
  printId: number, stagedPath: string, originalName: string, mime: string,
): Promise<StoredMaster> {
  await ensureMasterDirs();

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

  // 3) atomic swap into <printId>/master.<ext>.
  const dir = printDir(printId);
  await mkdir(dir, { recursive: true });
  const finalName = `master${accepted.ext}`;
  const finalPath = path.join(dir, finalName);
  const tmpPath = path.join(dir, `.master-${randomBytes(6).toString("hex")}${accepted.ext}`);
  await rename(stagedPath, tmpPath);        // move validated file next to the target (same filesystem)
  await rename(tmpPath, finalPath);         // ATOMIC overwrite of the same-extension master

  // 4) remove any stale masters with a DIFFERENT extension (only now that the new one is safely in place).
  try {
    for (const name of await readdir(dir)) {
      if (name.startsWith("master") && name !== finalName) await unlink(path.join(dir, name)).catch(() => {});
    }
  } catch { /* nothing else to clean */ }

  return {
    assetKey: path.posix.join(String(printId), finalName),
    filename: originalName || finalName,
    contentType: accepted.contentType,
    widthPx, heightPx, byteSize, checksumMd5,
  };
}

function insideMasterDir(p: string): boolean {
  const resolved = path.resolve(p);
  return resolved === path.resolve(MASTER_DIR) || resolved.startsWith(path.resolve(MASTER_DIR) + path.sep);
}

/** Absolute path for a stored key — guarded so a crafted key can never escape the master directory. */
export function pathForKey(assetKey: string): string | null {
  if (!assetKey) return null;
  const p = path.join(MASTER_DIR, assetKey);
  return insideMasterDir(p) ? p : null;
}

/** A readable stream for a stored master, or null if the file is missing. */
export function readMasterStream(assetKey: string): NodeJS.ReadableStream | null {
  const p = pathForKey(assetKey);
  if (!p || !existsSync(p)) return null;
  return createReadStream(p);
}

/** Best-effort deletion of a single staged temp file (used on every error/abort path). */
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
 * DEV fallback only: with no database the DB has no asset_key, so resolve the master file for a print
 * by scanning its folder. In production the DB record is authoritative and this is unused.
 */
export async function findMasterKeyOnDisk(printId: number): Promise<string | null> {
  try {
    const name = (await readdir(printDir(printId))).find((n) => n.startsWith("master"));
    return name ? path.posix.join(String(printId), name) : null;
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

/** The absolute, signed URL handed to the fulfilment provider at order time (never stored). */
export function signedMasterUrl(baseUrl: string, printId: number, ttlSeconds = 900): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/api/commerce/prints/master-file/${printId}?token=${signMasterToken(printId, ttlSeconds)}`;
}
