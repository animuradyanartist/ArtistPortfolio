/**
 * PUBLIC PDP SELECTOR — the customer picks Material (Fine Art Paper / Canvas) → Size, nothing else.
 * These tests lock that two-material architecture: the material dimension is the CATEGORY (never the
 * paper/canvas stock), the sizes change with the selected material, and no paper-stock selector exists.
 */

import { describe, it, expect } from "vitest";
import {
  categoryOfMaterial,
  publicMaterialCategories,
  sizesForCategory,
  seedSelection,
  firstOptionInCategory,
  retainedSizeOnCategoryChange,
  materialCategoryLabel,
  sizeOptionLabel,
  type SelectorOption,
  type SizeOption,
} from "./printSelector";

function opt(over: Partial<SelectorOption> = {}): SelectorOption {
  return { material: "german-etching", sizeLabel: "A3", framed: false, frameColour: null, state: "purchasable", ...over };
}

// A realistic PDP option set: German Etching paper sizes + Canvas sizes (both offered materials).
const PAPER = [
  opt({ material: "german-etching", sizeLabel: "A3" }),
  opt({ material: "german-etching", sizeLabel: "12×16 in" }),
  opt({ material: "german-etching", sizeLabel: "A2" }),
];
const CANVAS = [
  opt({ material: "stretched-canvas", sizeLabel: "16×20 in" }),
  opt({ material: "stretched-canvas", sizeLabel: "24×36 in" }),
];
const BOTH = [...PAPER, ...CANVAS];

describe("publicMaterialCategories — the Material buttons are categories, never paper stocks", () => {
  it("shows exactly Fine Art Paper + Canvas when both offered materials are present", () => {
    expect(publicMaterialCategories(BOTH)).toEqual(["fine-art-paper", "canvas"]);
    expect(BOTH.map((o) => materialCategoryLabel(categoryOfMaterial(o.material)))).not.toContain("Hahnemühle German Etching");
    expect([materialCategoryLabel("fine-art-paper"), materialCategoryLabel("canvas")]).toEqual(["Fine Art Paper", "Canvas"]);
  });
  it("shows ONLY Fine Art Paper when the print has no canvas variant (no dead Canvas button)", () => {
    expect(publicMaterialCategories(PAPER)).toEqual(["fine-art-paper"]);
  });
  it("shows ONLY Canvas when the print has no paper variant", () => {
    expect(publicMaterialCategories(CANVAS)).toEqual(["canvas"]);
  });
  it("returns categories (fine-art-paper / canvas), NOT stock ids — there is no paper-stock dimension", () => {
    const cats = publicMaterialCategories(BOTH);
    for (const c of cats) expect(["fine-art-paper", "canvas"]).toContain(c);
    expect(cats).not.toContain("german-etching");
    expect(cats).not.toContain("stretched-canvas");
    expect(cats).not.toContain("photo-rag");
  });
});

describe("sizesForCategory — sizes change with the selected material", () => {
  it("Fine Art Paper shows only paper sizes; Canvas shows only canvas sizes", () => {
    expect(sizesForCategory(BOTH, "fine-art-paper").map((s) => s.sizeLabel)).toEqual(["A3", "12×16 in", "A2"]);
    expect(sizesForCategory(BOTH, "canvas").map((s) => s.sizeLabel)).toEqual(["16×20 in", "24×36 in"]);
  });
  it("the two size lists differ (switching material changes the sizes)", () => {
    const paperSizes = sizesForCategory(BOTH, "fine-art-paper").map((s) => s.sizeLabel);
    const canvasSizes = sizesForCategory(BOTH, "canvas").map((s) => s.sizeLabel);
    expect(paperSizes).not.toEqual(canvasSizes);
  });
  it("deduplicates by size label (framed + unframed of one size collapse to one size button)", () => {
    const withFrames = [
      opt({ material: "german-etching", sizeLabel: "A3", framed: false }),
      opt({ material: "german-etching", sizeLabel: "A3", framed: true, frameColour: "black" }),
    ];
    expect(sizesForCategory(withFrames, "fine-art-paper")).toHaveLength(1);
  });
});

