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
  materialCategoryLabel,
  type SelectorOption,
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

describe("categoryOfMaterial", () => {
  it("maps stocks to their customer-facing category", () => {
    expect(categoryOfMaterial("german-etching")).toBe("fine-art-paper");
    expect(categoryOfMaterial("stretched-canvas")).toBe("canvas");
    expect(categoryOfMaterial("photo-rag")).toBe("fine-art-paper"); // historical stock still maps sanely
  });
});
