import { describe, it, expect } from "vitest";
import {
  PRODIGI_LAUNCH_PRODUCTS,
  getProdigiProduct,
  isActiveLaunchSku,
  activeLaunchSkus,
  productsForMaterial,
  assessMasterForSku,
  eligibleSkusForMaster,
  maxCropEffectiveDpiForSku,
  printableSkusForMaster,
  classifyMasterResolution,
  skuAspect,
} from "./prodigiProducts";

describe("the verified launch catalogue", () => {
  it("contains exactly the 12 sandbox-verified launch SKUs (HGE ×5, HPR ×2, CAN ×5)", () => {
    expect(activeLaunchSkus().sort()).toEqual(
      [
        "GLOBAL-HGE-12X16", "GLOBAL-HGE-16X20", "GLOBAL-HGE-18X24", "GLOBAL-HGE-A3", "GLOBAL-HGE-A2",
        "GLOBAL-HPR-16X20", "GLOBAL-HPR-A3",
        "GLOBAL-CAN-A3", "GLOBAL-CAN-12X16", "GLOBAL-CAN-16X20", "GLOBAL-CAN-18X24", "GLOBAL-CAN-24X36",
      ].sort(),
    );
  });

  it("never references the 404 GLOBAL-PR-* prefix or unverified Enhanced Matte (FAP)", () => {
    for (const p of PRODIGI_LAUNCH_PRODUCTS) {
      expect(p.sku.startsWith("GLOBAL-PR-")).toBe(false);
      expect(p.sku.startsWith("GLOBAL-FAP-")).toBe(false);
    }
  });

  it("carries the exact sandbox print-area pixels + paper codes", () => {
    expect(getProdigiProduct("GLOBAL-HGE-12X16")).toMatchObject({ printAreaWidthPx: 3600, printAreaHeightPx: 4800, paperType: "HGE", substrateGsm: 310, material: "german-etching" });
    expect(getProdigiProduct("GLOBAL-HGE-A2")).toMatchObject({ printAreaWidthPx: 4960, printAreaHeightPx: 7015 });
    expect(getProdigiProduct("GLOBAL-HPR-16X20")).toMatchObject({ printAreaWidthPx: 4800, printAreaHeightPx: 6000, paperType: "HPR", substrateGsm: 308, material: "photo-rag" });
    expect(getProdigiProduct("GLOBAL-HPR-A3")).toMatchObject({ printAreaWidthPx: 3507, printAreaHeightPx: 4960 });
  });

  it("looks up case-insensitively and rejects unknown SKUs", () => {
    expect(getProdigiProduct("global-hge-a3")?.sku).toBe("GLOBAL-HGE-A3");
    expect(getProdigiProduct("GLOBAL-PR-16X20")).toBeUndefined();
    expect(getProdigiProduct("MADE-UP-SKU")).toBeUndefined();
    expect(getProdigiProduct(null)).toBeUndefined();
  });

  it("isActiveLaunchSku is the SKU gate — true only for verified launch SKUs", () => {
    expect(isActiveLaunchSku("GLOBAL-HGE-16X20")).toBe(true);
    expect(isActiveLaunchSku("GLOBAL-FAP-16X24")).toBe(false); // real but not launch
    expect(isActiveLaunchSku("GLOBAL-PR-16X20")).toBe(false); // 404
    expect(isActiveLaunchSku("")).toBe(false);
  });

  it("splits materials", () => {
    expect(productsForMaterial("german-etching")).toHaveLength(5);
    expect(productsForMaterial("photo-rag")).toHaveLength(2);
    expect(productsForMaterial("stretched-canvas")).toHaveLength(5);
  });

  it("carries the exact sandbox print-area pixels + wrap for the five canvas SKUs", () => {
    expect(getProdigiProduct("GLOBAL-CAN-A3")).toMatchObject({ printAreaWidthPx: 3561, printAreaHeightPx: 5013, paperType: "CAN", substrateGsm: 400, material: "stretched-canvas" });
    expect(getProdigiProduct("GLOBAL-CAN-12X16")).toMatchObject({ printAreaWidthPx: 3654, printAreaHeightPx: 4854 });
    expect(getProdigiProduct("GLOBAL-CAN-16X20")).toMatchObject({ printAreaWidthPx: 4854, printAreaHeightPx: 6054 });
    expect(getProdigiProduct("GLOBAL-CAN-18X24")).toMatchObject({ printAreaWidthPx: 5454, printAreaHeightPx: 7254 });
    expect(getProdigiProduct("GLOBAL-CAN-24X36")).toMatchObject({ printAreaWidthPx: 7254, printAreaHeightPx: 10854 });
    for (const sku of ["GLOBAL-CAN-A3", "GLOBAL-CAN-12X16", "GLOBAL-CAN-16X20", "GLOBAL-CAN-18X24", "GLOBAL-CAN-24X36"]) {
      expect(getProdigiProduct(sku)?.requiredAttributes?.wrap).toBe("MirrorWrap");
    }
  });
});

