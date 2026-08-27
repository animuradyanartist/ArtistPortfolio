/**
 * DATAFORSEO COST CONTROL (Phase 10) — the pure policy behind "don't pay twice for the same data".
 *
 * Every DataForSEO call is keyed deterministically (endpoint + normalized params) so an identical
 * request within its TTL is served from cache instead of billed again (dedup). TTLs are matched to
 * how fast each data type actually changes, which also defines the job cadence:
 *   • keyword volume/CPC/difficulty/intent — slow-moving → WEEKLY (cheap Labs, bulk).
 *   • priority SERP ranks — → WEEKLY-ish (expensive live SERP, priority keywords only).
 *   • competitor / discovery data — → MONTHLY.
 * The raw response is stored so it can be re-analysed later WITHOUT paying again.
 *
 * Pure + shared + unit-tested. The DB-backed store lives in server/seo/seoCache.ts.
 */

export type SeoDataType =
  | "keyword_overview" // volume, cpc, competition, difficulty, intent (cheap, bulk, weekly)
  | "serp_organic" // who ranks for one keyword (expensive, priority-only)
  | "ranked_keywords" // a domain's ranked keywords (discovery, monthly)
  | "competitors_domain" // competitor domains (discovery, monthly)
  | "keyword_ideas"; // keyword expansion (on-demand)

/** Hours a cached response stays fresh, matched to how fast the data actually changes. */
export const TTL_HOURS: Record<SeoDataType, number> = {
  keyword_overview: 168, // 7 days
  serp_organic: 96, // 4 days — a weekly rank job refetches; same-week re-requests dedup
  ranked_keywords: 720, // 30 days
  competitors_domain: 720, // 30 days
  keyword_ideas: 720, // 30 days
};

/** Rough cost tier so usage reporting can separate cheap recurring checks from expensive research. */
export const COST_TIER: Record<SeoDataType, "cheap" | "expensive"> = {
  keyword_overview: "cheap",
  ranked_keywords: "cheap",
  competitors_domain: "cheap",
  keyword_ideas: "cheap",
  serp_organic: "expensive",
};

/** Deterministic cache key: identical logical requests collapse to the same key (→ dedup). */
export function cacheKey(dataType: SeoDataType, params: Record<string, unknown>): string {
  const norm = Object.keys(params)
    .sort()
    .map((k) => {
      let v = params[k];
      if (Array.isArray(v)) v = [...v].map((x) => String(x).toLowerCase().trim()).sort().join(",");
      else if (typeof v === "string") v = v.toLowerCase().trim();
      return `${k}=${v}`;
    })
    .join("&");
  return `${dataType}::${norm}`;
}

/** Is a cached row still fresh? `fetchedAt`/`now` are epoch ms. */
export function isFresh(dataType: SeoDataType, fetchedAtMs: number, nowMs: number): boolean {
  const ttlMs = TTL_HOURS[dataType] * 3600 * 1000;
  return nowMs - fetchedAtMs < ttlMs;
}

export interface CacheDecision {
  hit: boolean;
  reason: "fresh" | "stale" | "missing";
}

/** Decide whether to serve cache or call the API — the single dedup gate. */
export function decideCache(
  dataType: SeoDataType,
  cached: { fetchedAtMs: number } | null,
  nowMs: number,
): CacheDecision {
  if (!cached) return { hit: false, reason: "missing" };
  return isFresh(dataType, cached.fetchedAtMs, nowMs)
    ? { hit: true, reason: "fresh" }
    : { hit: false, reason: "stale" };
}

/** The recommended job cadence per data type — for the cost-control schedule. */
export const JOB_CADENCE: Record<SeoDataType, "daily" | "weekly" | "monthly" | "on-demand"> = {
  serp_organic: "weekly", // priority ranks only
  keyword_overview: "weekly",
  ranked_keywords: "monthly",
  competitors_domain: "monthly",
  keyword_ideas: "on-demand",
};
