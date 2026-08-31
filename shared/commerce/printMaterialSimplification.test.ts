/**
 * PRINT STORE SIMPLIFICATION — TWO customer-facing materials only: Fine Art Paper + Canvas.
 *
 * Fine Art Paper offers ONE stock (Hahnemühle German Etching). Photo Rag is retired from NEW
 * selection but stays resolvable for historical rows. Canvas (GLOBAL-CAN) is fully architected and
 * ships with a catalogue wrap attribute, but is only purchasable once a verified sandbox SKU exists.
 */

import { describe, it, expect } from "vitest";
import {
  ALL_CATEGORIES,
  CATEGORY_LABEL,
  MATERIAL_CATEGORY,
  MATERIAL_INFO,
  PRODIGI_LAUNCH_PRODUCTS,
  CANVAS_LAUNCH_PRODUCTS,
  DEFAULT_CANVAS_WRAP,
  offeredMaterialsForCategory,
  offeredProductsForMaterial,
  categoryOfferedForNewVariants,
  isSkuOfferedForNewVariant,
  getProdigiProduct,
  isActiveLaunchSku,
  defaultAttributesForMaterial,
  requiredAttributesForSku,
} from "./prodigiProducts";
import { buildPrintQuoteRequest } from "../../server/commerce/prints/printShipping";

describe("(1) the material selector contains ONLY Fine Art Paper and Canvas", () => {
  it("exposes exactly the two customer-facing categories", () => {
    expect([...ALL_CATEGORIES].sort()).toEqual(["canvas", "fine-art-paper"]);
    expect(CATEGORY_LABEL["fine-art-paper"]).toBe("Fine Art Paper");
    expect(CATEGORY_LABEL["canvas"]).toBe("Canvas");
  });
  it("every OFFERED material belongs to one of the two categories", () => {
    const offered = [...offeredMaterialsForCategory("fine-art-paper"), ...offeredMaterialsForCategory("canvas")];
    for (const m of offered) expect(["fine-art-paper", "canvas"]).toContain(MATERIAL_CATEGORY[m]);
  });
});

describe("(2) Fine Art Paper maps only to verified Hahnemühle German Etching SKUs", () => {
  it("Fine Art Paper offers german-etching ONLY (photo-rag retired)", () => {
    expect(offeredMaterialsForCategory("fine-art-paper")).toEqual(["german-etching"]);
  });
  it("every offered Fine Art Paper SKU is a verified GLOBAL-HGE product", () => {
    const skus = offeredProductsForMaterial("german-etching");
    expect(skus.length).toBeGreaterThan(0);
    for (const p of skus) {
      expect(p.sku).toMatch(/^GLOBAL-HGE-/);
      expect(p.paperType).toBe("HGE");
      expect(getProdigiProduct(p.sku)).toBeTruthy();
    }
  });
  it("the secondary description is the spec's Hahnemühle German Etching / 310gsm · Textured matte · Giclée", () => {
    expect(MATERIAL_INFO["german-etching"].stockLabel).toBe("Hahnemühle German Etching");
    expect(MATERIAL_INFO["german-etching"].finish).toBe("310gsm · Textured matte · Giclée");
  });
});

describe("(3) Photo Rag cannot be selected for a NEW variant", () => {
  it("no Photo Rag SKU is offered for new variants", () => {
    expect(offeredProductsForMaterial("photo-rag")).toEqual([]);
    expect(isSkuOfferedForNewVariant("GLOBAL-HPR-16X20")).toBe(false);
    expect(isSkuOfferedForNewVariant("GLOBAL-HPR-A3")).toBe(false);
  });
  it("Fine Art Paper's offered list excludes photo-rag entirely", () => {
    expect(offeredMaterialsForCategory("fine-art-paper")).not.toContain("photo-rag");
  });
});

describe("(4) historical Photo Rag data still renders + resolves safely", () => {
  it("HPR SKUs still resolve to a verified product (orders/variants/fulfilment unbroken)", () => {
    const hpr = getProdigiProduct("GLOBAL-HPR-A3");
    expect(hpr).toBeTruthy();
    expect(hpr!.material).toBe("photo-rag");
    // Still active for launch, so an already-enabled historical variant stays valid/purchasable.
    expect(isActiveLaunchSku("GLOBAL-HPR-A3")).toBe(true);
  });
  it("Photo Rag still has display metadata to render", () => {
    expect(MATERIAL_INFO["photo-rag"].stockLabel).toBe("Hahnemühle Photo Rag");
    expect(MATERIAL_CATEGORY["photo-rag"]).toBe("fine-art-paper");
  });
});

// The verified sandbox print-area PIXELS for the five launch canvas SKUs (include the wrap bleed).
const CANVAS_PRINT_AREA: Record<string, [number, number]> = {
  "GLOBAL-CAN-A3": [3561, 5013],
  "GLOBAL-CAN-12X16": [3654, 4854],
  "GLOBAL-CAN-16X20": [4854, 6054],
  "GLOBAL-CAN-18X24": [5454, 7254],
  "GLOBAL-CAN-24X36": [7254, 10854],
};

