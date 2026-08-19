/**
 * THE REAL PIXEL SIZE OF A PICTURE — measured, never guessed.
 *
 * An <img> without width and height gives the browser nothing to reserve space with, so the
 * page reflows when the image arrives, and gives Google no aspect to choose a thumbnail
 * shape from. Both are worth fixing. Neither is worth fixing with a plausible-looking
 * number: a wrong intrinsic size is worse than none, because the browser then reserves the
 * wrong box and the layout shifts anyway — with confidence.
 *
 * `artwork.dimensions` is NOT this. That field is the physical size of the painting
 * ("119x99cm"), which has no fixed relationship to the pixel size of a photograph of it.
 *
 * So the only honest source is the image bytes, read through sharp — the same library the
 * /img route already uses to resize them.
 *
 * MEASURES FIRST-PARTY IMAGES ONLY, and that is deliberate rather than a limitation. A
 * `data:` image is already in memory, so measuring costs a decode and nothing else. An
 * external image would have to be fetched from another host during a page render, turning
 * every crawl of every artwork page into an outbound request to a CDN we do not control.
 * Externally-hosted works therefore keep exactly the behaviour they have today, and gain
 * dimensions automatically if their bytes are ever brought first-party.
 *
 * CACHED, because the same handful of images are rendered on every crawl. Decoding a
 * multi-megabyte base64 string per request would make the fix cost more than the problem.
 */
import sharp from "sharp";

export interface PixelSize {
  width: number;
  height: number;
}

/** Keyed by the image string itself, so a replaced image is a different key. */
const cache = new Map<string, PixelSize | null>();

/** Bounded so a large library cannot grow this without limit. */
const MAX_ENTRIES = 500;

function remember(key: string, value: PixelSize | null): PixelSize | null {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
  return value;
}

/**
 * Measure one image, or return null.
 *
 * Null is a real answer and callers must render no dimensions at all when they get it —
 * that is the "no number is better than a wrong number" rule, expressed in the type.
 */
export async function measureImage(img: string | null | undefined): Promise<PixelSize | null> {
  if (typeof img !== "string" || !img.startsWith("data:")) return null;
  if (cache.has(img)) return cache.get(img) ?? null;

  try {
    const comma = img.indexOf(",");
    if (comma < 0) return remember(img, null);
    const buf = Buffer.from(img.slice(comma + 1), "base64");
    const meta = await sharp(buf).metadata();
    // `rotate()` in the delivery path applies EXIF orientation, which swaps the axes for a
    // quarter-turn. The declared size must describe what is DELIVERED, not what is stored.
    const turned = meta.orientation !== undefined && meta.orientation >= 5;
    const width = turned ? meta.height : meta.width;
    const height = turned ? meta.width : meta.height;
    if (!width || !height) return remember(img, null);
    return remember(img, { width, height });
  } catch {
    return remember(img, null);
  }
}

/** Measure an artwork's primary image — the one the SSR shell renders. */
export async function measurePrimaryImage(
  images: (string | null)[] | null | undefined,
): Promise<PixelSize | null> {
  const first = Array.isArray(images) ? images.find((i) => typeof i === "string" && i.trim()) : null;
  return measureImage(first ?? null);
}

/** Test seam — the cache is process-wide and would otherwise leak between cases. */
export function __clearImageDimensionCache(): void {
  cache.clear();
}
