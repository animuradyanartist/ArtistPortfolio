/**
 * PINTEREST KEYWORD RESEARCH — pulls REAL DataForSEO metrics for the art/wall-art/interiors seed set
 * across six English markets, and writes them to research/pinterest-keywords.csv for sorting.
 *
 * It invents NOTHING. Every number in the CSV is a value DataForSEO actually returned; a keyword the
 * API does not return is simply absent (never volume 0). It uses only the two CHEAP Labs endpoints
 * (keyword_overview + keyword_ideas) through the app's own cost-control cache, so a re-run is free
 * and never re-charges for unchanged data. It never prints credentials.
 *
 * RUN in the environment holding the secret (Replit Shell), where DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD
 * and DATABASE_URL are set:
 *
 *     npx tsx scripts/pinterest-keyword-research.ts
 *
 * COST: 6 markets × (1 keyword_overview + 1 keyword_ideas) = 12 Labs calls on a first run (Labs is the
 * cheap tier). Cached for 30–90 days, so re-runs cost nothing. The real per-call cost is printed.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dataForSeoConfigured, dataForSeoMode, dataForSeo, extractKeywordOverviewItems, type DfsKeywordOverviewItem } from "../server/seo/dataForSeoClient";
import { cachedFetch } from "../server/seo/seoStore";
import { hasDatabase } from "../server/db";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function line(s = "") { process.stdout.write(s + "\n"); }

// English markets, in the requested priority order. Codes are DataForSEO location_codes.
const MARKETS = [
  { name: "United States", code: 2840 },
  { name: "United Kingdom", code: 2826 },
  { name: "Germany", code: 2276 },
  { name: "France", code: 2250 },
  { name: "Canada", code: 2124 },
  { name: "Australia", code: 2036 },
] as const;
const LANGUAGE = "en";

// The seed universe: the requested categories + the long-tail buyer/decor combinations. These are the
// PHRASES we ask DataForSEO about — the metrics come back from the API, never from here.
const SEEDS: string[] = [
  // commercial / product
  "fine art prints", "art prints", "giclee prints", "contemporary art prints", "giclee art prints",
  "large fine art prints", "buy art prints", "original paintings for sale", "original landscape painting",
  "contemporary landscape painting",
  // landscape / seascape / coastal
  "landscape art", "landscape prints", "seascape art", "seascape prints", "coastal wall art",
  "modern coastal wall art", "ocean fine art prints", "large landscape wall art", "neutral landscape wall art",
  "calming landscape wall art", "serene landscape art", "contemporary landscape prints", "modern seascape prints",
  "minimalist landscape prints", "minimalist landscape art", "modern landscape art",
  // blue
  "blue wall art", "blue artwork", "blue coastal wall art", "blue coastal art prints", "large blue wall art",
  "blue art for living room", "modern blue wall art",
  // interiors / decor
  "modern wall art", "large wall art", "art for living room", "art for bedroom", "calming wall art",
  "serene wall art", "statement wall art", "large wall art for living room", "minimalist wall art",
];

// A focused subset used to seed keyword_ideas expansion (broad seeds dilute the ideas; these are the
// buyer/decor anchors most likely to surface commercially-useful long tails).
const IDEA_SEEDS: string[] = [
  "fine art prints", "coastal wall art", "blue wall art", "landscape prints",
  "seascape art", "large wall art for living room", "minimalist landscape art",
];

interface Row {
  keyword: string;
  market: string;
  locationCode: number;
  source: "seed" | "idea";
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;        // 0..1 ad-auction competition (NOT organic difficulty)
  competitionLevel: string | null;   // LOW | MEDIUM | HIGH
  mainIntent: string | null;         // informational | commercial | transactional | navigational
  trendLast12: string;               // last up-to-12 monthly volumes, ";"-joined (real values only)
}

function toRow(it: DfsKeywordOverviewItem, market: string, code: number, source: "seed" | "idea"): Row | null {
  const keyword = (it.keyword ?? "").trim();
  if (!keyword) return null;
  const ki = it.keyword_info ?? undefined;
  const months = Array.isArray(ki?.monthly_searches) ? ki!.monthly_searches!.slice(-12) : [];
  return {
    keyword, market, locationCode: code, source,
    searchVolume: ki?.search_volume ?? null,
    cpc: ki?.cpc ?? null,
    competition: ki?.competition ?? null,
    competitionLevel: ki?.competition_level ?? null,
    mainIntent: it.search_intent_info?.main_intent ?? null,
    trendLast12: months.map((m) => m.search_volume).join(";"),
  };
}

function csvCell(v: string | number | null): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  line("=== Pinterest keyword research (DataForSEO Labs: keyword_overview + keyword_ideas) ===\n");
  line(`credentials: DATAFORSEO_LOGIN=${process.env.DATAFORSEO_LOGIN?.trim() ? "SET" : "MISSING"} DATAFORSEO_PASSWORD=${process.env.DATAFORSEO_PASSWORD?.trim() ? "SET" : "MISSING"}`);
  line(`mode=${dataForSeoMode()} configured=${dataForSeoConfigured()} database=${hasDatabase ? "yes (cost-control cache active)" : "no (no cache — one live call each)"}`);
  if (!dataForSeoConfigured()) {
    line("\nNOT CONFIGURED — aborting (fails closed). Set DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD in this environment (the Replit Shell) and re-run. No data was invented.");
    process.exitCode = 2;
    return;
  }

  const rows: Row[] = [];
  const seen = new Set<string>();
  let totalCost = 0;
  let liveCalls = 0;

  for (const market of MARKETS) {
    line(`\n— ${market.name} (location_code=${market.code}) —`);

    // keyword_overview for the exact seed set (real volume/CPC/competition/intent).
    const ov = await cachedFetch(
      "keyword_overview",
      { keywords: SEEDS, location_code: market.code, language_code: LANGUAGE },
      "/v3/dataforseo_labs/google/keyword_overview/live",
      async () => {
        const env = await dataForSeo.keywordOverview(SEEDS, market.code, LANGUAGE);
        return { data: extractKeywordOverviewItems(env), cost: env.cost ?? null };
      },
    );
    if (!ov.fromCache) liveCalls++;
    for (const it of ov.data) {
      const r = toRow(it, market.name, market.code, "seed");
      if (!r) continue;
      const k = `${market.code}::${r.keyword.toLowerCase()}`;
      if (seen.has(k)) continue;
      seen.add(k); rows.push(r);
    }
    line(`  seeds returned: ${ov.data.length} (fromCache=${ov.fromCache})`);

    // keyword_ideas expansion around the focused anchors.
    const ideas = await cachedFetch(
      "keyword_ideas",
      { keywords: IDEA_SEEDS, location_code: market.code, language_code: LANGUAGE, limit: 200 },
      "/v3/dataforseo_labs/google/keyword_ideas/live",
      async () => {
        const env = await dataForSeo.keywordIdeas(IDEA_SEEDS, market.code, LANGUAGE, 200);
        return { data: extractKeywordOverviewItems(env as never), cost: env.cost ?? null };
      },
    );
    if (!ideas.fromCache) liveCalls++;
    let added = 0;
    for (const it of ideas.data) {
      const r = toRow(it, market.name, market.code, "idea");
      if (!r) continue;
      const k = `${market.code}::${r.keyword.toLowerCase()}`;
      if (seen.has(k)) continue;
      seen.add(k); rows.push(r); added++;
    }
    line(`  ideas returned: ${ideas.data.length} (new: ${added}, fromCache=${ideas.fromCache})`);
  }

  // Write the CSV — raw, filtered later by the strategy doc.
  const header = ["keyword", "market", "location_code", "source", "search_volume", "cpc", "competition", "competition_level", "main_intent", "trend_last12"];
  const body = rows
    .sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1))
    .map((r) => [r.keyword, r.market, r.locationCode, r.source, r.searchVolume, r.cpc, r.competition, r.competitionLevel, r.mainIntent, r.trendLast12].map(csvCell).join(","));
  const csv = [header.join(","), ...body].join("\n") + "\n";

  mkdirSync(path.join(ROOT, "research"), { recursive: true });
  const out = path.join(ROOT, "research", "pinterest-keywords.csv");
  writeFileSync(out, csv, "utf8");

  line(`\n=== done ===`);
  line(`markets: ${MARKETS.length}   rows written: ${rows.length}   live API calls this run: ${liveCalls}   (cached calls cost 0)`);
  line(`CSV: ${path.relative(ROOT, out)}`);
  line(`Next: open the CSV, sort by search_volume / main_intent, and reconcile the tier tables in research/pinterest-keywords.md with the real numbers.`);
}

main().catch((e) => { line(`FATAL: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`); process.exitCode = 1; });
