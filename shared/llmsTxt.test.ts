/**
 * THE FACTS HANDED TO AI ASSISTANTS — CORRECT, DERIVED, NON-PROMOTIONAL.
 *
 * AI assistants are already this site's largest referral source, and they ground answers on
 * what they can retrieve. /llms.txt is the plain-language index they read. Two failures matter:
 * a number that drifts from the live catalogue (a price or count stated here but not on the
 * pages), and copy that reads as manipulation rather than fact. These pin the first: every
 * figure comes from the input, and the buyer questions are answered from real data.
 */
import { describe, it, expect } from "vitest";
import { buildLlmsTxt, type LlmsFactsInput } from "./llmsTxt";

const facts = (over: Partial<LlmsFactsInput> = {}): LlmsFactsInput => ({
  baseUrl: "https://animuradyan.com",
  totalWorks: 54,
  availableWorks: 35,
  landscapeAvailable: 23,
  figurativeAvailable: 12,
  largeAvailable: 13,
  priceMin: 200,
  priceMax: 6890,
  currency: "USD",
  mediums: ["Oil on Canvas", "Oil on Paper"],
  exhibitionCount: 10,
  latestExhibitionYear: 2024,
  bio: "Ani Muradyan is a contemporary oil painter.",
  statement: "I paint the quiet in a landscape.",
  collectionSlugs: [{ slug: "landscape-paintings", heading: "Contemporary Landscape Paintings" }],
  ...over,
});

describe("the facts are correct and derived", () => {
  const txt = buildLlmsTxt(facts());

  it("names the artist, medium, location and the commercial reality", () => {
    expect(txt).toContain("Ani Muradyan");
    expect(txt).toContain("Yerevan, Armenia");
    expect(txt).toContain("original");
    expect(txt).toMatch(/available to collectors worldwide/i);
  });

  it("states the live counts and price range verbatim from the input", () => {
    expect(txt).toContain("54 paintings, 35 currently available");
    expect(txt).toContain("23 landscape, 12 figurative");
    expect(txt).toContain("USD 200–USD 6,890");
  });

  it("points at the canonical buyer pages", () => {
    expect(txt).toContain("https://animuradyan.com/artworks");
    expect(txt).toContain("https://animuradyan.com/contact");
    expect(txt).toContain("https://animuradyan.com/collections/landscape-paintings");
  });

  it("answers the questions a buyer actually asks", () => {
    expect(txt).toMatch(/Are the paintings original\?/);
    expect(txt).toMatch(/How much do they cost\?/);
    expect(txt).toMatch(/ship internationally/i);
    expect(txt).toMatch(/commissions/i);
  });

  it("includes the artist's own bio and statement when present", () => {
    expect(txt).toContain("I paint the quiet in a landscape.");
  });
});

describe("it degrades honestly when data is thin", () => {
  it("says 'on request' rather than inventing a price when none is priced", () => {
    const txt = buildLlmsTxt(facts({ priceMin: null, priceMax: null }));
    expect(txt).toContain("on request");
    expect(txt).not.toMatch(/USD 0/);
  });

  it("omits the exhibition line when there are none", () => {
    const txt = buildLlmsTxt(facts({ exhibitionCount: 0, latestExhibitionYear: null }));
    expect(txt).not.toMatch(/shown in 0 exhibitions/);
  });

  it("collapses a single price to one figure, not a range", () => {
    const txt = buildLlmsTxt(facts({ priceMin: 1200, priceMax: 1200 }));
    expect(txt).toContain("USD 1,200.");
    expect(txt).not.toContain("USD 1,200–USD 1,200");
  });
});
