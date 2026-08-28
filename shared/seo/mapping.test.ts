import { describe, it, expect } from "vitest";
import { mapKeyword, relevance, type MappingCatalogue } from "./mapping";

const cat: MappingCatalogue = {
  artworks: [
    { id: 69, title: "Road to Tuscany", category: "landscape", medium: "Oil on canvas", availability: "available", availableForPrint: true },
    { id: 70, title: "A Sign in the Distance", category: "landscape", medium: "Oil on canvas", availability: "available" },
    { id: 42, title: "Blue Detachment", category: "figurative", medium: "Oil on canvas", availability: "available" },
    { id: 55, title: "Beyond Every Limit", category: "landscape", medium: "Oil on canvas", availability: "sold" },
  ],
  collections: [{ slug: "landscape-paintings", heading: "Contemporary Landscape Paintings" }],
  prints: [{ slug: "road-to-tuscany", title: "Road to Tuscany", purchasable: false }],
  articles: [{ slug: "how-to-choose-landscape-art", title: "How to Choose Landscape Art for a Living Room" }],
};

describe("keyword → page mapping (Phase 3)", () => {
  it("maps a category keyword to the collection page, not a single artwork", () => {
    const m = mapKeyword("contemporary landscape paintings", cat);
    expect(m.family).toBe("originals");
    expect(m.primary?.type).toBe("collection");
    expect(m.primary?.url).toBe("/collections/landscape-paintings");
  });

  it("maps a specific artwork phrase to that artwork's canonical URL", () => {
    const m = mapKeyword("road to tuscany painting", cat);
    expect(m.primary?.type).toBe("artwork");
    expect(m.primary?.url).toContain("road-to-tuscany-69");
  });

  it("maps a print/decor keyword into the prints space", () => {
    const m = mapKeyword("blue wall art", cat);
    expect(m.family).toBe("prints");
    expect(["print-landing", "print-pdp", "prints-index"]).toContain(m.primary?.type);
  });

  it("recommends a NEW print landing page when the best target doesn't exist", () => {
    const m = mapKeyword("neutral wall art", cat);
    expect(m.primary?.type).toBe("print-landing");
    expect(m.primary?.exists).toBe(false);
    expect(m.recommendNewPage).not.toBeNull();
    expect(m.recommendNewPage?.type).toBe("print-landing");
  });

  it("recommends a trade landing page for designer intent", () => {
    const m = mapKeyword("art for interior designers", cat);
    expect(m.family).toBe("trade");
    expect(m.primary?.type).toBe("trade-landing");
    expect(m.recommendNewPage?.type).toBe("trade-landing");
  });

  it("detects cannibalization when several same-type pages compete", () => {
    // "landscape oil painting" matches 3 landscape artworks (69, 70, 55) strongly.
    const m = mapKeyword("landscape oil painting", cat);
    expect(m.cannibalizationRisk).toBe(true);
    expect(m.cannibalizingUrls.length).toBeGreaterThanOrEqual(2);
  });

  it("detects when Google ranks the WRONG page", () => {
    const m = mapKeyword("contemporary landscape paintings", cat, { currentRankingUrl: "/artworks/road-to-tuscany-69" });
    expect(m.primary?.url).toBe("/collections/landscape-paintings");
    expect(m.wrongPageRanking).toBe(true);
  });

  it("does NOT flag wrong page when Google ranks the correct target", () => {
    const m = mapKeyword("contemporary landscape paintings", cat, { currentRankingUrl: "/collections/landscape-paintings" });
    expect(m.wrongPageRanking).toBe(false);
  });

  it("relevance is transparent: full keyword containment scores highest", () => {
    expect(relevance("blue wall art", "Blue Wall Art Prints")).toBeGreaterThan(relevance("blue wall art", "Green Framed Poster"));
    expect(relevance("blue wall art", "Green Framed Poster")).toBe(0);
  });
});
