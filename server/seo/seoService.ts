/**
 * SEO SERVICE — the orchestration that turns DataForSEO data + the real catalogue into decisions.
 *
 * The ANALYSIS path (mapping → score → actions) works with or without live data: with no snapshots
 * it still produces honest structural actions ("no page targets this print query — create one").
 * The REFRESH path calls DataForSEO through the cost-control gate (`cachedFetch`) and only runs when
 * credentials are set. Cadence is tiered so credits aren't burned: weekly cheap keyword_overview,
 * weekly priority-only SERP, monthly competitor discovery.
 */

import { storage } from "../storage";
import { hasDatabase } from "../db";
import { COLLECTIONS } from "@shared/collections";
import { getPurchasablePrintCollection } from "../commerce/prints/printRepo";
import {
  SEED_KEYWORDS, classifyIntent, normalizeKeyword, type IntentFamily, type SearchIntent,
} from "@shared/seo/keywords";
import { mapKeyword, type MappingCatalogue, type KeywordMapping } from "@shared/seo/mapping";
import { opportunityScore, type OpportunityScore } from "@shared/seo/scoring";
import { generateActions, weeklyPlan, type KeywordAnalysis, type SeoAction } from "@shared/seo/actions";
import { serpComposition, classifyDomain, type SerpDomainRef } from "@shared/seo/competitors";
import { recommendPrintLanding, type PrintLandingRecommendation } from "@shared/seo/printSeo";
import { PRINT_LANDING_THEMES } from "@shared/seo/mapping";
import { dataForSeo, dataForSeoConfigured, extractKeywordOverviewItems } from "./dataForSeoClient";
import { cachedFetch } from "./seoStore";
import * as store from "./seoStore";

/** Market config — where we measure. Overridable; defaults to the United Kingdom / English. */
function market(): { locationCode: number; languageCode: string } {
  return {
    locationCode: Number(process.env.SEO_LOCATION_CODE) || 2826, // 2826 = United Kingdom
    languageCode: process.env.SEO_LANGUAGE_CODE?.trim() || "en",
  };
}

export function seoConfigured(): boolean {
  return dataForSeoConfigured();
}

/** Build the mapping catalogue from the REAL site: artworks, collections, purchasable prints, articles. */
export async function buildCatalogue(): Promise<MappingCatalogue> {
  const artworks = (await storage.getAllArtworks()).map((a) => ({
    id: a.id, title: a.title, seoSlug: (a as { seoSlug?: string | null }).seoSlug ?? null,
    description: a.description, category: (a as { category?: string | null }).category ?? null,
    medium: a.medium, availability: a.availability,
    availableForPrint: (a as { availableForPrint?: boolean | null }).availableForPrint ?? false,
  }));
  const prints = (await getPurchasablePrintCollection()).map((p) => ({ slug: p.slug, title: p.title, purchasable: true }));
  let articles: { slug: string; title: string }[] = [];
  try {
    const posts = (await (storage as { getAllBlogPosts?: () => Promise<Array<{ slug: string; title: string; status?: string }>> }).getAllBlogPosts?.()) ?? [];
    articles = posts.filter((p) => (p.status ?? "published") === "published").map((p) => ({ slug: p.slug, title: p.title }));
  } catch { /* blog optional */ }
  return {
    artworks,
    collections: COLLECTIONS.map((c) => ({ slug: c.slug, heading: c.heading })),
    prints,
    articles,
  };
}

/** Seed the keyword model into the DB (idempotent). */
export async function seedKeywords(): Promise<number> {
  if (!hasDatabase) return 0;
  for (const s of SEED_KEYWORDS) await store.upsertKeyword({ keyword: normalizeKeyword(s.keyword), family: s.family, source: "seed" });
  return SEED_KEYWORDS.length;
}

// ── Turn a stored snapshot into the score inputs the analysis needs ──────────────────────────
function snapshotToAnalysis(
  keyword: string,
  family: IntentFamily,
  mapping: KeywordMapping,
  snap: store.SnapshotRow | undefined,
): { analysis: KeywordAnalysis; score: OpportunityScore } {
  const serpFeatures = snap?.serp_features ? (JSON.parse(snap.serp_features) as string[]) : [];
  const independentShare = deriveIndependentShare(snap);
  const score = opportunityScore({
    searchVolume: snap?.search_volume ?? null,
    cpc: snap?.cpc ? Number(snap.cpc) : null,
    competition: snap?.competition ? Number(snap.competition) : null,
    difficulty: snap?.difficulty ?? null,
    intent: (snap?.main_intent as SearchIntent) ?? null,
    currentRank: snap?.our_rank ?? null,
    hasSuitableTarget: Boolean(mapping.primary?.exists),
    targetRelevance: mapping.primary?.relevance ?? 0,
    serpIndependentShare: independentShare,
  });
  const analysis: KeywordAnalysis = {
    keyword, family, mapping, score,
    currentRank: snap?.our_rank ?? null,
    previousRank: null, // filled by history when available
    searchVolume: snap?.search_volume ?? null,
    serpMarketplaceDominated: independentShare < 0.25 && snap != null,
    printPurchasable: family === "prints" && mapping.primary?.exists === true,
  };
  return { analysis, score };
}

