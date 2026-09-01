/**
 * PURE LIGHTBOX LOGIC — no React, no DOM.
 *
 * The fullscreen artwork viewer's navigation, zoom and pan maths live here so they can be
 * unit-tested in a plain Node environment (the repo's test harness has no jsdom). The React
 * component in `components/ImageLightbox.tsx` is a thin shell over these functions.
 *
 * SECURITY NOTE: this module never chooses which images exist. The viewer only ever renders
 * the public storefront arrays its callers pass in (`artwork.images`, `print.images`, per-option
 * `mockup`). No master file, crop-source, print-ready asset URL, object-storage key or signed
 * fulfilment URL is ever handed to it — those never reach the client at all.
 */

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
export const ZOOM_STEP = 0.5;

/** Wrap an index into [0, len) with wraparound in both directions. Empty list → 0. */
export function wrapIndex(index: number, length: number): number {
  if (!Number.isFinite(length) || length <= 0) return 0;
  const i = Math.trunc(index);
  return ((i % length) + length) % length;
}

/** The next image index, wrapping past the end back to the start. */
export function nextIndex(index: number, length: number): number {
  return wrapIndex(index + 1, length);
}

/** The previous image index, wrapping past the start to the end. */
export function prevIndex(index: number, length: number): number {
  return wrapIndex(index - 1, length);
}

/** More than one image → real prev/next controls are warranted. */
export function hasMultiple(images: readonly unknown[] | null | undefined): boolean {
  return Array.isArray(images) && images.length > 1;
}

/** Clamp a zoom scale into the allowed range. NaN falls back to the minimum (fully zoomed out). */
export function clampZoom(scale: number): number {
  if (!Number.isFinite(scale)) return ZOOM_MIN;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

/** One zoom-in step, clamped to the maximum. */
export function zoomIn(scale: number): number {
  return clampZoom(clampZoom(scale) + ZOOM_STEP);
}

/** One zoom-out step, clamped to the minimum. */
export function zoomOut(scale: number): number {
  return clampZoom(clampZoom(scale) - ZOOM_STEP);
}

/** True when the image is zoomed past its fitted size (so panning is meaningful). */
export function isZoomed(scale: number): boolean {
  return clampZoom(scale) > ZOOM_MIN + 1e-6;
}

export interface Pan {
  x: number;
  y: number;
}

/**
 * Clamp a pan offset so a zoomed image can never be dragged entirely out of view.
 *
 * The furthest the content may travel from centre in each axis is half of the extra size the
 * zoom introduced: `(scale - 1) * viewport / 2`. At scale 1 (fitted) the bound is 0, so panning
 * is pinned to centre. Callers pass the viewport (stage) size in CSS pixels; unknown/zero sizes
 * clamp to 0, which is safe (no drift) rather than unbounded.
 */
export function clampPan(pan: Pan, scale: number, viewportWidth: number, viewportHeight: number): Pan {
  const s = clampZoom(scale);
  const maxX = Math.max(0, ((s - 1) * (Number.isFinite(viewportWidth) ? viewportWidth : 0)) / 2);
  const maxY = Math.max(0, ((s - 1) * (Number.isFinite(viewportHeight) ? viewportHeight : 0)) / 2);
  const x = Number.isFinite(pan.x) ? pan.x : 0;
  const y = Number.isFinite(pan.y) ? pan.y : 0;
  return {
    // `+ 0` normalises a clamped -0 back to 0 (they are otherwise deep-unequal).
    x: Math.min(maxX, Math.max(-maxX, x)) + 0,
    y: Math.min(maxY, Math.max(-maxY, y)) + 0,
  };
}

/** The reset state for a freshly opened / newly navigated image: fitted and centred. */
export function resetView(): { scale: number; pan: Pan } {
  return { scale: ZOOM_MIN, pan: { x: 0, y: 0 } };
}
