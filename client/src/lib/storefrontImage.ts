/**
 * STOREFRONT IMAGE PREPARATION — keeps PUBLIC print images small before they are base64-inlined into the
 * ordinary `POST/PUT /api/prints` request.
 *
 * THE BUG THIS FIXES: public storefront images were base64-encoded at FULL resolution (FileReader,
 * no resize) and sent inside the `images` array of the print Save request. A large storefront image
 * (e.g. a 100 MB high-res photo) becomes a ~133 MB base64 body → Replit's ingress proxy 413s the
 * `prints` request before it reaches Express. (This is distinct from the production MASTER, which
 * already uploads out-of-band in chunks and is never in this request.)
 *
 * Public storefront images are DISPLAY images — the server re-derives resized WebP for serving — so a
 * large one is downscaled here to a sane web size before encoding. Small images pass through untouched.
 * The pure decision helpers are unit-tested; the canvas step runs only in the browser.
 */

/** Above this encoded/source size, a storefront image is downscaled before base64. Small ones pass through. */
export const STOREFRONT_MAX_BYTES = 2 * 1024 * 1024;
/** Longest edge (px) a downscaled storefront image is fitted into. Plenty for web display. */
export const STOREFRONT_MAX_DIM = 2400;
const STOREFRONT_JPEG_QUALITY = 0.9;

/** Pure: should this file be downscaled before base64? (Tested in Node.) */
export function shouldDownscaleStorefront(fileSize: number, maxBytes: number = STOREFRONT_MAX_BYTES): boolean {
  return fileSize > maxBytes;
}

/** Pure: fit (w×h) inside a max longest-edge, preserving aspect ratio, never upscaling. (Tested in Node.) */
export function fitWithin(w: number, h: number, maxDim: number = STOREFRONT_MAX_DIM): { w: number; h: number } {
  const longest = Math.max(w, h);
  const scale = longest > maxDim ? maxDim / longest : 1;
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

const readAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

const loadImage = (file: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });

/**
 * Return a base64 data URL for a public storefront image, downscaling it first if it is large. Falls back
 * to the original bytes only when the browser cannot decode the image (e.g. no canvas / an exotic format);
 * in a real browser a large image is always downscaled, so the print Save request stays small.
 */
export async function prepareStorefrontImage(file: File): Promise<string> {
  if (!shouldDownscaleStorefront(file.size)) return readAsDataUrl(file);
  if (typeof document === "undefined") return readAsDataUrl(file); // non-browser: no canvas
  try {
    const img = await loadImage(file);
    const { w, h } = fitWithin(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return readAsDataUrl(file);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", STOREFRONT_JPEG_QUALITY);
  } catch {
    return readAsDataUrl(file);
  }
}
