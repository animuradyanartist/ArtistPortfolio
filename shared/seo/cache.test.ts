import { describe, it, expect } from "vitest";
import { cacheKey, isFresh, decideCache, TTL_HOURS, COST_TIER } from "./cache";

describe("DataForSEO cache/dedup policy (Phase 10)", () => {
  it("collapses identical logical requests to the same key (dedup), order-independent", () => {
    const a = cacheKey("keyword_overview", { keywords: ["Blue Wall Art", "giclée prints"], location_code: 2826, language_code: "en" });
    const b = cacheKey("keyword_overview", { location_code: 2826, keywords: ["giclée prints", "  blue wall art "], language_code: "en" });
    expect(a).toBe(b);
  });

  it("different params → different keys", () => {
    expect(cacheKey("serp_organic", { keyword: "blue wall art", location_code: 2826 }))
      .not.toBe(cacheKey("serp_organic", { keyword: "neutral wall art", location_code: 2826 }));
  });

  it("freshness respects the per-type TTL", () => {
    const now = 1_000_000_000_000;
    // keyword_overview TTL = 168h
    expect(isFresh("keyword_overview", now - 100 * 3600 * 1000, now)).toBe(true);
    expect(isFresh("keyword_overview", now - 200 * 3600 * 1000, now)).toBe(false);
    // serp is shorter (96h)
    expect(isFresh("serp_organic", now - 100 * 3600 * 1000, now)).toBe(false);
  });

  it("decideCache is the single dedup gate: fresh → hit, stale/missing → call", () => {
    const now = 2_000_000_000_000;
    expect(decideCache("keyword_overview", { fetchedAtMs: now - 3600_000 }, now)).toEqual({ hit: true, reason: "fresh" });
    expect(decideCache("keyword_overview", { fetchedAtMs: now - 200 * 3600_000 }, now)).toEqual({ hit: false, reason: "stale" });
    expect(decideCache("keyword_overview", null, now)).toEqual({ hit: false, reason: "missing" });
  });

  it("separates cheap recurring checks from the expensive SERP call", () => {
    expect(COST_TIER.keyword_overview).toBe("cheap");
    expect(COST_TIER.serp_organic).toBe("expensive");
    // the expensive call has the shortest TTL AND is priority-only — never bulk discovery
    expect(TTL_HOURS.serp_organic).toBeLessThan(TTL_HOURS.ranked_keywords);
  });
});
