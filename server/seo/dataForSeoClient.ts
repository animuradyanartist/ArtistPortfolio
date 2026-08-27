/**
 * THE DATAFORSEO CLIENT — server-only, and it FAILS CLOSED.
 *
 * Mirrors prodigiClient/stripeClient: with no credentials set, `dataForSeoConfigured()` is false
 * and callers answer "SEO data is not configured" rather than throwing. Credentials are read at
 * CALL TIME (never at import), so adding DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD to the environment
 * and restarting is all that is needed — no rebuild.
 *
 * THE CREDENTIALS NEVER LEAVE THIS PROCESS. They are only ever the Basic-auth header; never logged,
 * never returned by a route, never sent to the client.
 *
 * COST DISCIPLINE IS BUILT IN. Every method is tagged with a COST TIER, and the two families are
 * deliberately separated so callers can reason about spend:
 *   • LABS endpoints (`/v3/dataforseo_labs/...`) read DataForSEO's aggregated database — cheap,
 *     bulk, one call covers many keywords. Used for recurring volume/CPC/difficulty/intent refresh.
 *   • LIVE SERP (`/v3/serp/google/organic/live/advanced`) is charged PER REQUEST — expensive. Used
 *     ONLY for the handful of priority keywords we actively rank-track, never for discovery.
 * Verified against the DataForSEO v3 docs (2026): base URL, Basic auth, JSON-array POST body,
 * Labs is live-only (no separate GET), location_code/language_code. No invented endpoints.
 */

const BASE_URL = "https://api.dataforseo.com";

export type CostTier = "labs-cheap" | "serp-expensive";

export type DataForSeoMode = "configured" | "unconfigured";

function creds(): { login: string; password: string } | null {
  const login = process.env.DATAFORSEO_LOGIN?.trim();
  const password = process.env.DATAFORSEO_PASSWORD?.trim();
  if (login && password && login.length > 2 && password.length > 4) return { login, password };
  return null;
}

export function dataForSeoMode(): DataForSeoMode {
  return creds() ? "configured" : "unconfigured";
}

/** True once both credentials are present. Callers gate real API use on this. */
export function dataForSeoConfigured(): boolean {
  return creds() !== null;
}

export class DataForSeoNotConfiguredError extends Error {
  constructor() {
    super("DataForSEO is not configured (no DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD).");
    this.name = "DataForSeoNotConfiguredError";
  }
}

export class DataForSeoApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly statusText: string,
    /** DataForSEO's own status_code inside the body (e.g. 40000+), when present. */
    readonly apiStatusCode: number | null,
    readonly body: unknown,
  ) {
    super(`DataForSEO ${statusCode} ${statusText}${apiStatusCode ? ` (api ${apiStatusCode})` : ""}`);
    this.name = "DataForSeoApiError";
  }
}

/** The narrow envelope every v3 response shares. */
export interface DfsEnvelope<T> {
  status_code: number;
  status_message: string;
  cost: number;
  tasks: Array<{
    status_code: number;
    status_message: string;
    result: T[] | null;
  }> | null;
}

/** The single point that sends the key. `body` is DataForSEO's JSON-ARRAY task list. */
async function call<T>(path: string, body: unknown[]): Promise<DfsEnvelope<T>> {
  const c = creds();
  if (!c) throw new DataForSeoNotConfiguredError();

  const auth = Buffer.from(`${c.login}:${c.password}`).toString("base64");
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  const apiStatus = (parsed as { status_code?: number } | null)?.status_code ?? null;
  // DataForSEO returns HTTP 200 with a body status_code even on logical errors; treat a
  // >= 40000 api status as an error too. NEVER include the auth header in the thrown error.
  if (!res.ok || (typeof apiStatus === "number" && apiStatus >= 40000)) {
    throw new DataForSeoApiError(res.status, res.statusText, apiStatus, parsed);
  }
  return parsed as DfsEnvelope<T>;
}

// ── Verified request/response shapes (only the fields we use) ──────────────────────────────

export interface DfsKeywordOverviewItem {
  keyword: string;
  location_code: number;
  language_code: string;
  keyword_info?: {
    search_volume?: number | null;
    cpc?: number | null;
    competition?: number | null; // 0..1
    competition_level?: string | null; // LOW | MEDIUM | HIGH
    monthly_searches?: Array<{ year: number; month: number; search_volume: number }> | null;
  } | null;
  keyword_properties?: {
    keyword_difficulty?: number | null; // 0..100
  } | null;
  search_intent_info?: {
    main_intent?: string | null; // informational | navigational | commercial | transactional
    foreign_intent?: string[] | null;
  } | null;
}