function deriveIndependentShare(snap: store.SnapshotRow | undefined): number {
  if (!snap?.top_domains) return 0.5; // unknown → neutral
  try {
    const domains = JSON.parse(snap.top_domains) as Array<{ domain: string; type?: string; rank_absolute?: number }>;
    return serpComposition(domains as SerpDomainRef[]).independentShare;
  } catch {
    return 0.5;
  }
}

/** READ-ONLY: analyse every active keyword against the catalogue + latest snapshots. No writes. */
export async function computeAnalyses(): Promise<Array<KeywordAnalysis & { keywordId: number; storedTarget: string | null }>> {
  const [catalogue, keywords, snaps] = await Promise.all([buildCatalogue(), store.listKeywords("active"), store.latestSnapshots()]);
  const analyses: Array<KeywordAnalysis & { keywordId: number; storedTarget: string | null }> = [];
  for (const k of keywords) {
    const snap = snaps.get(k.id);
    const mapping = mapKeyword(k.keyword, catalogue, {
      currentRankingUrl: snap?.our_ranking_url ?? null,
      familyOverride: k.family as IntentFamily,
    });
    const { analysis } = snapshotToAnalysis(k.keyword, k.family as IntentFamily, mapping, snap);
    analyses.push({ ...analysis, keywordId: k.id, storedTarget: k.primary_target_url });
  }
  return analyses;
}

/** WRITES: regenerate the open action list + refresh each keyword's mapped primary target. */
export async function analyzeAll(): Promise<{ actions: SeoAction[]; analyses: Array<KeywordAnalysis & { keywordId: number }> }> {
  const analyses = await computeAnalyses();
  for (const a of analyses) {
    if (a.mapping.primary?.url && a.mapping.primary.url !== a.storedTarget) {
      await store.setKeywordTarget(a.keywordId, a.mapping.primary.url);
    }
  }
  const actions = generateActions(analyses);
  await store.replaceOpenActions(actions as unknown as Array<Record<string, unknown>>);
  return { actions, analyses };
}

/** Keyword Opportunities view (Phase 12) — each keyword with its transparent score breakdown + mapping. */
export async function opportunities(): Promise<Record<string, unknown>[]> {
  const analyses = await computeAnalyses();
  return analyses
    .map((a) => ({
      keyword: a.keyword, family: a.family,
      score: a.score.score, band: a.score.band, factors: a.score.factors,
      rank: a.currentRank, volume: a.searchVolume,
      primaryTarget: a.mapping.primary?.url ?? null, primaryType: a.mapping.primary?.type ?? null,
      wrongPageRanking: a.mapping.wrongPageRanking, currentRankingUrl: a.mapping.currentRankingUrl,
      cannibalizationRisk: a.mapping.cannibalizationRisk, cannibalizingUrls: a.mapping.cannibalizingUrls,
      recommendNewPage: a.mapping.recommendNewPage,
    }))
    .sort((x, y) => y.score - x.score);
}

/** Page Map view — for each target page, the keywords mapped to it (surfaces multi-keyword pages). */
export async function pageMap(): Promise<Array<{ url: string; type: string | null; keywords: Array<{ keyword: string; family: string; rank: number | null; score: number }> }>> {
  const analyses = await computeAnalyses();
  const byUrl = new Map<string, { url: string; type: string | null; keywords: Array<{ keyword: string; family: string; rank: number | null; score: number }> }>();
  for (const a of analyses) {
    const url = a.mapping.primary?.url ?? "(unmapped)";
    if (!byUrl.has(url)) byUrl.set(url, { url, type: a.mapping.primary?.type ?? null, keywords: [] });
    byUrl.get(url)!.keywords.push({ keyword: a.keyword, family: a.family, rank: a.currentRank, score: a.score.score });
  }
  return Array.from(byUrl.values()).sort((x, y) => y.keywords.length - x.keywords.length);
}

