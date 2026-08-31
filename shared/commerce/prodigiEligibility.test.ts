import { describe, it, expect } from "vitest";
import {
  assessMasterForSku,
  eligibleSkusForMaster,
  getProdigiProduct,
  skuAspect,
} from "./prodigiProducts";

// The reported production master: German Etching 12×16 displayed ~620 DPI, and Photo Rag had eligible
// sizes. 620 DPI at 12×16 (print-area long edge 4800) ⇒ master long edge = 620·4800/300 = 9920. Photo
// Rag A3 being eligible ⇒ the master's aspect ratio is √2 (the A-series ratio). So a representative
// master is 9920 × 7015 (ratio ≈ 1.4142).
const MASTER = { widthPx: 9920, heightPx: 7015 };          // landscape √2
const MASTER_PORTRAIT = { widthPx: 7015, heightPx: 9920 }; // same, rotated

describe("German Etching vs Photo Rag — the same master, per-SIZE aspect-ratio match", () => {
  it("12×16 German Etching is Not eligible on ASPECT RATIO, not resolution (DPI is ~620)", () => {
    const e = assessMasterForSku(MASTER, "GLOBAL-HGE-12X16")!;
    expect(e.effectiveDpi).toBe(620);          // resolution is plentiful
    expect(e.meetsFloor).toBe(true);           // clears the 150 DPI floor easily
    expect(e.ratioMatches).toBe(false);        // …but the ratio does not match a 4:3 print area
    expect(e.eligible).toBe(false);
    expect(e.reasonCode).toBe("aspect-ratio"); // the EXACT reason (not "resolution")
  });

  it("German Etching A2 and A3 ARE eligible for the SAME master — the material is not disqualified", () => {
    expect(assessMasterForSku(MASTER, "GLOBAL-HGE-A2")!.eligible).toBe(true);
    expect(assessMasterForSku(MASTER, "GLOBAL-HGE-A3")!.eligible).toBe(true);
    // 16×20 (5:4) and 18×24 (4:3) do NOT match the √2 master.
    expect(assessMasterForSku(MASTER, "GLOBAL-HGE-16X20")!.reasonCode).toBe("aspect-ratio");
    expect(assessMasterForSku(MASTER, "GLOBAL-HGE-18X24")!.reasonCode).toBe("aspect-ratio");
  });

  it("Photo Rag A3 is eligible; Photo Rag 16×20 (5:4) is not — same rule, same master", () => {
    expect(assessMasterForSku(MASTER, "GLOBAL-HPR-A3")!.eligible).toBe(true);
    expect(assessMasterForSku(MASTER, "GLOBAL-HPR-16X20")!.reasonCode).toBe("aspect-ratio");
  });

  it("KEY: the same master yields eligible options for BOTH materials (it is a per-size match, not a material difference)", () => {
    const eligible = eligibleSkusForMaster(MASTER);
    const materials = new Set(eligible.map((p) => p.material));
    expect(materials.has("german-etching")).toBe(true);
    expect(materials.has("photo-rag")).toBe(true);
    expect(eligible.map((p) => p.sku).sort()).toEqual(["GLOBAL-HGE-A2", "GLOBAL-HGE-A3", "GLOBAL-HPR-A3"]);
  });
});

describe("orientation is ignored — a portrait master matches the same sizes as landscape", () => {
  it("gives identical eligibility for the rotated master", () => {
    for (const sku of ["GLOBAL-HGE-12X16", "GLOBAL-HGE-A2", "GLOBAL-HPR-A3"]) {
      const land = assessMasterForSku(MASTER, sku)!;
      const port = assessMasterForSku(MASTER_PORTRAIT, sku)!;
      expect(port.eligible).toBe(land.eligible);
      expect(port.effectiveDpi).toBe(land.effectiveDpi);
      expect(port.ratioMatches).toBe(land.ratioMatches);
    }
  });
});

describe("aspect-ratio tolerance (3%) — matches exactly, rejects just outside", () => {
  it("a master exactly at a size's ratio is eligible; ~5.75% off (√2 vs 4:3) is rejected", () => {
    const p = getProdigiProduct("GLOBAL-HGE-16X20")!; // 5:4 print area
    const r = skuAspect(p); // 1.25
    // Build a master exactly at the size ratio, comfortably above the floor.
    const exact = assessMasterForSku({ widthPx: Math.round(6000 * r), heightPx: 6000 }, "GLOBAL-HGE-16X20")!;
    expect(exact.ratioMatches).toBe(true);
    expect(exact.eligible).toBe(true);
    // Just outside 3% tolerance → rejected on ratio.
    const off = assessMasterForSku({ widthPx: Math.round(6000 * r * 1.05), heightPx: 6000 }, "GLOBAL-HGE-16X20")!;
    expect(off.ratioMatches).toBe(false);
    expect(off.reasonCode).toBe("aspect-ratio");
  });
});

describe("DPI floor (150) — ratio may match, but resolution can still disqualify", () => {
  const p = getProdigiProduct("GLOBAL-HGE-A2")!; // √2 ratio, print-area long edge 7015
  const ratio = skuAspect(p);
  const atLong = (long: number) => assessMasterForSku({ widthPx: Math.round(long / ratio), heightPx: long }, "GLOBAL-HGE-A2")!;

  it("below the floor → Not eligible with reasonCode 'resolution' (never upscales)", () => {
    // long edge for ~149 DPI: 149·7015/300 ≈ 3484
    const low = atLong(3484);
    expect(low.ratioMatches).toBe(true);
    expect(low.effectiveDpi).toBeLessThan(150);
    expect(low.eligible).toBe(false);
    expect(low.reasonCode).toBe("resolution");
  });

  it("at/above the floor with a matching ratio → eligible", () => {
    const ok = atLong(3600); // ~153 DPI
    expect(ok.effectiveDpi).toBeGreaterThanOrEqual(150);
    expect(ok.eligible).toBe(true);
    expect(ok.reasonCode).toBeNull();
  });
});

describe("verified SKUs only", () => {
  it("an unverified / invented SKU has no eligibility (never sold)", () => {
    expect(assessMasterForSku(MASTER, "GLOBAL-FAKE-99X99")).toBeNull();
    expect(getProdigiProduct("GLOBAL-PR-16X20")).toBeUndefined(); // the 404'd family stays excluded
  });
  it("every verified German Etching + Photo Rag launch SKU resolves", () => {
    for (const sku of ["GLOBAL-HGE-12X16", "GLOBAL-HGE-16X20", "GLOBAL-HGE-18X24", "GLOBAL-HGE-A3", "GLOBAL-HGE-A2", "GLOBAL-HPR-16X20", "GLOBAL-HPR-A3"]) {
      expect(getProdigiProduct(sku)?.activeForLaunch).toBe(true);
    }
  });
});
