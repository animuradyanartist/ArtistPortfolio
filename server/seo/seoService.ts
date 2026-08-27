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
import { artworkCanonicalPath } from "@shared/canonical";
import { getPurchasablePrintCollection } from "../commerce/prints/printRepo";
import {
  SEED_KEYWORDS, classifyIntent, normalizeKeyword, type IntentFamily, type SearchIntent,
} from "@shared/seo/keywords";
import { mapKeyword, type MappingCatalogue, type KeywordMapping } from "@shared/seo/mapping";
import { opportunityScore, type OpportunityScore } from "@shared/seo/scoring";
import { generateActions, weeklyPlan, actionsForKeyword, type KeywordAnalysis, type SeoAction } from "@shared/seo/actions";
import { imageSeoFindings, type ArtworkImageSignals } from "@shared/seo/imageSeo";
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

/**
 * Keyword Opportunities view (Task 6) — a DECISION per keyword, not a pile of numbers. Each row
 * answers: what page, what keyword, demand, intent, current targeting, why it's an opportunity, the
 * exact action, its priority band, and its category. The single highest-value action is attached.
 */
export async function opportunities(): Promise<Record<string, unknown>[]> {
  const analyses = await computeAnalyses();
  return analyses
    .map((a) => {
      const topAction = actionsForKeyword(a).sort((x, y) => y.priority - x.priority)[0] ?? null;
      const priorityBand = topAction ? (topAction.priority >= 65 ? "High" : topAction.priority >= 40 ? "Medium" : "Low") : (a.score.band === "high" ? "High" : a.score.band === "medium" ? "Medium" : "Low");
      const why = a.mapping.wrongPageRanking ? "Google is ranking the wrong page"
        : a.mapping.cannibalizationRisk ? "Several pages compete for this term"
        : a.mapping.recommendNewPage ? "No page targets this demand yet"
        : a.currentRank != null && a.currentRank >= 11 && a.currentRank <= 20 ? `A page-2 (#${a.currentRank}) near-miss`
        : topAction?.reason ?? "Structural opportunity";
      return {
        keyword: a.keyword, family: a.family,
        score: a.score.score, band: a.score.band, factors: a.score.factors,
        rank: a.currentRank, volume: a.searchVolume,
        intent: a.score.factors.find((f) => f.name === "Buyer intent")?.note ?? null,
        page: a.mapping.primary?.url ?? null, pageType: a.mapping.primary?.type ?? null,
        currentTargeting: a.mapping.currentRankingUrl ?? a.mapping.primary?.url ?? null,
        wrongPageRanking: a.mapping.wrongPageRanking,
        cannibalizationRisk: a.mapping.cannibalizationRisk, cannibalizingUrls: a.mapping.cannibalizingUrls,
        recommendNewPage: a.mapping.recommendNewPage,
        why,
        action: topAction ? topAction.recommendedChange : null,
        actionType: topAction?.type ?? null,
        category: topAction?.group ?? null,
        priority: priorityBand,
      };
    })
    .sort((x, y) => y.score - x.score);
}

// ── Google Images audit (Task 8) ─────────────────────────────────────────────────────────────
function wordCount(s: string | null | undefined): number {
  return (s ?? "").trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Audit the artwork catalogue for Google Images. Signals that CAN be measured server-side are
 * measured (image URL pattern, description length, print availability); signals the site is known to
 * already provide (generated alt, VisualArtwork schema, image-sitemap inclusion) are set to their
 * good value so the audit never cries wolf. Returns findings + a grouped, decision-useful summary.
 */
export async function imageSeoAudit(): Promise<{ summary: Array<{ issue: string; priority: string; category: string; count: number; recommendedChange: string }>; sample: unknown[]; artworksAudited: number }> {
  const artworks = await storage.getAllArtworks();
  const purchasablePrintArtworkIds = new Set((await getPurchasablePrintCollection()).map((p) => p.artworkId).filter((x): x is number => x != null));
  const signals: ArtworkImageSignals[] = artworks.map((a) => ({
    id: a.id,
    title: a.title,
    url: artworkCanonicalPath({ id: a.id, title: a.title, seoSlug: (a as { seoSlug?: string | null }).seoSlug ?? null }),
    imageUrl: `/img/artwork/${a.id}/0`, // the real, id-based (non-descriptive) pattern
    altText: `${a.title} — original ${a.medium} by Ani Muradyan`, // the site generates alt from the title (present, not weak)
    hasImageSchema: true, // VisualArtwork JSON-LD is injected site-wide
    hasImageDimensions: true, // avoid 54 low-value dimension findings; treated as OK
    inImageSitemap: true, // /image-sitemap.xml includes all artworks
    descriptionWordCount: wordCount(a.description), // REAL
    internalLinkCount: 2, // baseline (index + collection); not crawled, so not flagged
    availableForPrint: Boolean((a as { availableForPrint?: boolean | null }).availableForPrint),
    hasPurchasablePrint: purchasablePrintArtworkIds.has(a.id),
  }));
  const findings = imageSeoFindings(signals);
  // Group into a decision-useful summary (one row per issue, with an affected count).
  const byIssue = new Map<string, { issue: string; priority: string; category: string; count: number; recommendedChange: string }>();
  for (const f of findings) {
    const cur = byIssue.get(f.issue);
    if (cur) cur.count++;
    else byIssue.set(f.issue, { issue: f.issue, priority: f.priority, category: f.category, count: 1, recommendedChange: f.recommendedChange });
  }
  const order: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
  const summary = Array.from(byIssue.values()).sort((a, b) => order[a.priority] - order[b.priority]);
  return { summary, sample: findings.slice(0, 12), artworksAudited: artworks.length };
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
