/**
 * BUYER-INTENT KEYWORD MODEL — the vocabulary of people who actually buy Ani's work, separated by
 * what they intend to acquire. Everything downstream (mapping, scoring, actions) keys off the
 * intent FAMILY, because an "original oil painting" buyer and a "blue wall art" buyer want
 * different pages and must never fight over the same URL (Phase 4).
 *
 * The seed families below are a STARTING POINT to validate against live DataForSEO demand — never a
 * promise that a keyword is worth targeting. Pure + shared + unit-tested.
 */

export type IntentFamily = "originals" | "prints" | "trade";

/** DataForSEO search_intent main_intent values (verified). */
export type SearchIntent = "informational" | "navigational" | "commercial" | "transactional";

export interface SeedKeyword {
  keyword: string;
  family: IntentFamily;
}

/** Normalise a keyword the way Google/DataForSEO treat it: lowercase, trimmed, single-spaced. */
export function normalizeKeyword(k: string): string {
  return k.toLowerCase().replace(/\s+/g, " ").trim();
}

// ── The seed families (Phase 2). Validated from live data before any are targeted. ────────────
export const SEED_KEYWORDS: readonly SeedKeyword[] = [
  // ORIGINALS
  ...[
    "original oil paintings", "original landscape paintings", "contemporary landscape paintings",
    "original figurative paintings", "abstract realism paintings", "large original wall art",
    "original art for living room", "original art for interior designers",
  ].map((keyword) => ({ keyword, family: "originals" as const })),
  // PRINTS
  ...[
    "fine art prints", "giclée prints", "landscape art prints", "large wall art prints",
    "blue wall art", "neutral wall art", "calming wall art", "living room wall art",
    "art above sofa", "large framed art", "fine art prints for living room",
    "contemporary landscape prints",
  ].map((keyword) => ({ keyword, family: "prints" as const })),
  // TRADE / INTERIOR
  ...[
    "art for interior designers", "art for luxury interiors", "art for hotels", "hospitality art",
    "large artwork for interior projects",
  ].map((keyword) => ({ keyword, family: "trade" as const })),
];

// Signal tokens. Order of precedence in classifyIntent: trade → originals (when "original" is
// explicit) → prints → default. "large ORIGINAL wall art" is an originals buyer, not a print buyer.
const TRADE_SIGNALS = [
  "interior designer", "interior designers", "interior project", "interior projects",
  "hospitality", "hotel", "hotels", "luxury interior", "luxury interiors", "trade", "commercial space",
];
const ORIGINAL_SIGNALS = [
  "original", "oil on canvas", "one-of-a-kind", "one of a kind", "oil painting", "oil paintings",
];
const PRINT_SIGNALS = [
  "print", "prints", "giclée", "giclee", "wall art", "framed", "poster", "posters", "decor",
  "décor", "canvas print", "above sofa", "above the sofa",
];

export interface IntentClassification {
  family: IntentFamily;
  matchedSignals: string[];
  /** True when both original and print signals appear — the mapping must not let them cannibalize. */
  ambiguous: boolean;
}

const hits = (text: string, signals: string[]) => signals.filter((s) => text.includes(s));

/**
 * Classify a keyword into a buyer family from its own words. Trade intent wins first (a designer
 * query is a different page whether they want an original or a print); then an explicit "original"
 * signal keeps a paying-for-the-original buyer on originals even if "wall art" is present; then
 * print/decor signals; else originals as the honest default for a bare "…painting" query.
 */
export function classifyIntent(keyword: string): IntentClassification {
  const t = normalizeKeyword(keyword);
  const trade = hits(t, TRADE_SIGNALS);
  const original = hits(t, ORIGINAL_SIGNALS);
  const print = hits(t, PRINT_SIGNALS);
  const ambiguous = original.length > 0 && print.length > 0;

  if (trade.length) return { family: "trade", matchedSignals: trade, ambiguous };
  if (original.length) return { family: "originals", matchedSignals: original, ambiguous };
  if (print.length) return { family: "prints", matchedSignals: print, ambiguous };
  return { family: "originals", matchedSignals: [], ambiguous: false };
}

/** The core language each family's PAGE should target (Phase 4) — guidance, not stuffing. */
export const FAMILY_TARGET_LANGUAGE: Record<IntentFamily, string[]> = {
  originals: ["original", "oil on canvas", "one-of-a-kind", "contemporary painting", "original landscape", "original figurative"],
  prints: ["fine-art print", "giclée", "wall art", "living room", "large wall art", "framed art"],
  trade: ["art for interior designers", "art for luxury interiors", "hospitality art", "artwork for interior projects"],
};

/** How commercially valuable the search INTENT is, 0..1 — transactional/commercial buyers first. */
export function intentStrength(intent: SearchIntent | null | undefined): number {
  switch (intent) {
    case "transactional": return 1;
    case "commercial": return 0.8;
    case "navigational": return 0.3;
    case "informational": return 0.2;
    default: return 0.5; // unknown — neutral
  }
}