export interface DfsSerpItem {
  type: string; // organic | featured_snippet | people_also_ask | local_pack | ...
  rank_group?: number;
  rank_absolute?: number;
  domain?: string;
  url?: string;
  title?: string;
}

export interface DfsSerpResult {
  keyword: string;
  location_code: number;
  language_code: string;
  se_results_count?: number;
  items?: DfsSerpItem[] | null;
  item_types?: string[] | null;
}

/**
 * Extract the per-keyword items from a keyword_overview envelope, tolerant of the two real
 * DataForSEO container shapes: `tasks[0].result[0].items[]` and `tasks[0].result[]` being the items
 * directly. This handles container NESTING only — it invents no fields. The live verification
 * confirms which shape the account returns; both are handled so the first run can't come back empty.
 */
export function extractKeywordOverviewItems(env: DfsEnvelope<{ items?: DfsKeywordOverviewItem[] }>): DfsKeywordOverviewItem[] {
  const result = env?.tasks?.[0]?.result as unknown;
  if (!Array.isArray(result)) return [];
  const first = result[0] as { items?: DfsKeywordOverviewItem[]; keyword?: string } | undefined;
  if (first && Array.isArray(first.items)) return first.items;
  if (first && typeof first.keyword === "string") return result as DfsKeywordOverviewItem[];
  return [];
}

export interface DfsRankedKeywordsItem {
  keyword_data?: { keyword?: string; keyword_info?: { search_volume?: number | null } | null };
  ranked_serp_element?: { serp_item?: { rank_absolute?: number; url?: string; domain?: string } };
}

export interface DfsCompetitorItem {
  domain: string;
  avg_position?: number;
  intersections?: number; // shared keywords
  metrics?: unknown;
}

/**
 * The abstraction the rest of the SEO system uses. Nothing else builds a DataForSEO URL or sends
 * the credentials. Each method declares its COST TIER so callers/cost-control can reason about it.
 */
export const dataForSeo = {
  mode: dataForSeoMode,
  configured: dataForSeoConfigured,

  /** CHEAP · LABS. Bulk volume + CPC + competition + difficulty + intent for many keywords at once. */
  costTierOf(method: "keywordOverview" | "rankedKeywords" | "competitorsDomain" | "keywordIdeas" | "serpOrganic"): CostTier {
    return method === "serpOrganic" ? "serp-expensive" : "labs-cheap";
  },

  async keywordOverview(keywords: string[], locationCode: number, languageCode: string): Promise<DfsEnvelope<{ items?: DfsKeywordOverviewItem[]; items_count?: number }>> {
    return call("/v3/dataforseo_labs/google/keyword_overview/live", [
      { keywords, location_code: locationCode, language_code: languageCode },
    ]);
  },

  /** EXPENSIVE · LIVE SERP. Who ranks for ONE keyword — priority rank-tracking only. */
  async serpOrganic(keyword: string, locationCode: number, languageCode: string, depth = 20): Promise<DfsEnvelope<DfsSerpResult>> {
    return call("/v3/serp/google/organic/live/advanced", [
      { keyword, location_code: locationCode, language_code: languageCode, depth },
    ]);
  },

  /** CHEAP · LABS. Keywords a domain ranks for (self or competitor) — competitor-gap discovery. */
  async rankedKeywords(target: string, locationCode: number, languageCode: string, limit = 100): Promise<DfsEnvelope<{ items?: DfsRankedKeywordsItem[] }>> {
    return call("/v3/dataforseo_labs/google/ranked_keywords/live", [
      { target, location_code: locationCode, language_code: languageCode, limit },
    ]);
  },

  /** CHEAP · LABS. Domains that compete with a target in organic SERPs. */
  async competitorsDomain(target: string, locationCode: number, languageCode: string, limit = 20): Promise<DfsEnvelope<{ items?: DfsCompetitorItem[] }>> {
    return call("/v3/dataforseo_labs/google/competitors_domain/live", [
      { target, location_code: locationCode, language_code: languageCode, limit },
    ]);
  },

  /** CHEAP · LABS. Keyword ideas around seed keywords — ON-DEMAND discovery only (not recurring). */
  async keywordIdeas(keywords: string[], locationCode: number, languageCode: string, limit = 200): Promise<DfsEnvelope<{ items?: DfsKeywordOverviewItem[] }>> {
    return call("/v3/dataforseo_labs/google/keyword_ideas/live", [
      { keywords, location_code: locationCode, language_code: languageCode, limit },
    ]);
  },
};