describe("(5) Canvas maps only to verified GLOBAL-CAN SKUs", () => {
  it("Canvas is now offered (five verified sandbox SKUs)", () => {
    expect(categoryOfferedForNewVariants("canvas")).toBe(true);
    expect(offeredMaterialsForCategory("canvas")).toEqual(["stretched-canvas"]);
    expect(getProdigiProduct("GLOBAL-CAN-16X20")).toBeTruthy();
    // A canvas SKU that is NOT in the verified set still does not resolve (nothing invented).
    expect(getProdigiProduct("GLOBAL-CAN-8X10")).toBeUndefined();
  });
  it("exactly the FIVE launch Canvas sizes, all verified GLOBAL-CAN / CAN / stretched-canvas + MirrorWrap", () => {
    const skus = offeredProductsForMaterial("stretched-canvas").map((p) => p.sku).sort();
    expect(skus).toEqual(["GLOBAL-CAN-12X16", "GLOBAL-CAN-16X20", "GLOBAL-CAN-18X24", "GLOBAL-CAN-24X36", "GLOBAL-CAN-A3"]);
    expect(CANVAS_LAUNCH_PRODUCTS).toHaveLength(5);
    for (const p of CANVAS_LAUNCH_PRODUCTS) {
      expect(p.material).toBe("stretched-canvas");
      expect(p.paperType).toBe("CAN");
      expect(p.substrateGsm).toBe(400);
      expect(p.sku).toMatch(/^GLOBAL-CAN-/);
      expect(p.requiredAttributes?.wrap).toBe(DEFAULT_CANVAS_WRAP);
      expect(DEFAULT_CANVAS_WRAP).toBe("MirrorWrap");
    }
  });
  it("carries the EXACT verified sandbox print-area pixel dimensions (never invented)", () => {
    for (const [sku, [w, h]] of Object.entries(CANVAS_PRINT_AREA)) {
      const p = getProdigiProduct(sku)!;
      expect(p).toBeTruthy();
      expect([p.printAreaWidthPx, p.printAreaHeightPx]).toEqual([w, h]);
    }
  });
  it("stretched-canvas belongs to the Canvas category", () => {
    expect(MATERIAL_CATEGORY["stretched-canvas"]).toBe("canvas");
    expect(MATERIAL_INFO["stretched-canvas"].stockLabel).toBe("Stretched Canvas");
  });
});

describe("launch assortment is EXACTLY 5 sizes per material", () => {
  it("Fine Art Paper (German Etching): exactly the 5 launch sizes", () => {
    const skus = offeredProductsForMaterial("german-etching").map((p) => p.sku).sort();
    expect(skus).toEqual(["GLOBAL-HGE-12X16", "GLOBAL-HGE-16X20", "GLOBAL-HGE-18X24", "GLOBAL-HGE-A2", "GLOBAL-HGE-A3"]);
    expect(skus).toHaveLength(5);
  });
  it("Canvas (Stretched Canvas): exactly the 5 launch sizes", () => {
    const skus = offeredProductsForMaterial("stretched-canvas").map((p) => p.sku).sort();
    expect(skus).toEqual(["GLOBAL-CAN-12X16", "GLOBAL-CAN-16X20", "GLOBAL-CAN-18X24", "GLOBAL-CAN-24X36", "GLOBAL-CAN-A3"]);
    expect(skus).toHaveLength(5);
  });
});

describe("(7)/(10) Canvas required attributes (wrap) flow into quote + order payloads", () => {
  it("the canvas material carries the wrap as its required catalogue attribute", () => {
    expect(defaultAttributesForMaterial("stretched-canvas")).toEqual({ wrap: DEFAULT_CANVAS_WRAP });
    // Every verified canvas SKU resolves its required wrap from the catalogue.
    for (const p of CANVAS_LAUNCH_PRODUCTS) {
      expect(requiredAttributesForSku(p.sku)).toEqual({ wrap: "MirrorWrap" });
    }
    // Paper carries no required attribute.
    expect(defaultAttributesForMaterial("german-etching")).toEqual({});
    expect(requiredAttributesForSku("GLOBAL-HGE-A3")).toEqual({});
  });
  it("(10) a canvas quote request carries the wrap attribute (production cost via the real quote API)", () => {
    const req = buildPrintQuoteRequest({
      prodigiSku: "GLOBAL-CAN-16X20", copies: 1, country: "DE", currency: "EUR",
      attributes: defaultAttributesForMaterial("stretched-canvas"),
    });
    expect(req.items[0].attributes).toEqual({ wrap: DEFAULT_CANVAS_WRAP });
    expect(req.destinationCountryCode).toBe("DE");
  });
});

describe("(11) public-facing labels never expose Prodigi / SKU / cost / margin / wrap", () => {
  it("category + material labels are clean plain language", () => {
    const strings = [
      ...Object.values(CATEGORY_LABEL),
      ...Object.values(MATERIAL_INFO).flatMap((i) => [i.stockLabel, i.finish]),
    ];
    for (const s of strings) {
      expect(s).not.toMatch(/prodigi|GLOBAL-|\bHGE\b|\bHPR\b|\bCAN\b|\bsku\b|margin|production cost|MirrorWrap|ImageWrap|\bwrap\b/i);
    }
  });
});

describe("(9) the DEFAULT_CANVAS_WRAP is a mirror wrap (no important content cropped onto the sides)", () => {
  it("defaults to MirrorWrap — the full composition stays on the visible face", () => {
    expect(DEFAULT_CANVAS_WRAP).toBe("MirrorWrap");
  });
});
