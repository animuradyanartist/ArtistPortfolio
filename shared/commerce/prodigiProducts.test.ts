import { describe, it, expect } from "vitest";
import {
  PRODIGI_LAUNCH_PRODUCTS,
  getProdigiProduct,
  isActiveLaunchSku,
  activeLaunchSkus,
  productsForMaterial,
  assessMasterForSku,
  eligibleSkusForMaster,
  skuAspect,
} from "./prodigiProducts";

describe("the verified launch catalogue", () => {
  it("contains exactly the 7 sandbox-verified launch SKUs (HGE ×5, HPR ×2)", () => {
    expect(activeLaunchSkus().sort()).toEqual(
      [
        "GLOBAL-HGE-12X16", "GLOBAL-HGE-16X20", "GLOBAL-HGE-18X24", "GLOBAL-HGE-A3", "GLOBAL-HGE-A2",
        "GLOBAL-HPR-16X20", "GLOBAL-HPR-A3",
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
