/**
 * The lightbox's pure navigation / zoom / pan maths. No DOM — these run in the node harness.
 */
import { describe, it, expect } from "vitest";
import {
  wrapIndex, nextIndex, prevIndex, hasMultiple,
  clampZoom, zoomIn, zoomOut, isZoomed, clampPan, resetView,
  ZOOM_MIN, ZOOM_MAX,
} from "./lightbox";

describe("navigation wraparound", () => {
  it("next wraps past the end back to the start", () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(2, 3)).toBe(0); // wrap
  });
  it("previous wraps past the start to the end", () => {
    expect(prevIndex(0, 3)).toBe(2); // wrap
    expect(prevIndex(2, 3)).toBe(1);
  });
  it("wrapIndex normalises any integer into range", () => {
    expect(wrapIndex(5, 3)).toBe(2);
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(0, 1)).toBe(0);
  });
  it("is safe for empty / degenerate lists", () => {
    expect(wrapIndex(0, 0)).toBe(0);
    expect(nextIndex(0, 0)).toBe(0);
    expect(prevIndex(0, 1)).toBe(0);
  });
  it("hasMultiple only when more than one image", () => {
    expect(hasMultiple([])).toBe(false);
    expect(hasMultiple(["a"])).toBe(false);
    expect(hasMultiple(["a", "b"])).toBe(true);
  });
});

describe("zoom", () => {
  it("clamps into [MIN, MAX]", () => {
    expect(clampZoom(0)).toBe(ZOOM_MIN);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(2)).toBe(2);
    expect(clampZoom(Number.NaN)).toBe(ZOOM_MIN);
  });
  it("zoom in / out step and never leave the range", () => {
    expect(zoomIn(ZOOM_MIN)).toBeGreaterThan(ZOOM_MIN);
    expect(zoomIn(ZOOM_MAX)).toBe(ZOOM_MAX); // capped
    expect(zoomOut(ZOOM_MIN)).toBe(ZOOM_MIN); // floored — cannot go below fitted
    expect(zoomOut(zoomIn(ZOOM_MIN))).toBe(ZOOM_MIN); // in then out returns to fitted
  });
  it("isZoomed is false at the fitted minimum, true once enlarged", () => {
    expect(isZoomed(ZOOM_MIN)).toBe(false);
    expect(isZoomed(zoomIn(ZOOM_MIN))).toBe(true);
  });
});

describe("pan clamping", () => {
  it("pins to centre when not zoomed (no drift possible)", () => {
    expect(clampPan({ x: 500, y: -500 }, ZOOM_MIN, 800, 1000)).toEqual({ x: 0, y: 0 });
  });
  it("allows travel up to half the extra size the zoom introduced", () => {
    // scale 2 over an 800×1000 stage → max |x| = (2-1)*800/2 = 400, max |y| = 500
    expect(clampPan({ x: 1000, y: 1000 }, 2, 800, 1000)).toEqual({ x: 400, y: 500 });
    expect(clampPan({ x: -1000, y: -1000 }, 2, 800, 1000)).toEqual({ x: -400, y: -500 });
    expect(clampPan({ x: 100, y: 100 }, 2, 800, 1000)).toEqual({ x: 100, y: 100 }); // within bounds, untouched
  });
  it("an unknown stage size clamps to centre rather than drifting unbounded", () => {
    expect(clampPan({ x: 300, y: 300 }, 3, 0, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe("resetView", () => {
  it("is fitted and centred", () => {
    expect(resetView()).toEqual({ scale: ZOOM_MIN, pan: { x: 0, y: 0 } });
  });
});