describe("seed + category switch pick a valid, purchasable-first option", () => {
  it("seeds to a purchasable option's category", () => {
    const mixed = [opt({ material: "german-etching", sizeLabel: "A3", state: "provisional" }), opt({ material: "stretched-canvas", sizeLabel: "16×20 in", state: "purchasable" })];
    expect(seedSelection(mixed)?.category).toBe("canvas");
  });
  it("firstOptionInCategory prefers a purchasable size in that category", () => {
    const cat = [opt({ material: "german-etching", sizeLabel: "A3", state: "provisional" }), opt({ material: "german-etching", sizeLabel: "A2", state: "purchasable" })];
    expect(firstOptionInCategory(cat, "fine-art-paper")?.sizeLabel).toBe("A2");
  });
});

describe("retainedSizeOnCategoryChange — never keep a variant from the previous material", () => {
  const opts = [
    opt({ material: "german-etching", sizeLabel: "A3" }),
    opt({ material: "german-etching", sizeLabel: "12×16 in" }),
    opt({ material: "stretched-canvas", sizeLabel: "16×20 in" }),
    opt({ material: "stretched-canvas", sizeLabel: "A3" }), // A3 also exists in canvas
  ];
  it("resets the size when it does not exist in the new material", () => {
    // Was on paper "12×16 in"; switching to Canvas (which has no "12×16 in") → reset.
    expect(retainedSizeOnCategoryChange(opts, "canvas", "12×16 in")).toBeNull();
  });
  it("keeps the size when the SAME size label exists in the new material", () => {
    // "A3" exists in both paper and canvas → keep it (it resolves to the canvas A3 variant).
    expect(retainedSizeOnCategoryChange(opts, "canvas", "A3")).toBe("A3");
  });
  it("resets when nothing was selected", () => {
    expect(retainedSizeOnCategoryChange(opts, "fine-art-paper", null)).toBeNull();
  });
});

describe("sizeOptionLabel — '{name} ({cm}) — {retail price}', no internals", () => {
  const o = (over: Partial<SizeOption> = {}): SizeOption => ({ sizeLabel: "A3", sizeName: "A3", widthCm: 29.7, heightCm: 42, priceMinor: 6900, currency: "USD", ...over });
  it("formats inch/name + cm + compact retail price", () => {
    expect(sizeOptionLabel(o())).toBe("A3 (29.7×42 cm) — $69");
    expect(sizeOptionLabel(o({ sizeName: "12×16 in", widthCm: 30.5, heightCm: 40.6, priceMinor: 6900 }))).toBe("12×16 in (30.5×40.6 cm) — $69");
    expect(sizeOptionLabel(o({ sizeName: "16×20 in", widthCm: 40.6, heightCm: 50.8, priceMinor: 8900 }))).toBe("16×20 in (40.6×50.8 cm) — $89");
  });
  it("keeps a fractional price when not whole", () => {
    expect(sizeOptionLabel(o({ priceMinor: 6950 }))).toBe("A3 (29.7×42 cm) — $69.50");
  });
  it("falls back to the size label + omits dims/price when absent", () => {
    expect(sizeOptionLabel({ sizeLabel: "M", currency: "USD" })).toBe("M");
  });
  it("never contains SKU / cost / margin / pixels / wrap / stock name", () => {
    const label = sizeOptionLabel(o({ sizeName: "16×20 in", widthCm: 40.6, heightCm: 50.8, priceMinor: 8900 }));
    expect(label).not.toMatch(/GLOBAL-|MirrorWrap|wrap|margin|Hahnem|px\b/i);
  });
});

describe("categoryOfMaterial", () => {
  it("maps stocks to their customer-facing category", () => {
    expect(categoryOfMaterial("german-etching")).toBe("fine-art-paper");
    expect(categoryOfMaterial("stretched-canvas")).toBe("canvas");
    expect(categoryOfMaterial("photo-rag")).toBe("fine-art-paper"); // historical stock still maps sanely
  });
});
