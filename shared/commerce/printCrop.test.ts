import { describe, it, expect } from "vitest";
import {
  assessVariantEligibility,
  defaultCropForSku,
  cropFitsSku,
  croppedPixels,
  cropExtractPx,
  isValidCropShape,
  type NormalizedCrop,
} from "./printCrop";
import { getProdigiProduct, skuAspect } from "./prodigiProducts";

const ready = (widthPx: number, heightPx: number) => ({ widthPx, heightPx, status: "ready" as const });
const ratioLS = (w: number, h: number) => Math.max(w, h) / Math.min(w, h);

// The reported master: √2 (9920 × 7015). Photo Rag A3 / German Etching A2/A3 match; 12×16 does not.
const SQRT2 = ready(9920, 7015);

describe("§3 eligibility state machine — aspect match vs crop-required", () => {
  it("(1) exact aspect match → eligible WITHOUT crop", () => {
    const a = assessVariantEligibility(SQRT2, "GLOBAL-HGE-A2", null);
    expect(a.ratioMatches).toBe(true);
    expect(a.cropRequired).toBe(false);
    expect(a.eligible).toBe(true);
    expect(a.reasonCode).toBeNull();
  });

  it("(2) aspect mismatch + NO crop → cropRequired=true, NOT unverified/permanent-ineligible", () => {
    const a = assessVariantEligibility(SQRT2, "GLOBAL-HGE-12X16", null);
    expect(a.verifiedSku).toBe(true);        // it IS a real SKU
    expect(a.ratioMatches).toBe(false);
    expect(a.cropRequired).toBe(true);
    expect(a.cropConfigured).toBe(false);
    expect(a.eligible).toBe(false);
    expect(a.reasonCode).toBe("crop-required");
  });

  it("(3) aspect mismatch + valid confirmed crop → eligible=true (DPI from the CROP)", () => {
    const crop = defaultCropForSku(SQRT2.widthPx, SQRT2.heightPx, getProdigiProduct("GLOBAL-HGE-12X16")!);
    const a = assessVariantEligibility(SQRT2, "GLOBAL-HGE-12X16", crop);
    expect(a.cropConfigured).toBe(true);
    expect(a.eligible).toBe(true);
    expect(a.reasonCode).toBeNull();
    // Full-quality 12×16 crop of a 9920×7015 master ≈ 584 DPI (from cropped pixels, not the full master).
    expect(a.effectiveDpi).toBeGreaterThan(300);
    expect(a.effectiveDpi).toBeLessThan(620); // and LESS than the full-master 620 — cropping loses pixels
  });

  it("(4) crop that leaves too few pixels → eligible=false, reasonCode 'resolution'", () => {
    // A tiny crop window (25% of each edge) of the √2 master, at the 12×16 (4:3) ratio.
    const p = getProdigiProduct("GLOBAL-HGE-12X16")!;
    // Build a small centered 4:3 crop by scaling the default down.
    const full = defaultCropForSku(SQRT2.widthPx, SQRT2.heightPx, p);
    const small: NormalizedCrop = { x: 0.4, y: 0.4, w: full.w * 0.18, h: full.h * 0.18 };
    const a = assessVariantEligibility(SQRT2, "GLOBAL-HGE-12X16", small);
    expect(a.cropConfigured).toBe(true);
    expect(a.effectiveDpi).toBeLessThan(150);
    expect(a.eligible).toBe(false);
    expect(a.reasonCode).toBe("resolution");
  });

  it("(9)(10) unverified SKU → not eligible even WITH a crop", () => {
    const crop = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 };
    const a = assessVariantEligibility(SQRT2, "GLOBAL-FAKE-1", crop);
    expect(a.verifiedSku).toBe(false);
    expect(a.eligible).toBe(false);
    expect(a.reasonCode).toBe("unverified-sku");
  });

  it("(11) 150 DPI floor stays enforced (tiny master, matching ratio, no crop)", () => {
    const tiny = ready(600, Math.round(600 / skuAspect(getProdigiProduct("GLOBAL-HGE-A2")!))); // √2, ~424px short
    const a = assessVariantEligibility(tiny, "GLOBAL-HGE-A2", null);
    expect(a.ratioMatches).toBe(true);
    expect(a.effectiveDpi).toBeLessThan(150);
    expect(a.eligible).toBe(false);
    expect(a.reasonCode).toBe("resolution");
  });

  it("master not ready → not eligible (not-ready), even at a matching ratio", () => {
    const a = assessVariantEligibility({ ...SQRT2, status: "provisional" }, "GLOBAL-HGE-A2", null);
    expect(a.eligible).toBe(false);
    expect(a.reasonCode).toBe("not-ready");
  });

  it("no master → no-master", () => {
    const a = assessVariantEligibility({ widthPx: null, heightPx: null, status: "missing" }, "GLOBAL-HGE-A2", null);
    expect(a.reasonCode).toBe("no-master");
  });
});

