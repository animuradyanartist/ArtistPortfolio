/**
 * The feed must never leak a non-sellable product. These prove that a disabled, ineligible,
 * unpriced, or asset-less variant is excluded, that a good one is included with print (not
 * Singulart) pricing, and that the TSV is well-formed.
 */
import { describe, it, expect } from "vitest";
import { variantToFeedRow, buildFeedTsv, sellableCount, type FeedVariantInput } from "./printFeed";

const v = (over: Partial<FeedVariantInput> = {}): FeedVariantInput => ({
  variantId: 10,
  printSlug: "road-to-tuscany",
  artworkTitle: "Road to Tuscany",
  material: "german-etching",
  sizeLabel: "M",
  widthCm: 50,
  heightCm: 60,
  framed: false,
  frameColour: null,
  retailMinor: 12000,
  currency: "EUR",
  printReadyAssetUrl: "https://cdn/x.jpg",
  mockupUrl: "https://cdn/mock.jpg",
  eligible: true,
  enabled: true,
  ...over,
});

describe("variantToFeedRow", () => {
  it("includes a genuinely sellable variant with print pricing + prints URL + UTM", () => {
    const row = variantToFeedRow(v(), "https://animuradyan.com/");
    expect(row).not.toBeNull();
    expect(row!.id).toBe("print-10");
    expect(row!.price).toBe("120.00 EUR");
    expect(row!.link).toContain("/prints/road-to-tuscany?variant=10");
    expect(row!.link).toContain("utm_source=pinterest");
    expect(row!.image_link).toBe("https://cdn/mock.jpg"); // prefers the mockup
    expect(row!.availability).toBe("in stock");
    expect(row!.brand).toBe("Ani Muradyan");
  });

  it("EXCLUDES disabled / ineligible / unpriced / asset-less variants", () => {
    expect(variantToFeedRow(v({ enabled: false }), "https://x")).toBeNull();
    expect(variantToFeedRow(v({ eligible: false }), "https://x")).toBeNull();
    expect(variantToFeedRow(v({ retailMinor: null }), "https://x")).toBeNull();
    expect(variantToFeedRow(v({ retailMinor: 0 }), "https://x")).toBeNull();
    expect(variantToFeedRow(v({ printReadyAssetUrl: null, mockupUrl: null }), "https://x")).toBeNull();
  });
});

describe("buildFeedTsv", () => {
  it("emits a header + one line per sellable variant, tab-separated, no stray newlines", () => {
    const tsv = buildFeedTsv([v({ variantId: 1 }), v({ variantId: 2, enabled: false }), v({ variantId: 3 })], "https://animuradyan.com");
    const lines = tsv.split("\n");
    expect(lines[0].split("\t")[0]).toBe("id");
    expect(lines).toHaveLength(3); // header + 2 sellable (the disabled one excluded)
    expect(lines[1].split("\t")).toHaveLength(10);
  });

  it("sellableCount matches", () => {
    expect(sellableCount([v(), v({ enabled: false }), v({ retailMinor: null })])).toBe(1);
  });
});
