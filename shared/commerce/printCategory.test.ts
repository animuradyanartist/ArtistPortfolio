import { describe, it, expect } from "vitest";
import {
  CATEGORY_LABEL,
  MATERIAL_CATEGORY,
  MATERIAL_INFO,
  ALL_CATEGORIES,
  materialsForCategory,
  categoryHasVerifiedProducts,
  PRODIGI_LAUNCH_PRODUCTS,
} from "./prodigiProducts";

describe("customer-facing product category (Fine Art Paper / Canvas)", () => {
  it("(1) the primary label is plain-language and exposes NO Prodigi/paper-industry internals", () => {
    expect(CATEGORY_LABEL["fine-art-paper"]).toBe("Fine Art Paper");
    expect(CATEGORY_LABEL["canvas"]).toBe("Canvas");
    // Neither top-level category label mentions Prodigi, Hahnemühle, a SKU, or a paper code.
    for (const label of Object.values(CATEGORY_LABEL)) {
      expect(label).not.toMatch(/prodigi|hahnem|GLOBAL-|HGE|HPR|sku/i);
    }
  });

  it("(2) Hahnemühle stock is SECONDARY info under a category (never a top-level category)", () => {
    // Both current papers sit under Fine Art Paper.
    expect(MATERIAL_CATEGORY["german-etching"]).toBe("fine-art-paper");
    expect(MATERIAL_CATEGORY["photo-rag"]).toBe("fine-art-paper");
    // The stock name + a plain finish are the secondary detail.
    expect(MATERIAL_INFO["german-etching"]).toMatchObject({ category: "fine-art-paper", stockLabel: "Hahnemühle German Etching", finish: "Textured matte fine art paper" });
    expect(MATERIAL_INFO["photo-rag"]).toMatchObject({ category: "fine-art-paper", stockLabel: "Hahnemühle Photo Rag", finish: "Smooth cotton fine art paper" });
    // "Hahnemühle …" is never a category.
    expect(Object.values(CATEGORY_LABEL)).not.toContain("Hahnemühle German Etching");
  });

  it("(3) Canvas cannot be purchasable without a verified Prodigi canvas SKU", () => {
    expect(categoryHasVerifiedProducts("canvas")).toBe(false);
    expect(materialsForCategory("canvas")).toEqual([]);
    // No canvas product exists in the verified registry.
    expect(PRODIGI_LAUNCH_PRODUCTS.some((p) => MATERIAL_CATEGORY[p.material] === "canvas")).toBe(false);
    // Fine Art Paper, by contrast, is verified + purchasable.
    expect(categoryHasVerifiedProducts("fine-art-paper")).toBe(true);
    expect(materialsForCategory("fine-art-paper").sort()).toEqual(["german-etching", "photo-rag"]);
  });

  it("Canvas is architected (a stable category) even though disabled — the UI can list it", () => {
    expect(ALL_CATEGORIES).toContain("canvas");
    expect(ALL_CATEGORIES).toContain("fine-art-paper");
  });
});
