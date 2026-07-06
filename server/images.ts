import type { Express } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import sharp from "sharp";
import { storage } from "./storage";

/**
 * Legacy artworks/gallery photos store images as base64 data-URLs inside
 * PostgreSQL rows. Returning those blobs inline in JSON made every list
 * endpoint a multi-megabyte download the browser could never cache.
 *
 * This module swaps each base64 blob for a small `/img/...` URL in API
 * responses, and serves the actual pixels from a dedicated route that
 * resizes to WebP with sharp and caches the result on disk + in the
 * browser (immutable, 1 year). The database stays the source of truth,
 * so nothing breaks on Replit redeploys — the disk cache just rebuilds
 * on demand.
 */

export type ImageKind = "artwork" | "print" | "gallery" | "exhibition" | "hero" | "bio";

const KINDS: ImageKind[] = ["artwork", "print", "gallery", "exhibition", "hero", "bio"];
const CACHE_DIR = path.join(process.cwd(), "public/uploads/_cache");
const DEFAULT_WIDTH = 1600;

// Cheap content fingerprint for cache busting — hashing the full multi-MB
// string per request would be wasteful; length + head + tail is enough to
// change whenever the image changes.
function shortHash(img: string): string {
  return crypto
    .createHash("sha1")
    .update(String(img.length))
    .update(img.slice(0, 256))
    .update(img.slice(-256))
    .digest("hex")
    .slice(0, 8);
}

export function toImageRef(kind: ImageKind, id: number, idx: number, img: string | null | undefined): string {
  if (!img || !img.startsWith("data:")) return img ?? "";
  return `/img/${kind}/${id}/${idx}?v=${shortHash(img)}`;
}

/** Replace base64 entries in an entity's `images` array with /img refs. */
export function refifyImages<T extends { id: number; images: string[] }>(kind: ImageKind, entity: T): T {
  if (!entity?.images?.some((i) => typeof i === "string" && i.startsWith("data:"))) return entity;
  return { ...entity, images: entity.images.map((img, i) => toImageRef(kind, entity.id, i, img)) };
}

export function refifyImagesList<T extends { id: number; images: string[] }>(kind: ImageKind, list: T[]): T[] {
  return list.map((e) => refifyImages(kind, e));
}

/** Replace a single base64 field (e.g. gallery `image`, homepage `heroImage`) with an /img ref. */
export function refifyImageField<T extends Record<string, any>>(kind: ImageKind, entity: T, field: keyof T): T {
  const v = entity?.[field];
  if (typeof v !== "string" || !v.startsWith("data:")) return entity;
  const id = typeof entity.id === "number" ? entity.id : 0;
  return { ...entity, [field]: toImageRef(kind, id, 0, v) };
}

export function refifyImageFieldList<T extends Record<string, any>>(kind: ImageKind, list: T[], field: keyof T): T[] {
  return list.map((e) => refifyImageField(kind, e, field));
}

// ---------------------------------------------------------------------------
// Resolving refs back to originals — the admin UI round-trips whatever the
// GET endpoints returned, so a save may echo `/img/...` refs back at us.
// Those must be swapped back to the stored original before hitting the DB,
// otherwise we'd persist a URL that points at itself.
// ---------------------------------------------------------------------------

const REF_RE = /^\/img\/(artwork|print|gallery|exhibition|hero|bio)\/(\d+)\/(\d+)(?:\?.*)?$/;

async function loadOriginal(kind: ImageKind, id: number, idx: number): Promise<string | null | undefined> {
  switch (kind) {
    case "artwork":
      return (await storage.getArtwork(id))?.images?.[idx];
    case "print":
      return (await storage.getPrint(id))?.images?.[idx];
    case "gallery":
      return (await storage.getGalleryPhoto(id))?.image;
    case "exhibition":
      return (await storage.getExhibition(id))?.image;
    case "hero":
      return (await storage.getHomepageSettings())?.heroImage;
    case "bio":
      return (await storage.getArtistBio())?.image;
  }
}

export async function resolveImageRef(img: string): Promise<string> {
  const m = typeof img === "string" ? img.match(REF_RE) : null;
  if (!m) return img;
  const original = await loadOriginal(m[1] as ImageKind, parseInt(m[2]), parseInt(m[3]));
  return original ?? img;
}

export async function resolveImageRefs(images: string[]): Promise<string[]> {
  return Promise.all(images.map(resolveImageRef));
}

/**
 * True for anything we accept as a stored image value. `/img/` refs are
 * deliberately NOT acceptable — they must be resolved back to originals
 * (resolveImageRefs) before validation, so an unresolvable ref is rejected
 * instead of persisted.
 */
export function isAcceptableImage(img: string): boolean {
  return (
    img.startsWith("data:image/") ||
    img.startsWith("http") ||
    img.startsWith("/uploads/")
  );
}

// ---------------------------------------------------------------------------
// Tiny in-memory response cache for hot public GET endpoints. Building the
// list responses pulls every base64 row out of Neon; doing that once per
// TTL instead of once per visitor keeps the DB out of the request path.
// Any non-GET /api request clears the whole cache (see routes.ts).
// ---------------------------------------------------------------------------

const apiCache = new Map<string, { exp: number; data: any }>();

export function invalidateApiCache(): void {
  apiCache.clear();
}

export async function memoJson<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = apiCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data as T;
  const data = await fn();
  apiCache.set(key, { exp: Date.now() + ttlMs, data });
  return data;
}

// ---------------------------------------------------------------------------
// The image route itself.
// ---------------------------------------------------------------------------

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function registerImageRoutes(app: Express): void {
  app.get("/img/:kind/:id/:idx", async (req, res) => {
    try {
      const kind = req.params.kind as ImageKind;
      const id = parseInt(req.params.id);
      const idx = parseInt(req.params.idx);
      if (!KINDS.includes(kind) || isNaN(id) || isNaN(idx) || idx < 0) {
        return res.status(404).send("Not found");
      }

      const original = await loadOriginal(kind, id, idx);
      if (!original) return res.status(404).send("Not found");

      // Already a file path or external URL — send the browser there.
      if (!original.startsWith("data:")) {
        if (original.startsWith("/img/")) return res.status(404).send("Not found");
        return res.redirect(302, original);
      }

      const w = clamp(parseInt(String(req.query.w)) || DEFAULT_WIDTH, 200, 2000);
      const v = shortHash(original);
      const cacheFile = path.join(CACHE_DIR, `${kind}-${id}-${idx}-${w}-${v}.webp`);

      res.set({
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      });

      if (fs.existsSync(cacheFile)) {
        return fs.createReadStream(cacheFile).pipe(res);
      }

      const comma = original.indexOf(",");
      const buf = Buffer.from(original.slice(comma + 1), "base64");
      const out = await sharp(buf)
        .rotate()
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFile(cacheFile, out, (err) => {
        if (err) console.error("Failed to write image cache file:", err);
      });

      res.send(out);
    } catch (error) {
      console.error(`Image route error for ${req.path}:`, error);
      res.status(500).send("Image error");
    }
  });
}
