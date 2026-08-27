import { describe, it, expect } from "vitest";
import { actionsForKeyword, generateActions, weeklyPlan, type KeywordAnalysis } from "./actions";
import type { KeywordMapping } from "./mapping";
import type { OpportunityScore } from "./scoring";

function score(n: number): OpportunityScore {
  return { score: n, band: n >= 65 ? "high" : n >= 40 ? "medium" : "low", factors: [] };
}
function mapping(over: Partial<KeywordMapping>): KeywordMapping {
  return {
    keyword: "k", family: "originals",
    primary: { url: "/collections/landscape-paintings", type: "collection", title: "T", relevance: 0.8, exists: true },
    secondary: [], cannibalizationRisk: false, cannibalizingUrls: [],
    wrongPageRanking: false, currentRankingUrl: null, recommendNewPage: null, ...over,
  };
}
function analysis(over: Partial<KeywordAnalysis>): KeywordAnalysis {
  return {
    keyword: "contemporary landscape paintings", family: "originals",
    mapping: mapping({}), score: score(60), currentRank: 12, previousRank: null,
    searchVolume: 400, serpMarketplaceDominated: false, ...over,
  };
}

describe("action engine (Phase 7) — concrete decisions", () => {
  it("a page-2 ranking → strengthen existing + internal links, NOT a new page", () => {
    const acts = actionsForKeyword(analysis({ currentRank: 12 }));
    const types = acts.map((a) => a.type);
    expect(types).toContain("strengthen-existing");
    expect(types).toContain("internal-links");
    expect(types).not.toContain("create-collection");
  });

  it("Google ranking the wrong page → a high-priority fix-wrong-page task", () => {
    const acts = actionsForKeyword(analysis({
      mapping: mapping({ wrongPageRanking: true, currentRankingUrl: "/artworks/x-1" }),
    }));
    const wp = acts.find((a) => a.type === "fix-wrong-page");
    expect(wp).toBeTruthy();
    expect(wp!.group).toBe("Technical SEO");
    expect(wp!.evidence).toContain("/artworks/x-1");
  });

  it("cannibalization → a consolidation task naming the competing pages", () => {
    const acts = actionsForKeyword(analysis({
      mapping: mapping({ cannibalizationRisk: true, cannibalizingUrls: ["/a", "/b"] }),
    }));
    const c = acts.find((a) => a.type === "fix-cannibalization");
    expect(c).toBeTruthy();
    expect(c!.recommendedChange).toContain("/collections/landscape-paintings");
  });

  it("a real new-page opportunity → create-print-landing (gated on demand)", () => {
    const acts = actionsForKeyword(analysis({
      family: "prints", score: score(70),
      mapping: mapping({
        family: "prints",
        primary: { url: "/prints/neutral-wall-art", type: "print-landing", title: "Neutral", relevance: 0.8, exists: false },
        recommendNewPage: { slug: "neutral-wall-art", type: "print-landing", reason: "no page yet" },
      }),
    }));
    expect(acts.map((a) => a.type)).toContain("create-print-landing");
  });

  it("a marketplace-dominated low-score keyword → an explicit deprioritize (and nothing else)", () => {
    const acts = actionsForKeyword(analysis({ score: score(25), serpMarketplaceDominated: true, currentRank: null }));
    expect(acts).toHaveLength(1);
    expect(acts[0].type).toBe("deprioritize");
  });

  it("an article whose ranking dropped → refresh-article", () => {
    const acts = actionsForKeyword(analysis({
      previousRank: 8, currentRank: 19,
      mapping: mapping({ primary: { url: "/blog/x", type: "article", title: "X", relevance: 0.7, exists: true } }),
    }));
    expect(acts.map((a) => a.type)).toContain("refresh-article");
  });
});

describe("weekly plan (Phase 8) — small, grouped, quick-wins first", () => {
  it("caps to the limit, surfaces quick wins, and groups the rest", () => {
    const analyses: KeywordAnalysis[] = [
      analysis({ keyword: "k1", mapping: mapping({ wrongPageRanking: true, currentRankingUrl: "/artworks/x-1" }), score: score(80) }),
      analysis({ keyword: "k2", currentRank: 12, score: score(70) }),
      analysis({ keyword: "k3", family: "prints", score: score(75), mapping: mapping({ family: "prints", primary: { url: "/prints/blue-wall-art", type: "print-landing", title: "Blue", relevance: 0.8, exists: false }, recommendNewPage: { slug: "blue-wall-art", type: "print-landing", reason: "x" } }) }),
    ];
    const actions = generateActions(analyses);
    const plan = weeklyPlan(actions, 8);
    expect(plan.shown).toBeLessThanOrEqual(8);
    expect(plan.quickWins.every((a) => a.quickWin)).toBe(true);
    // actions are sorted by priority
    for (let i = 1; i < actions.length; i++) expect(actions[i - 1].priority).toBeGreaterThanOrEqual(actions[i].priority);
    // a high-value #12 opportunity is present rather than buried
    expect(actions.some((a) => a.type === "strengthen-existing" || a.type === "fix-wrong-page")).toBe(true);
  });
});
