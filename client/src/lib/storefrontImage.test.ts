import { describe, it, expect } from "vitest";
import { shouldDownscaleStorefront, fitWithin, STOREFRONT_MAX_BYTES, STOREFRONT_MAX_DIM } from "./storefrontImage";

describe("storefront image preparation — keep public images small (out of the ingress-capped Save request)", () => {
  it("downscales only images larger than the threshold", () => {
    expect(shouldDownscaleStorefront(500 * 1024)).toBe(false); // 500 KB passes through
    expect(shouldDownscaleStorefront(STOREFRONT_MAX_BYTES)).toBe(false); // exactly the cap is fine
    expect(shouldDownscaleStorefront(50 * 1024 * 1024)).toBe(true); // 50 MB must be downscaled
    expect(shouldDownscaleStorefront(120 * 1024 * 1024)).toBe(true); // a mistakenly-huge image
  });

  it("fits large dimensions inside the max longest-edge, preserving aspect ratio, never upscaling", () => {
    // A 12000×9000 (huge) photo → longest edge clamped to STOREFRONT_MAX_DIM.
    const big = fitWithin(12000, 9000);
    expect(Math.max(big.w, big.h)).toBe(STOREFRONT_MAX_DIM);
    expect(big.w / big.h).toBeCloseTo(12000 / 9000, 2); // aspect preserved
    // A small image is never enlarged.
    expect(fitWithin(800, 600)).toEqual({ w: 800, h: 600 });
    // Portrait orientation clamps the height.
    const tall = fitWithin(3000, 9000);
    expect(Math.max(tall.w, tall.h)).toBe(STOREFRONT_MAX_DIM);
  });
});