/** The SEO Overview (Phase 12) — the decisions that matter, not a generic dashboard. */
export async function overview(): Promise<Record<string, unknown>> {
  const analyses = await computeAnalyses();
  const actions = generateActions(analyses);
  const plan = weeklyPlan(actions);
  const withScore = analyses.map((a) => ({ keyword: a.keyword, family: a.family, score: a.score.score, rank: a.currentRank, target: a.mapping.primary?.url ?? null }));
  const biggestOpportunity = [...withScore].sort((a, b) => b.score - a.score)[0] ?? null;
  const wrongPage = analyses.filter((a) => a.mapping.wrongPageRanking).map((a) => ({ keyword: a.keyword, ranking: a.mapping.currentRankingUrl, shouldBe: a.mapping.primary?.url }));
  const cannibalized = analyses.filter((a) => a.mapping.cannibalizationRisk).map((a) => ({ keyword: a.keyword, pages: a.mapping.cannibalizingUrls }));
  const newPrint = analyses.filter((a) => a.family === "prints" && a.mapping.recommendNewPage).map((a) => ({ keyword: a.keyword, slug: a.mapping.recommendNewPage?.slug }));
  return {
    configured: seoConfigured(),
    keywords: analyses.length,
    weeklyPlan: plan,
    biggestOpportunity,
    wrongPageRanking: wrongPage,
    cannibalization: cannibalized,
    newPrintOpportunities: newPrint,
    hasLiveData: analyses.some((a) => a.currentRank != null || a.searchVolume != null),
  };
}

// ── Print landing recommendations (Phase 11) — demand + SERP + inventory gated ────────────────
export async function printLandingRecommendations(): Promise<PrintLandingRecommendation[]> {
  const snaps = await store.latestSnapshots();
  const keywords = await store.listKeywords("active");
  const catalogue = await buildCatalogue();
  const out: PrintLandingRecommendation[] = [];
  for (const theme of PRINT_LANDING_THEMES) {
    // Find the keyword that best represents this theme (by label match), use its snapshot if any.
    const kw = keywords.find((k) => k.family === "prints" && theme.signals.some((s) => k.keyword.includes(s)));
    const snap = kw ? snaps.get(kw.id) : undefined;
    const mapping = kw ? mapKeyword(kw.keyword, catalogue, { familyOverride: "prints" }) : null;
    const score = kw && mapping ? snapshotToAnalysis(kw.keyword, "prints", mapping, snap).score : opportunityScore({ searchVolume: snap?.search_volume ?? null, cpc: null, competition: null, difficulty: null, intent: null, currentRank: null, hasSuitableTarget: false, targetRelevance: 0.6, serpIndependentShare: deriveIndependentShare(snap) });
    out.push(recommendPrintLanding({
      slug: theme.slug, label: theme.label, score,
      serpIndependentShare: deriveIndependentShare(snap),
      matchingPurchasableProducts: catalogue.prints.length, // purchasable prints matching (0 today)
    }));
  }
  return out;
}

// ── REFRESH (DataForSEO, cost-controlled). Only runs when configured. ─────────────────────────

/** WEEKLY cheap: bulk volume/CPC/difficulty/intent for all active keywords (one Labs call, cached). */
export async function refreshKeywordOverview(): Promise<{ ran: boolean; fromCache?: boolean; updated?: number }> {
  if (!seoConfigured() || !hasDatabase) return { ran: false };
  const keywords = await store.listKeywords("active");
  const terms = keywords.map((k) => k.keyword);
  const { locationCode, languageCode } = market();
  const { data, fromCache } = await cachedFetch(
    "keyword_overview",
    { keywords: terms, location_code: locationCode, language_code: languageCode },
    "/v3/dataforseo_labs/google/keyword_overview/live",
    async () => {
      const env = await dataForSeo.keywordOverview(terms, locationCode, languageCode);
      return { data: extractKeywordOverviewItems(env), cost: env.cost ?? null };
    },
  );
  const byKeyword = new Map(keywords.map((k) => [normalizeKeyword(k.keyword), k]));
  let updated = 0;
  for (const item of data as Array<Record<string, any>>) {
    const k = byKeyword.get(normalizeKeyword(item.keyword ?? ""));
    if (!k) continue;
    await store.insertSnapshot({
      keyword_id: k.id,
      search_volume: item.keyword_info?.search_volume ?? null,
      cpc: item.keyword_info?.cpc != null ? String(item.keyword_info.cpc) : null,
      competition: item.keyword_info?.competition != null ? String(item.keyword_info.competition) : null,
      difficulty: item.keyword_properties?.keyword_difficulty ?? null,
      main_intent: item.search_intent_info?.main_intent ?? null,
      our_rank: null, our_ranking_url: null, opportunity_score: null,
      top_domains: null, serp_features: null,
      raw: JSON.stringify(item),
    });
    updated++;
  }
  return { ran: true, fromCache, updated };
}

export const _market = market; // exported for tests/inspection
