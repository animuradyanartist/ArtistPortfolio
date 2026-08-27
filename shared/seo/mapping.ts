/**
 * KEYWORD → PAGE MAPPING (Phase 3) — the discipline that gives every strategic keyword exactly ONE
 * primary target URL, so the site never optimises "original blue landscape painting" across five
 * artworks at once. Pure + shared: it takes the real catalogue (artworks, collections, prints,
 * articles) and a keyword, and returns the primary target, supporting pages, cannibalization risk,
 * whether Google is ranking the wrong URL, and — for prints/trade demand with no page yet — a
 * concrete new-page recommendation.
 *
 * It reuses the site's real canonical URL rules (canonical.ts / printProduct.ts) so a mapped target
 * is the SAME URL the sitemap, redirects and client already use — never a guessed path.
 */

import { artworkCanonicalPath, toSlug } from "../canonical";
import { printCanonicalPath } from "../commerce/printProduct";
import { classifyIntent, normalizeKeyword, type IntentFamily } from "./keywords";

export interface MappableArtwork {
  id: number;
  title: string;
  seoSlug?: string | null;
  description?: string | null;
  category?: string | null; // landscape | figurative | ...
  medium?: string | null;
  availability?: string | null; // available | sold
  availableForPrint?: boolean | null;
}
export interface MappableCollection {
  slug: string;
  heading: string;
  family?: IntentFamily;
}
export interface MappablePrint {
  slug: string;
  title: string;
  purchasable: boolean;
}
export interface MappableArticle {
  slug: string;
  title: string;
}
export interface MappingCatalogue {
  artworks: MappableArtwork[];
  collections: MappableCollection[];
  prints: MappablePrint[];
  articles: MappableArticle[];
}

export type PageType =
  | "homepage" | "artworks-index" | "artwork" | "collection"
  | "prints-index" | "print-pdp" | "print-landing" | "trade-landing" | "article";

export interface PageCandidate {
  url: string;
  type: PageType;
  title: string;
  /** 0..1 relevance of this page to the keyword. Transparent (token overlap + phrase bonus). */
  relevance: number;
  /** Whether the page currently exists on the site (a recommendation may target a not-yet page). */
  exists: boolean;
}

export interface NewPageRecommendation {
  slug: string;
  type: PageType;
  reason: string;
}

export interface KeywordMapping {
  keyword: string;
  family: IntentFamily;
  primary: PageCandidate | null;
  secondary: PageCandidate[];
  /** More than one same-type page competes strongly for this keyword. */
  cannibalizationRisk: boolean;
  cannibalizingUrls: string[];
  /** Requires currentRankingUrl: true when Google ranks a URL that is not the primary target. */
  wrongPageRanking: boolean;
  currentRankingUrl: string | null;
  recommendNewPage: NewPageRecommendation | null;
}