describe("assessMasterForSku — eligibility against REAL print-area pixels", () => {
  it("a master matching the print area exactly prints at 300 DPI and is eligible", () => {
    // GLOBAL-HGE-12X16 print area is 3600×4800 (a 3:4 / 0.75 ratio).
    const e = assessMasterForSku({ widthPx: 3600, heightPx: 4800 }, "GLOBAL-HGE-12X16")!;
    expect(e.ratioMatches).toBe(true);
    expect(e.effectiveDpi).toBe(300);
    expect(e.meetsPreferred).toBe(true);
    expect(e.eligible).toBe(true);
  });

  it("orientation-agnostic: a landscape master of the same ratio still matches", () => {
    const e = assessMasterForSku({ widthPx: 4800, heightPx: 3600 }, "GLOBAL-HGE-12X16")!;
    expect(e.ratioMatches).toBe(true);
    expect(e.eligible).toBe(true);
  });

  it("half the pixels = 150 DPI = exactly the floor (still eligible, not preferred)", () => {
    const e = assessMasterForSku({ widthPx: 1800, heightPx: 2400 }, "GLOBAL-HGE-12X16")!;
    expect(e.effectiveDpi).toBe(150);
    expect(e.meetsFloor).toBe(true);
    expect(e.meetsPreferred).toBe(false);
    expect(e.eligible).toBe(true);
  });

  it("below the floor is INELIGIBLE — never upscaled to fit", () => {
    const e = assessMasterForSku({ widthPx: 1200, heightPx: 1600 }, "GLOBAL-HGE-12X16")!;
    expect(e.effectiveDpi).toBe(100);
    expect(e.eligible).toBe(false);
    expect(e.reason).toMatch(/below the 150 DPI floor/);
  });

  it("a ratio mismatch disqualifies (no crop, no stretch) even with plenty of pixels", () => {
    // A square master against a 3:4 print area.
    const e = assessMasterForSku({ widthPx: 6000, heightPx: 6000 }, "GLOBAL-HGE-12X16")!;
    expect(e.ratioMatches).toBe(false);
    expect(e.eligible).toBe(false);
    expect(e.reason).toMatch(/crop or stretch/);
  });

  it("returns null for an unknown SKU rather than guessing", () => {
    expect(assessMasterForSku({ widthPx: 3600, heightPx: 4800 }, "MADE-UP")).toBeNull();
  });

  it("today's ~1280px web images clear NO launch SKU (they are not masters)", () => {
    expect(eligibleSkusForMaster({ widthPx: 1280, heightPx: 1600 })).toHaveLength(0);
  });

  it("a genuine 3:4 master is eligible for the 3:4 SKUs and not the A-sizes", () => {
    // 4800×6400 is a clean 3:4. HGE 12X16 (3600×4800) and 16X20 (4800×6000?) — check ratios.
    const eligible = eligibleSkusForMaster({ widthPx: 4800, heightPx: 6400 }).map((p) => p.sku);
    expect(eligible).toContain("GLOBAL-HGE-12X16"); // 3600×4800 = 0.75, master 0.75 ✓ (150+ DPI)
    expect(eligible).not.toContain("GLOBAL-HGE-A2"); // A2 ≈ 1:√2, different ratio
  });

  it("skuAspect is orientation-agnostic (>= 1)", () => {
    expect(skuAspect(getProdigiProduct("GLOBAL-HGE-12X16")!)).toBeCloseTo(4800 / 3600, 3);
  });
});

// ── REGRESSION: a high-resolution master whose native aspect ratio matches NO offered size within the
//    3% no-crop tolerance must NOT be treated as low-resolution. It is crop-required, not "too low".
//    Exact reported case: a 7272×8592 px production master (ratio ≈ 1.182 ≈ 5:6, ~429 PPI at 16×20).
describe("crop-aware master resolution — 7272×8592 must be crop-required, not low-resolution", () => {
  const MASTER = { widthPx: 7272, heightPx: 8592 }; // ratio 8592/7272 ≈ 1.1815

  it("is NOT classified low-resolution — it is crop-required", () => {
    expect(classifyMasterResolution(MASTER)).toBe("crop-required");
  });

  it("prints at 16×20 with ~429 effective PPI (via a crop)", () => {
    // GLOBAL-HGE-16X20 print area 4800×6000 (long edge 6000).
    expect(maxCropEffectiveDpiForSku(MASTER, "GLOBAL-HGE-16X20")).toBe(429);
    expect(maxCropEffectiveDpiForSku(MASTER, "GLOBAL-CAN-16X20")).toBe(425);
  });

  it("16×20 fails the NATIVE (no-crop) fit on ASPECT RATIO, never on resolution", () => {
    const e = assessMasterForSku(MASTER, "GLOBAL-HGE-16X20")!;
    expect(e.ratioMatches).toBe(false);         // 1.182 vs 1.25 is ~5.5% > 3% tolerance
    expect(e.reasonCode).toBe("aspect-ratio");  // NOT "resolution"
    expect(e.effectiveDpi).toBe(429);           // resolution is excellent
    expect(e.meetsFloor).toBe(true);
  });

  it("matches no size natively, yet is printable (with a crop) at real offered sizes", () => {
    expect(eligibleSkusForMaster(MASTER)).toHaveLength(0);          // no no-crop match
    const printable = printableSkusForMaster(MASTER).map((p) => p.sku);
    expect(printable.length).toBeGreaterThan(0);
    expect(printable).toContain("GLOBAL-HGE-16X20");                // 16×20 is printable via crop
    // Every offered size clears the 150 floor here (smallest is Canvas 24×36 at 237 PPI).
    expect(maxCropEffectiveDpiForSku(MASTER, "GLOBAL-CAN-24X36")).toBe(237);
  });

  it("a genuinely undersized master still fails as insufficient resolution", () => {
    const tiny = { widthPx: 1000, heightPx: 1200 };                // ~62 PPI at the smallest size
    expect(classifyMasterResolution(tiny)).toBe("insufficient");
    expect(printableSkusForMaster(tiny)).toHaveLength(0);
    expect(maxCropEffectiveDpiForSku(tiny, "GLOBAL-HGE-12X16")).toBeLessThan(150);
  });

  it("a native-ratio, above-floor master is classified native (unchanged behaviour)", () => {
    // 3:4 master matching GLOBAL-HGE-12X16 exactly at 300 PPI.
    expect(classifyMasterResolution({ widthPx: 3600, heightPx: 4800 })).toBe("native");
  });
});
