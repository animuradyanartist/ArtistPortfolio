/**
 * THE SHARED DATAFORSEO BUDGET — every paid call from this app is reserved first.
 *
 * ArtistPortfolio spends on the same DataForSEO account as Career OS and Scout. Its own
 * `seo_api_usage` table records spend for the admin view, but nothing stopped this app — or the
 * others — from exceeding the account's monthly cap, and nothing counted this app's spend against
 * it. The account's lifetime spend is already $0.39 higher than the shared ledger records.
 *
 * So `cachedFetch` now routes every cache miss through `withBudgetHold`, backed by the shared
 * Postgres functions (Career OS migration 0024, Scout db/dataforseo_budget.sql):
 *   reserve (atomic across apps) → call DataForSEO → settle with the API-reported cost
 *                                                  | mark uncertain (timeout / dropped / unreadable)
 *                                                  | release (DataForSEO refused the task: unbilled)
 *
 * FAILS CLOSED: with DataForSEO credentials but no budget configured, nothing is bought.
 * Access is the budget project's public anon key + this app's own client token (only its SHA-256
 * is stored). No database credentials of the other apps are involved.
 */
import { randomUUID } from "node:crypto";
import { DataForSeoApiError, DataForSeoNotConfiguredError } from "./dataForSeoClient";
import type { SeoDataType } from "@shared/seo/cache";

/** Reservations sit slightly above the published price; settle records the real cost. */
export const RESERVE_MARGIN = 1.1;

// Published prices (USD, checked 2026-09-14): Labs $0.012/task + $0.00012/item; live SERP
// $0.002 per 10 results. Items are projected from the REQUEST (keywords sent / limit asked), an
// upper bound on what is returned and billed.
const LABS_TASK = 0.012;
const LABS_ITEM = 0.00012;
const SERP_PER_10 = 0.002;

export function estimateCostUsd(dataType: SeoDataType, params: Record<string, unknown>): number {
  const n = (v: unknown, d: number) => (typeof v === "number" && v > 0 ? v : d);
  switch (dataType) {
    case "keyword_overview":
      return LABS_TASK + LABS_ITEM * (Array.isArray(params.keywords) ? params.keywords.length : 700);
    case "keyword_ideas":
      return LABS_TASK + LABS_ITEM * n(params.limit, 700);
    case "ranked_keywords":
      return LABS_TASK + LABS_ITEM * n(params.limit, 100);
    case "competitors_domain":
      return LABS_TASK + LABS_ITEM * n(params.limit, 20);
    case "serp_organic":
      return SERP_PER_10 * Math.ceil(n(params.depth, 20) / 10);
    default:
      return 0.1;
  }
}

export class DataForSeoBudgetError extends Error {
  constructor(message: string, readonly reason: string) {
    super(message);
    this.name = "DataForSeoBudgetError";
  }
}

interface BudgetConfig { url: string; anonKey: string; token: string }

export function budgetConfig(env: NodeJS.ProcessEnv = process.env): BudgetConfig | null {
  const url = env.DATAFORSEO_BUDGET_URL?.trim();
  const anonKey = env.DATAFORSEO_BUDGET_ANON_KEY?.trim();
  const token = env.DATAFORSEO_BUDGET_TOKEN?.trim();
  return url && anonKey && token ? { url, anonKey, token } : null;
}

async function rpc(cfg: BudgetConfig, fn: string, args: Record<string, unknown>, fetchImpl: typeof fetch): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetchImpl(`${cfg.url.replace(/\/+$/, "")}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: cfg.anonKey, authorization: `Bearer ${cfg.anonKey}`, "content-type": "application/json" },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new DataForSeoBudgetError("The shared DataForSEO budget is unreachable — nothing was bought.", "unreachable");
  }
  if (!res.ok) throw new DataForSeoBudgetError(`The shared DataForSEO budget returned HTTP ${res.status} — nothing was bought.`, "service_error");
  return (await res.json()) as Record<string, unknown>;
}

/** DataForSEO does not bill a task it refused with an error status; a request never sent cannot be billed. */
export function provablyNotCharged(err: unknown): boolean {
  if (err instanceof DataForSeoNotConfiguredError) return true;
  if (err instanceof DataForSeoApiError) {
    return (err.apiStatusCode !== null && err.apiStatusCode >= 40000) || err.statusCode === 401 || err.statusCode === 402;
  }
  return false;
}

export async function withBudgetHold<T>(
  dataType: SeoDataType,
  params: Record<string, unknown>,
  endpoint: string,
  fetcher: () => Promise<{ data: T; cost: number | null }>,
  opts: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {},
): Promise<{ data: T; cost: number | null; settled: boolean }> {
  const cfg = budgetConfig(opts.env);
  if (!cfg) {
    throw new DataForSeoBudgetError(
      "The shared DataForSEO budget is not configured (DATAFORSEO_BUDGET_URL / _ANON_KEY / _TOKEN) — nothing was bought.",
      "not_configured",
    );
  }
  const f = opts.fetchImpl ?? fetch;
  const holdId = randomUUID();
  const estimatedUsd = Number((estimateCostUsd(dataType, params) * RESERVE_MARGIN).toFixed(6));
  const reserved = await rpc(cfg, "dataforseo_budget_reserve", {
    p_token: cfg.token, p_hold_id: holdId, p_estimated_usd: estimatedUsd, p_endpoint: endpoint,
    p_request_key: dataType, p_max_total_usd: null, p_ttl_seconds: 900,
  }, f);
  if (!reserved.ok) {
    throw new DataForSeoBudgetError(`The shared DataForSEO budget refused this purchase (${String(reserved.reason)}) — nothing was bought.`, String(reserved.reason));
  }

  let out: { data: T; cost: number | null };
  try {
    out = await fetcher();
  } catch (err) {
    const fn = provablyNotCharged(err) ? "dataforseo_budget_release" : "dataforseo_budget_mark_uncertain";
    // Best effort: if this write fails, the hold expires into `uncertain` and keeps counting.
    await rpc(cfg, fn, { p_token: cfg.token, p_hold_id: holdId, p_note: (err as Error)?.message?.slice(0, 300) ?? "failed" }, f).catch(() => undefined);
    throw err;
  }

  const actual = typeof out.cost === "number" && Number.isFinite(out.cost) ? out.cost : estimatedUsd;
  const settled = await rpc(cfg, "dataforseo_budget_settle", {
    p_token: cfg.token, p_hold_id: holdId, p_actual_usd: actual,
    p_payload: { producer: "artist-portfolio-seo", dataType, estimated: typeof out.cost !== "number" },
  }, f).then((r) => Boolean(r.ok)).catch(() => false);
  return { ...out, settled };
}
