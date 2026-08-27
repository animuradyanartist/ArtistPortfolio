import { describe, it, expect } from "vitest";
import { opportunityScore, type ScoreInput } from "./scoring";

const base: ScoreInput = {
  searchVolume: 500, cpc: 1.2, competition: 0.3, difficulty: 30, intent: "commercial",
  currentRank: 12, hasSuitableTarget: true, targetRelevance: 0.8, serpIndependentShare: 0.6,
};

describe("opportunity score (Phase 5) — transparent, favours realistic wins", () => {
  it("returns 0..100 with a factor breakdown that sums to the score", () => {
    const r = opportunityScore(base);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    const sum = Math.round(r.factors.reduce((s, f) => s + f.contribution, 0));
    expect(r.score).toBe(sum);
    expect(r.factors.map((f) => f.name)).toContain("Winnable SERP");
    expect(r.factors.map((f) => f.name)).toContain("Rank proximity");
  });

  it("prefers a winnable mid-volume #13 over a huge-volume marketplace-owned term", () => {
    const winnable = opportunityScore({ ...base, searchVolume: 300, currentRank: 13, difficulty: 25, serpIndependentShare: 0.7 });
    const dominated = opportunityScore({ ...base, searchVolume: 10000, currentRank: null, difficulty: 85, serpIndependentShare: 0.05, cpc: 3 });
    expect(winnable.score).toBeGreaterThan(dominated.score);
  });

  it("rewards page-2 (#11–20) proximity as the highest-leverage rank band", () => {
    const page2 = opportunityScore({ ...base, currentRank: 12 }).score;
    const alreadyTop = opportunityScore({ ...base, currentRank: 2 }).score;
    const farBack = opportunityScore({ ...base, currentRank: 80 }).score;
    expect(page2).toBeGreaterThan(alreadyTop);
    expect(page2).toBeGreaterThan(farBack);
  });

  it("penalises a missing target page but does not zero the opportunity (it's a new-page signal)", () => {
    const withTarget = opportunityScore({ ...base }).score;
    const noTarget = opportunityScore({ ...base, hasSuitableTarget: false, targetRelevance: 0.3 }).score;
    expect(noTarget).toBeLessThan(withTarget);
    expect(noTarget).toBeGreaterThan(0);
  });

  it("falls back to competition when keyword difficulty is absent", () => {
    const r = opportunityScore({ ...base, difficulty: null, competition: 0.9 });
    expect(r.factors.find((f) => f.name === "Beatable difficulty")?.note).toMatch(/competition/i);
  });

  it("bands the score", () => {
    expect(opportunityScore({ ...base, serpIndependentShare: 0.9, currentRank: 12, difficulty: 15 }).band).toBe("high");
    expect(opportunityScore({ ...base, serpIndependentShare: 0.02, difficulty: 95, currentRank: null, intent: "informational", searchVolume: 10, cpc: 0, hasSuitableTarget: false, targetRelevance: 0.1 }).band).toBe("low");
  });
});
