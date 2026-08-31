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

describe("(5) Canvas maps only to verified GLOBAL-CAN SKUs", () => {
  it("no unverified canvas SKU exists in the registry (nothing invented)", () => {
    // Until discovery runs, canvas has no verified rows and is not offered/purchasable.
    expect(CANVAS_LAUNCH_PRODUCTS.length).toBe(0);
    expect(categoryOfferedForNewVariants("canvas")).toBe(false);
    expect(getProdigiProduct("GLOBAL-CAN-16X20")).toBeUndefined();
  });
  it("EVERY canvas row (when present) is a verified GLOBAL-CAN / CAN / stretched-canvas product", () => {
    for (const p of CANVAS_LAUNCH_PRODUCTS) {
      expect(p.material).toBe("stretched-canvas");
      expect(p.paperType).toBe("CAN");
      expect(p.sku).toMatch(/^GLOBAL-CAN-/);
      expect(p.printAreaWidthPx).toBeGreaterThan(0);
      expect(p.printAreaHeightPx).toBeGreaterThan(0);
      expect(p.requiredAttributes?.wrap).toBe(DEFAULT_CANVAS_WRAP);
    }
  });
  it("stretched-canvas belongs to the Canvas category", () => {
    expect(MATERIAL_CATEGORY["stretched-canvas"]).toBe("canvas");
    expect(MATERIAL_INFO["stretched-canvas"].stockLabel).toBe("Stretched Canvas");
  });
});

describe("(7)/(10) Canvas required attributes (wrap) flow into quote + order payloads", () => {
  it("the canvas material carries the wrap as its required catalogue attribute", () => {
    expect(defaultAttributesForMaterial("stretched-canvas")).toEqual({ wrap: DEFAULT_CANVAS_WRAP });
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
