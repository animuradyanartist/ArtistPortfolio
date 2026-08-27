import { describe, it, expect } from "vitest";
import { classifyDomain, isBeatable, serpComposition, competitorGap, inferPageType } from "./competitors";

describe("competitor domain classification (Phase 6)", () => {
  it("classifies the strategic categories", () => {
    expect(classifyDomain("saatchiart.com")).toBe("marketplace");
    expect(classifyDomain("www.etsy.com")).toBe("marketplace");
    expect(classifyDomain("pinterest.co.uk")).toBe("social");
    expect(classifyDomain("houzz.com")).toBe("interior");
    expect(classifyDomain("architecturaldigest.com")).toBe("editorial");
    expect(classifyDomain("animuradyan.com")).toBe("own");
    expect(classifyDomain("some-independent-painter.art")).toBe("independent-artist");
    expect(classifyDomain("smithfineartgallery.com")).toBe("gallery");
  });

  it("knows which classes an artist site can realistically outrank", () => {
    expect(isBeatable("independent-artist")).toBe(true);
    expect(isBeatable("gallery")).toBe(true);
    expect(isBeatable("marketplace")).toBe(false);
    expect(isBeatable("social")).toBe(false);
  });
});

describe("SERP composition — winnability + our position", () => {
  const items = [
    { type: "organic", rank_absolute: 1, domain: "saatchiart.com", url: "https://saatchiart.com/x" },
    { type: "organic", rank_absolute: 2, domain: "etsy.com", url: "https://etsy.com/y" },
    { type: "organic", rank_absolute: 3, domain: "jane-doe-art.com", url: "https://jane-doe-art.com/land" },
    { type: "organic", rank_absolute: 4, domain: "smithgallery.com", url: "https://smithgallery.com/z" },
    { type: "organic", rank_absolute: 12, domain: "animuradyan.com", url: "https://animuradyan.com/artworks/x-1" },
    { type: "people_also_ask" },
    { type: "featured_snippet" },
  ];
  it("computes independent share, our rank, and SERP features", () => {
    const c = serpComposition(items);
    expect(c.total).toBe(5);
    expect(c.ownRank).toBe(12);
    expect(c.ownUrl).toContain("/artworks/x-1");
    // beatable = jane-doe-art (independent) + smithgallery (gallery) = 2 of 5
    expect(c.independentShare).toBeCloseTo(2 / 5, 5);
    expect(c.features).toEqual(expect.arrayContaining(["people_also_ask", "featured_snippet"]));
  });
});

describe("competitor gap (Phase 6) — structural, never text", () => {
  it("finds keywords a competitor covers that we don't + winning page patterns", () => {
    const rows = competitorGap(["blue wall art"], [
      {
        domain: "jane-doe-art.com",
        keywords: [
          { keyword: "blue wall art", rank: 5, url: "https://jane-doe-art.com/prints/blue" },
          { keyword: "neutral wall art", rank: 3, url: "https://jane-doe-art.com/prints/neutral" },
          { keyword: "living room art guide", rank: 8, url: "https://jane-doe-art.com/blog/living-room-art" },
          { keyword: "large wall art", rank: 6, url: "https://jane-doe-art.com/prints/large" },
        ],
      },
    ]);
    const r = rows[0];
    expect(r.domainClass).toBe("independent-artist");
    expect(r.beatable).toBe(true);
    expect(r.gapKeywords).toContain("neutral wall art");
    expect(r.gapKeywords).not.toContain("blue wall art"); // we already cover it
    expect(r.winningPagePatterns).toContain("print/wall-art page"); // repeated ≥2×
  });
});

describe("inferPageType — structural page classification", () => {
  it("classifies by URL pattern", () => {
    expect(inferPageType("https://x.com/prints/blue")).toBe("print/wall-art page");
    expect(inferPageType("https://x.com/blog/guide")).toBe("editorial/guide page");
    expect(inferPageType("https://x.com/collections/landscape")).toBe("collection/category page");
    expect(inferPageType("https://x.com/")).toBe("homepage");
  });
});