describe("crop geometry — no stretch, correct ratio, both orientations", () => {
  it("(5) the default crop matches the SKU aspect exactly (no distortion) and fits", () => {
    for (const sku of ["GLOBAL-HGE-12X16", "GLOBAL-HGE-16X20", "GLOBAL-HPR-A3"]) {
      const p = getProdigiProduct(sku)!;
      const crop = defaultCropForSku(SQRT2.widthPx, SQRT2.heightPx, p);
      const { widthPx, heightPx } = croppedPixels(SQRT2.widthPx, SQRT2.heightPx, crop);
      expect(ratioLS(widthPx, heightPx)).toBeCloseTo(skuAspect(p), 2); // region ratio == SKU ratio
      expect(cropFitsSku(SQRT2.widthPx, SQRT2.heightPx, crop, p)).toBe(true);
      // Inside the master.
      expect(crop.x).toBeGreaterThanOrEqual(0);
      expect(crop.x + crop.w).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it("(12) portrait and landscape masters both produce a valid, fitting default crop", () => {
    const p = getProdigiProduct("GLOBAL-HGE-12X16")!;
    for (const m of [ready(9920, 7015), ready(7015, 9920)]) {
      const crop = defaultCropForSku(m.widthPx, m.heightPx, p);
      expect(isValidCropShape(crop)).toBe(true);
      expect(cropFitsSku(m.widthPx, m.heightPx, crop, p)).toBe(true);
      expect(assessVariantEligibility(m, "GLOBAL-HGE-12X16", crop).eligible).toBe(true);
    }
  });

  it("cropExtractPx yields an in-bounds sharp rectangle at the crop's pixels", () => {
    const crop = defaultCropForSku(SQRT2.widthPx, SQRT2.heightPx, getProdigiProduct("GLOBAL-HGE-12X16")!);
    const r = cropExtractPx(SQRT2.widthPx, SQRT2.heightPx, crop);
    expect(r.left + r.width).toBeLessThanOrEqual(SQRT2.widthPx);
    expect(r.top + r.height).toBeLessThanOrEqual(SQRT2.heightPx);
    expect(ratioLS(r.width, r.height)).toBeCloseTo(skuAspect(getProdigiProduct("GLOBAL-HGE-12X16")!), 2);
  });
});

describe("(8) a master change can invalidate a stored crop (no silent bad crop)", () => {
  it("a crop valid for one master fails cropFitsSku when the master's ratio changes enough", () => {
    const p = getProdigiProduct("GLOBAL-HGE-12X16")!; // 4:3
    // A crop that is 4:3 on a √2 master…
    const crop = defaultCropForSku(9920, 7015, p);
    expect(cropFitsSku(9920, 7015, crop, p)).toBe(true);
    // …applied to a very different master shape (square) no longer yields a 4:3 region.
    expect(cropFitsSku(5000, 5000, crop, p)).toBe(false);
    const a = assessVariantEligibility(ready(5000, 5000), "GLOBAL-HGE-12X16", crop);
    expect(a.eligible).toBe(false);
    expect(a.reasonCode).toBe("crop-invalid");
  });
});

// ── REGRESSION (the reported bug): a 7272×8592 master (ratio ≈ 1.182, not within 3% of any offered size)
//    was blocked as "Resolution too low". With crop-aware readiness the master is `status: "ready"`, so a
//    16×20 variant is crop-required (not a dead end) and becomes eligible once a valid crop is set — at the
//    ~429 PPI the file genuinely supports. Undersized masters must still fail on resolution.
describe("§regression — 7272×8592 print master at 16×20 (crop, not low-resolution)", () => {
  const M = ready(7272, 8592); // ready because it prints ≥150 PPI at ≥1 size (crop-aware readiness)

  it("16×20 is crop-required, not permanently ineligible, and not a resolution failure", () => {
    const a = assessVariantEligibility(M, "GLOBAL-HGE-16X20", null);
    expect(a.verifiedSku).toBe(true);
    expect(a.ratioMatches).toBe(false);
    expect(a.cropRequired).toBe(true);
    expect(a.reasonCode).toBe("crop-required"); // NOT "resolution"
    expect(a.eligible).toBe(false);             // ...until a crop is chosen
  });

  it("with a valid crop the 16×20 variant becomes eligible at ~429 PPI (deadlock broken)", () => {
    const crop = defaultCropForSku(M.widthPx, M.heightPx, getProdigiProduct("GLOBAL-HGE-16X20")!);
    const a = assessVariantEligibility(M, "GLOBAL-HGE-16X20", crop);
    expect(a.cropConfigured).toBe(true);
    expect(a.eligible).toBe(true);
    expect(a.reasonCode).toBeNull();
    expect(a.effectiveDpi).toBeGreaterThanOrEqual(400);
    expect(a.effectiveDpi).toBeLessThanOrEqual(430);
  });

  it("a provisional (genuinely low-res) master is NOT rescued by a crop", () => {
    const tiny = { widthPx: 1000, heightPx: 1200, status: "provisional" as const };
    const crop = defaultCropForSku(tiny.widthPx, tiny.heightPx, getProdigiProduct("GLOBAL-HGE-16X20")!);
    const a = assessVariantEligibility(tiny, "GLOBAL-HGE-16X20", crop);
    expect(a.eligible).toBe(false);
  });
});
