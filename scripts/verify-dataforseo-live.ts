/**
 * DATAFORSEO CONTROLLED LIVE VERIFICATION — the single, cheapest check. Calls ONLY
 * keyword_overview (Labs, the cheapest endpoint) for exactly 3 keywords, proves the cache dedups a
 * second identical request, and reports the real metrics + the raw shape so the parser can be
 * reconciled. It calls NO other endpoint (no SERP, no ranked_keywords, no competitors, no ideas, no
 * 25-keyword refresh) and never prints credentials or auth headers.
 *
 * RUN in the environment holding the secret (Replit Shell):  npx tsx scripts/verify-dataforseo-live.ts
 */

import { dataForSeoMode, dataForSeoConfigured, dataForSeo, extractKeywordOverviewItems } from "../server/seo/dataForSeoClient";
import { cachedFetch, usageSummary } from "../server/seo/seoStore";
import { hasDatabase, pool } from "../server/db";
import { SELF_HEAL_DDL } from "../server/selfHealDdl";

const KEYWORDS = ["original oil paintings", "contemporary landscape paintings", "original art for interiors"];

function line(s = "") { process.stdout.write(s + "\n"); }

/** The app's OWN additive self-heal for just the two cache/usage tables STEP 5 needs. Idempotent
 *  (CREATE ... IF NOT EXISTS). This is NOT db:push and drops/alters nothing. */
async function ensureCacheTables(): Promise<void> {
  const stmts = SELF_HEAL_DDL.filter((s) => /seo_api_cache|seo_api_usage/.test(s));
  for (const s of stmts) await pool.query(s);
}

async function main() {
  line("=== DataForSEO controlled live verification (keyword_overview ONLY) ===\n");

  // STEP 1 — credential detection (existence only; values never printed)
  line("STEP 1 — credentials present:");
  for (const n of ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD", "SEO_LOCATION_CODE", "SEO_LANGUAGE_CODE"]) {
    line(`  ${n}: ${process.env[n]?.trim() ? "SET" : "MISSING"}`);
  }
  line(`  mode=${dataForSeoMode()} configured=${dataForSeoConfigured()}`);
  if (!dataForSeoConfigured()) { line("\nNot configured — aborting (fails closed). Set DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD."); return; }

  const locationCode = Number(process.env.SEO_LOCATION_CODE) || 2826;
  const languageCode = process.env.SEO_LANGUAGE_CODE?.trim() || "en";
  line(`  market: location_code=${locationCode} language_code=${languageCode}`);

  if (hasDatabase) { try { await ensureCacheTables(); } catch (e) { line(`  (cache tables: ${(e as Error).message})`); } }
  else { line("  (no DATABASE_URL — STEP 5 cache proof needs the DB; run in the app environment)"); }

  const params = { keywords: KEYWORDS, location_code: locationCode, language_code: languageCode };

  // STEP 2 — first request goes LIVE through the cost-control gate (ONE paid call total).
  let cost: number | null = null;
  let rawResultDiag = "";
  let firstItem: unknown = null;
  const fetcher = async () => {
    const env = await dataForSeo.keywordOverview(KEYWORDS, locationCode, languageCode);
    cost = env.cost ?? null;
    const result = env?.tasks?.[0]?.result as unknown;
    rawResultDiag = `isArray=${Array.isArray(result)} length=${Array.isArray(result) ? result.length : "n/a"} result[0] keys=${(Array.isArray(result) && result[0]) ? Object.keys(result[0] as object).join(",") : "n/a"}`;
    const items = extractKeywordOverviewItems(env);
    firstItem = items[0] ?? (Array.isArray(result) ? result[0] : null);
    return { data: items, cost: env.cost ?? null };
  };

  line("\nSTEP 2 — first request (LIVE):");
  const first = await cachedFetch("keyword_overview", params, "/v3/dataforseo_labs/google/keyword_overview/live", fetcher);
  line(`  fromCache=${first.fromCache}   (expected false)`);
  line(`  API cost returned by DataForSEO=${cost}`);
  line(`  container shape: ${rawResultDiag}`);

  // STEP 3 — the real metrics our parser reads.
  line("\nSTEP 3 — real metrics per keyword:");
  const items = first.data as ReturnType<typeof extractKeywordOverviewItems>;
  for (const kw of KEYWORDS) {
    const it = items.find((x) => (x.keyword ?? "").toLowerCase() === kw.toLowerCase());
    if (!it) { line(`  "${kw}": (no item returned)`); continue; }
    line(`  "${kw}"`);
    line(`     search_volume      = ${it.keyword_info?.search_volume ?? "—"}`);
    line(`     cpc                = ${it.keyword_info?.cpc ?? "—"}`);
    line(`     competition        = ${it.keyword_info?.competition ?? "—"} (${it.keyword_info?.competition_level ?? "—"})`);
    line(`     keyword_difficulty = ${it.keyword_properties?.keyword_difficulty ?? "—"}`);
    line(`     main_intent        = ${it.search_intent_info?.main_intent ?? "—"}`);
  }

  // STEP 4 aid — raw first item so the parser/types can be reconciled against reality.
  line("\nSTEP 4 — raw first keyword item (for parser reconciliation):");
  line(JSON.stringify(firstItem, null, 2).slice(0, 3000));

  // STEP 5 — second IDENTICAL request must be a cache hit with NO paid call.
  line("\nSTEP 5 — second identical request (CACHE):");
  let secondHitApi = false;
  const second = await cachedFetch("keyword_overview", params, "/v3/dataforseo_labs/google/keyword_overview/live", async () => {
    secondHitApi = true; // if this runs, the cache failed to dedup
    const env = await dataForSeo.keywordOverview(KEYWORDS, locationCode, languageCode);
    return { data: extractKeywordOverviewItems(env), cost: env.cost ?? null };
  });
  line(`  fromCache=${second.fromCache}          (expected true)`);
  line(`  second request hit the paid API? ${secondHitApi}   (expected false)`);
  if (hasDatabase) {
    const u = await usageSummary();
    const ko = u.find((x) => x.dataType === "keyword_overview");
    line(`  seo_api_usage[keyword_overview] (30d): calls=${ko?.calls ?? 0} cacheHits=${ko?.cacheHits ?? 0} cost=${ko?.cost ?? 0}`);
  }

  line("\n=== done — ONLY keyword_overview was called; no other endpoint, no refresh ===");
}

main().catch((e) => { line(`FATAL: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`); process.exitCode = 1; });
