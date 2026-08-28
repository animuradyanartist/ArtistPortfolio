/**
 * SERP COMPETITOR GAP (Phase 6) — who ACTUALLY ranks, not a manual list of "other artists". For
 * each keyword the SERP is inspected and every domain classified, because the strategy differs
 * enormously: a page an independent artist can realistically outrank vs. a marketplace/social wall
 * an artist site cannot. The gap view extracts STRUCTURAL opportunities (page type, intent,
 * coverage) — never competitor text, which is neither copied nor stored.
 *
 * Pure + shared + unit-tested.
 */

import { normalizeKeyword } from "./keywords";

export type DomainClass =
  | "own" | "marketplace" | "gallery" | "independent-artist" | "interior" | "editorial" | "social" | "unknown";

const OWN = ["animuradyan.com", "anymoore.am"];
const MARKETPLACE = ["saatchiart.com", "artfinder.com", "singulart.com", "etsy.com", "amazon.", "ebay.", "society6.com", "redbubble.com", "artsy.net", "1stdibs.com", "artgallery.co.uk", "juniqe."];
const SOCIAL = ["pinterest.", "instagram.com", "facebook.com", "tiktok.com", "youtube.com"];
const INTERIOR = ["houzz.com", "wayfair.", "westelm.com", "potterybarn.com", "johnlewis.com", "made.com", "desenio.", "kingandmcgaw.com", "king& mcgaw"];
const EDITORIAL = ["elledecor.com", "architecturaldigest.com", "housebeautiful.com", "dezeen.com", "wikipedia.org", "thespruce.com", "mymove.com"];
const GALLERY_HINT = ["gallery", "galleries", "fineart", "artgallery"];

/** Classify a domain into the strategic category that decides whether an artist site can compete. */
export function classifyDomain(domain: string | null | undefined): DomainClass {
  if (!domain) return "unknown";
  const d = domain.toLowerCase().replace(/^www\./, "");
  const has = (list: string[]) => list.some((x) => d.includes(x));
  if (has(OWN)) return "own";
  if (has(MARKETPLACE)) return "marketplace";
  if (has(SOCIAL)) return "social";
  if (has(INTERIOR)) return "interior";
  if (has(EDITORIAL)) return "editorial";
  if (GALLERY_HINT.some((g) => d.includes(g))) return "gallery";
  // A short, non-brandable .com/.art/.co.uk that isn't a known platform is most likely an
  // independent artist or a small studio site — the beatable competition.
  if (/\.(art|com|co\.uk|net|studio|co)$/.test(d)) return "independent-artist";
  return "unknown";
}

/** Which classes an independent artist site can realistically outrank. */
export function isBeatable(cls: DomainClass): boolean {
  return cls === "independent-artist" || cls === "gallery" || cls === "unknown";
}

export interface SerpDomainRef {
  domain?: string;
  url?: string;
  rank_absolute?: number;
  type?: string;
}

export interface SerpComposition {
  total: number;
  /** Fraction 0..1 of organic results that are beatable (independent artist / gallery / unknown). */
  independentShare: number;
  /** Our best organic rank in this SERP, or null. */
  ownRank: number | null;
  ownUrl: string | null;
  breakdown: Record<DomainClass, number>;
  /** SERP feature item types present (featured_snippet, people_also_ask, local_pack, …). */
  features: string[];
}

/** Inspect a SERP's items — who ranks, our position, how winnable, which features are present. */
export function serpComposition(items: SerpDomainRef[]): SerpComposition {
  const organic = items.filter((i) => (i.type ?? "organic") === "organic");
  const breakdown = { own: 0, marketplace: 0, gallery: 0, "independent-artist": 0, interior: 0, editorial: 0, social: 0, unknown: 0 } as Record<DomainClass, number>;
  let ownRank: number | null = null;
  let ownUrl: string | null = null;
  for (const i of organic) {
    const cls = classifyDomain(i.domain);
    breakdown[cls] += 1;
    if (cls === "own" && (ownRank == null || (i.rank_absolute ?? 999) < ownRank)) {
      ownRank = i.rank_absolute ?? null;
      ownUrl = i.url ?? null;
    }
  }
  const beatable = breakdown["independent-artist"] + breakdown.gallery + breakdown.unknown;
  const total = organic.length;
  const features = Array.from(new Set(items.filter((i) => i.type && i.type !== "organic").map((i) => i.type!)));
  return {
    total,
    independentShare: total ? beatable / total : 0,
    ownRank,
    ownUrl,
    breakdown,
    features,
  };
}

export interface CompetitorRanked {
  domain: string;
  /** Keywords this competitor ranks for, with the page + position. */
  keywords: Array<{ keyword: string; rank: number | null; url: string }>;
}

export interface CompetitorGapRow {
  domain: string;
  domainClass: DomainClass;
  beatable: boolean;
  /** Keywords the competitor ranks for that WE do not cover at all. */
  gapKeywords: string[];
  /** The page-type patterns that repeatedly win for this competitor (structural, not textual). */
  winningPagePatterns: string[];
}

/** Rough page-type inference from a URL path — structural learning only, never copied content. */
export function inferPageType(url: string): string {
  try {
    const p = (url.includes("://") ? new URL(url).pathname : url).toLowerCase();
    if (p === "/" || p === "") return "homepage";
    if (/\/(prints?|wall-art|posters?)\b/.test(p)) return "print/wall-art page";
    if (/\/(collections?|category|shop|gallery)\b/.test(p)) return "collection/category page";
    if (/\/(blog|journal|guide|ideas|article)\b/.test(p)) return "editorial/guide page";
    if (/\/(artwork|painting|product|item|p)\b/.test(p)) return "product/artwork page";
    if (/\/(interior|living-room|hotel|designer)\b/.test(p)) return "interior/room intent page";
    return "other page";
  } catch {
    return "other page";
  }
}

/**
 * Build the competitor-gap view: for each competitor, the keywords they rank for that we don't, and
 * the recurring page-type patterns worth learning from. `ourKeywords` is the set we already cover.
 */
export function competitorGap(ourKeywords: Iterable<string>, competitors: CompetitorRanked[]): CompetitorGapRow[] {
  const ours = new Set(Array.from(ourKeywords).map(normalizeKeyword));
  return competitors.map((c) => {
    const gapKeywords = Array.from(new Set(c.keywords.map((k) => normalizeKeyword(k.keyword)).filter((k) => !ours.has(k))));
    const patternCounts = new Map<string, number>();
    for (const k of c.keywords) {
      const t = inferPageType(k.url);
      patternCounts.set(t, (patternCounts.get(t) ?? 0) + 1);
    }
    const winningPagePatterns = Array.from(patternCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .filter(([, n]) => n >= 2)
      .map(([t]) => t);
    const cls = classifyDomain(c.domain);
    return { domain: c.domain, domainClass: cls, beatable: isBeatable(cls), gapKeywords, winningPagePatterns };
  });
}
