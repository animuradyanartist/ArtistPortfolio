/**
 * PRINT MASTER STORAGE — the high-resolution production master lives on a PERSISTENT DISK, never in
 * Postgres and never under public/.
 *
 * WHY A DISK, NOT A DB BLOB: a 300-DPI fine-art master is tens to hundreds of MB (a 16-bit TIFF at
 * the largest launch size is ~230 MB). Base64 in Postgres bloats every row and backup and breaks the
 * JSON body limit. So the bytes go to a Render Persistent Disk (mounted at PRINT_MASTERS_DIR, default
 * /var/data/print-masters); Postgres keeps only a reference + metadata.
 *
 * NEVER PUBLIC: the file is not served as a static asset. The only way out is a short-lived,
 * HMAC-signed, per-artwork token URL generated at fulfilment time for the print provider — it expires,
 * is scoped to one master, carries no admin auth, and is never a permanent public link.
 *
 * One master per artwork (print_masters is unique on artwork_id): the key is deterministic
 * (`<artworkId>/master<ext>`), so a re-upload overwrites in place.
 */
import { createHash, createHmac, timingSafeEqual } from "crypto";
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

/** Ensure the disk directories exist (called at boot + before writes). Safe to call repeatedly. */
export async function ensureMasterDirs(): Promise<void> {
  await mkdir(STAGING_DIR, { recursive: true });
}
export function stagingDir(): string {
  return STAGING_DIR;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg", "image/png": ".png", "image/tiff": ".tif", "image/webp": ".webp",
};

function extFor(mime: string, originalName: string): string {
  const fromName = path.extname(originalName || "").toLowerCase();
  return EXT_BY_MIME[mime] ?? (fromName && /^\.[a-z0-9]{1,5}$/.test(fromName) ? fromName : ".bin");
}

function md5OfFile(p: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("md5");
    createReadStream(p).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

export interface StoredMaster {
  assetKey: string;      // relative path under MASTER_DIR, e.g. "42/master.tif"
  filename: string;      // original filename
  contentType: string;
  widthPx: number;
  heightPx: number;
  byteSize: number;
  checksumMd5: string;
}

/**
 * Finalise a STAGED upload (already streamed to disk by multer) as the master for an artwork. Reads
 * the pixel dimensions with sharp (header only — no full decode), computes the md5 + size, moves it
 * into place under the artwork's folder, and removes any previous master file for that artwork.
 */
export async function storeMasterFromStaging(
  artworkId: number, stagedPath: string, originalName: string, mime: string,
): Promise<StoredMaster> {
  await ensureMasterDirs();
  // Dimensions from the header; limitInputPixels:false so a huge print master isn't rejected.
  const meta = await sharp(stagedPath, { limitInputPixels: false }).metadata();
  const widthPx = meta.width ?? 0;
  const heightPx = meta.height ?? 0;
  const contentType = meta.format ? `image/${meta.format === "jpeg" ? "jpeg" : meta.format}` : (mime || "application/octet-stream");
  const checksumMd5 = await md5OfFile(stagedPath);
  const { size: byteSize } = await stat(stagedPath);

  const ext = extFor(contentType, originalName);
  const dir = path.join(MASTER_DIR, String(artworkId));
  await mkdir(dir, { recursive: true });
  // Remove any prior master (possibly a different extension) so there is exactly one per artwork.
  await removeMasterFiles(artworkId);
  const assetKey = path.posix.join(String(artworkId), `master${ext}`);
  await rename(stagedPath, path.join(MASTER_DIR, assetKey));

  return { assetKey, filename: originalName || `master${ext}`, contentType, widthPx, heightPx, byteSize, checksumMd5 };
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

/** Delete every master file for an artwork (used on replace + remove). */
export async function removeMasterFiles(artworkId: number): Promise<void> {
  const dir = path.join(MASTER_DIR, String(artworkId));
  try {
    for (const name of await readdir(dir)) {
      if (name.startsWith("master")) await unlink(path.join(dir, name)).catch(() => {});
    }
  } catch {
    // no directory yet — nothing to remove
  }
}

/**
 * DEV fallback only: with no database the DB has no asset_key, so resolve the master file for an
 * artwork by scanning its folder. In production the DB record is authoritative and this is unused.
 */
export async function findMasterKeyOnDisk(artworkId: number): Promise<string | null> {
  const dir = path.join(MASTER_DIR, String(artworkId));
  try {
    const name = (await readdir(dir)).find((n) => n.startsWith("master"));
    return name ? path.posix.join(String(artworkId), name) : null;
  } catch {
    return null;
  }
}

// ── Signed, expiring, per-artwork download tokens (for the fulfilment provider) ──
function tokenSecret(): string {
  return (
    process.env.MASTER_DOWNLOAD_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    "dev-only-insecure-master-secret"
  );
}

/** A cryptographically-signed token that grants time-limited read of ONE artwork's master. */
export function signMasterToken(artworkId: number, ttlSeconds = 900): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${artworkId}.${exp}`;
  const sig = createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

/** True only for an unexpired token whose signature is valid AND that is scoped to this artwork. */
export function verifyMasterToken(token: string | undefined | null, artworkId: number): boolean {
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
  const [aid, exp] = payload.split(".");
  if (Number(aid) !== artworkId) return false;
  if (!Number.isFinite(Number(exp)) || Number(exp) < Math.floor(Date.now() / 1000)) return false;
  return true;
}

/** The absolute, signed URL handed to the fulfilment provider at order time (never stored). */
export function signedMasterUrl(baseUrl: string, artworkId: number, ttlSeconds = 900): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/api/commerce/prints/master-file/${artworkId}?token=${signMasterToken(artworkId, ttlSeconds)}`;
}