const STOP = new Set(["for", "the", "and", "with", "in", "of", "to", "a", "an", "on", "at", "by", "my", "your"]);
function tokens(s: string): string[] {
  return normalizeKeyword(s)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

/** Transparent relevance: share of keyword tokens found in the page text, + a phrase-containment bonus. */
export function relevance(keyword: string, pageText: string): number {
  const kt = tokens(keyword);
  if (!kt.length) return 0;
  const hay = " " + normalizeKeyword(pageText).replace(/[^a-z0-9\s]/g, " ") + " ";
  const overlap = kt.filter((t) => hay.includes(` ${t} `) || hay.includes(t)).length / kt.length;
  const phraseBonus = hay.includes(normalizeKeyword(keyword)) ? 0.25 : 0;
  return Math.min(1, overlap + phraseBonus);
}

// Print landing themes — candidate /prints/<slug> surfaces for decor-intent queries (Phase 11).
export interface PrintLandingTheme {
  slug: string;
  label: string;
  signals: string[];
}
export const PRINT_LANDING_THEMES: readonly PrintLandingTheme[] = [
  { slug: "landscape-art-prints", label: "Landscape Art Prints", signals: ["landscape"] },
  { slug: "blue-wall-art", label: "Blue Wall Art", signals: ["blue"] },
  { slug: "neutral-wall-art", label: "Neutral & Calming Wall Art", signals: ["neutral", "beige", "calming", "calm", "muted"] },
  { slug: "living-room-wall-art", label: "Living Room Wall Art", signals: ["living room", "above sofa", "above the sofa", "sofa"] },
  { slug: "large-wall-art", label: "Large Wall Art Prints", signals: ["large", "oversized", "big statement", "statement"] },
];

export const TRADE_LANDING = { slug: "art-for-interior-designers", label: "Art for Interior Designers & Interiors" };

const HOME: PageCandidate = { url: "/", type: "homepage", title: "Home", relevance: 0, exists: true };
const ARTWORKS_INDEX: PageCandidate = { url: "/artworks", type: "artworks-index", title: "Original Paintings", relevance: 0, exists: true };
const PRINTS_INDEX: PageCandidate = { url: "/prints", type: "prints-index", title: "Fine-Art Prints", relevance: 0, exists: true };

/** Build every plausible target for a keyword, scored by relevance. */
function candidatesFor(keyword: string, family: IntentFamily, cat: MappingCatalogue): PageCandidate[] {
  const out: PageCandidate[] = [];

  if (family === "originals") {
    for (const a of cat.artworks) {
      const rel = relevance(keyword, `${a.title} ${a.category ?? ""} ${a.medium ?? ""}`);
      if (rel > 0) out.push({ url: artworkCanonicalPath({ id: a.id, title: a.title, seoSlug: a.seoSlug ?? null }), type: "artwork", title: a.title, relevance: rel, exists: true });
    }
    for (const c of cat.collections) {
      const rel = relevance(keyword, `${c.heading} ${c.slug.replace(/-/g, " ")}`);
      if (rel > 0) out.push({ url: `/collections/${c.slug}`, type: "collection", title: c.heading, relevance: rel, exists: true });
    }
    out.push({ ...ARTWORKS_INDEX, relevance: relevance(keyword, "original oil paintings contemporary landscape figurative for sale") });
    out.push({ ...HOME, relevance: relevance(keyword, "ani muradyan contemporary oil painter original paintings") * 0.5 });
  }

  if (family === "prints") {
    for (const p of cat.prints) {
      const rel = relevance(keyword, `${p.title} fine art print wall art`);
      if (rel > 0) out.push({ url: printCanonicalPath(p.slug), type: "print-pdp", title: p.title, relevance: rel, exists: p.purchasable });
    }
    for (const theme of PRINT_LANDING_THEMES) {
      const rel = themeRelevance(keyword, theme);
      if (rel > 0) {
        const exists = cat.prints.some((p) => p.slug === theme.slug); // a landing page is a print product-less slug; treated as new unless present
        out.push({ url: printCanonicalPath(theme.slug), type: "print-landing", title: theme.label, relevance: rel, exists });
      }
    }
    out.push({ ...PRINTS_INDEX, relevance: relevance(keyword, "fine art prints giclée wall art living room") });
  }

  if (family === "trade") {
    const rel = relevance(keyword, "art for interior designers luxury interiors hospitality hotels interior projects trade");
    out.push({ url: `/${TRADE_LANDING.slug}`, type: "trade-landing", title: TRADE_LANDING.label, relevance: Math.max(rel, 0.5), exists: false });
  }

  // Editorial pages can support any family.
  for (const art of cat.articles) {
    const rel = relevance(keyword, art.title);
    if (rel >= 0.5) out.push({ url: `/blog/${art.slug}`, type: "article", title: art.title, relevance: rel * 0.7, exists: true });
  }

  return out.sort((a, b) => b.relevance - a.relevance);
}

function themeRelevance(keyword: string, theme: PrintLandingTheme): number {
  const t = normalizeKeyword(keyword);
  const matched = theme.signals.some((s) => t.includes(s));
  if (!matched) return 0;
  // A theme match is strong for decor queries; combine with token relevance to the label.
  return Math.min(1, 0.6 + relevance(keyword, theme.label) * 0.4);
}

const STRONG = 0.6; // relevance at/above which a same-type page is a genuine cannibalization risk

/**
 * Map a keyword to its ONE primary page + supporting pages, flagging cannibalization and (given the
 * current ranking URL) whether Google ranks the wrong page. When the best target for a print/trade
 * keyword is a landing page that does not exist yet, it is returned as a new-page recommendation.
 */
export function mapKeyword(
  keyword: string,
  cat: MappingCatalogue,
  opts: { currentRankingUrl?: string | null; familyOverride?: IntentFamily } = {},
): KeywordMapping {
  const family = opts.familyOverride ?? classifyIntent(keyword).family;
  const candidates = candidatesFor(keyword, family, cat);
  const primary = candidates[0] ?? null;

  // Cannibalization: 2+ strong candidates of the SAME type (e.g. three blue-landscape PDPs).
  const strong = candidates.filter((c) => c.relevance >= STRONG);
  const byType = new Map<PageType, PageCandidate[]>();
  for (const c of strong) byType.set(c.type, [...(byType.get(c.type) ?? []), c]);
  const cannibalizing = Array.from(byType.values()).filter((g) => g.length > 1).flat();
  const cannibalizationRisk = cannibalizing.length > 0;

  // Wrong page: Google ranks an internal URL that is not the primary target.
  const currentRankingUrl = opts.currentRankingUrl ?? null;
  const wrongPageRanking =
    Boolean(currentRankingUrl && primary && isInternal(currentRankingUrl) && normalizePath(currentRankingUrl) !== normalizePath(primary.url));

  // New-page recommendation when the best target doesn't exist yet (print landing / trade landing).
  let recommendNewPage: NewPageRecommendation | null = null;
  if (primary && !primary.exists && (primary.type === "print-landing" || primary.type === "trade-landing")) {
    recommendNewPage = {
      slug: primary.url.replace(/^\/(prints\/)?/, ""),
      type: primary.type,
      reason: `No page targets "${keyword}" yet; a ${primary.type === "print-landing" ? "print landing page" : "trade landing page"} is the right primary target.`,
    };
  }

  return {
    keyword: normalizeKeyword(keyword),
    family,
    primary,
    secondary: candidates.slice(1, 4),
    cannibalizationRisk,
    cannibalizingUrls: cannibalizing.map((c) => c.url),
    wrongPageRanking,
    currentRankingUrl,
    recommendNewPage,
  };
}

function isInternal(url: string): boolean {
  return url.startsWith("/") || url.includes("animuradyan.com");
}
function normalizePath(url: string): string {
  try {
    const p = url.includes("://") ? new URL(url).pathname : url;
    return p.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/";
  } catch {
    return url;
  }
}

export { toSlug };
