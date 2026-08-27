/**
 * BUYER-INTENT KEYWORD MODEL — the vocabulary of people who actually buy Ani's work, separated by
 * what they intend to acquire. Everything downstream (mapping, scoring, actions) keys off the
 * intent FAMILY, because an "original oil painting" buyer and a "blue wall art" buyer want
 * different pages and must never fight over the same URL (Phase 4).
 *
 * The seed families below are a STARTING POINT to validate against live DataForSEO demand — never a
 * promise that a keyword is worth targeting. Pure + shared + unit-tested.
 */

export type IntentFamily = "originals" | "prints" | "trade" | "branded";

/** The eight buyer-intent groups the seed taxonomy is organised around (Task 4). */
export type SeedGroup =
  | "A. Original art purchase"
  | "B. Landscape painting purchase"
  | "C. Figurative painting purchase"
  | "D. Large / statement wall art"
  | "E. Art for living rooms & interiors"
  | "F. Interior designer / art consultant"
  | "G. Artist / branded"
  | "H. Print buyer";

/** DataForSEO search_intent main_intent values (verified). */
export type SearchIntent = "informational" | "navigational" | "commercial" | "transactional";

export interface SeedKeyword {
  keyword: string;
  family: IntentFamily;
  group: SeedGroup;
}

/** Normalise a keyword the way Google/DataForSEO treat it: lowercase, trimmed, single-spaced. */
export function normalizeKeyword(k: string): string {
  return k.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * THE SEED TAXONOMY (Task 4) — natural buyer phrasing, not business descriptions. Organised by the
 * eight intent groups and mapped to a page-targeting family. Every phrase is how a real collector /
 * designer / decor buyer types, and each is VALIDATED against live DataForSEO demand before it is
 * targeted (a phrase the API returns no record for is dropped, not forced to volume 0 — that is why
 * the earlier "original art for interiors" was removed after the live run returned nothing for it).
 */
const seed = (family: IntentFamily, group: SeedGroup, keywords: string[]): SeedKeyword[] =>
  keywords.map((keyword) => ({ keyword, family, group }));

export const SEED_KEYWORDS: readonly SeedKeyword[] = [
  // A — original art purchase intent (verified live: "original oil paintings" = 140/mo, transactional)
  ...seed("originals", "A. Original art purchase", [
    "original oil paintings", "original oil paintings for sale", "buy original oil painting", "original paintings for sale",
  ]),
  // B — landscape painting purchase (verified live: "contemporary landscape paintings" = 390/mo)
  ...seed("originals", "B. Landscape painting purchase", [
    "contemporary landscape paintings", "original landscape paintings", "landscape oil paintings for sale", "original landscape oil painting",
  ]),
  // C — figurative painting purchase
  ...seed("originals", "C. Figurative painting purchase", [
    "original figurative paintings", "contemporary figurative art", "figurative oil paintings",
  ]),
  // D — large / statement wall art (originals-leaning; pure-decor variants sit in H)
  ...seed("originals", "D. Large / statement wall art", [
    "large original paintings", "large oil paintings", "large canvas wall art",
  ]),
  // E — art for living rooms & interiors (retail; the original-buyer variants)
  ...seed("originals", "E. Art for living rooms & interiors", [
    "original art for living room", "paintings for living room",
  ]),
  // F — interior designer / art consultant intent (trade)  [replaces the dead "original art for interiors"]
  ...seed("trade", "F. Interior designer / art consultant", [
    "art for interior designers", "original art for interior design", "artwork for interior projects",
  ]),
  // G — artist / branded (navigational → homepage/about, not a collection)
  ...seed("branded", "G. Artist / branded", [
    "ani muradyan", "ani muradyan artist", "ani muradyan paintings", "anymoore art",
  ]),
  // H — print buyer intent, kept clearly separate from originals
  ...seed("prints", "H. Print buyer", [
    "fine art prints", "giclée prints", "landscape art prints", "large wall art prints",
  ]),
];

/**
 * THE NEXT BATCH TO VALIDATE (Task 5) — natural close alternatives + expansions to run through
 * keyword_overview NEXT (cost-controlled: not called yet). Auditable here and surfaced in admin so a
 * human approves what gets a paid lookup. Nothing here is targeted until DataForSEO confirms demand.
 */
export const NEXT_KEYWORD_BATCH: readonly SeedKeyword[] = [
  ...seed("originals", "A. Original art purchase", ["original artwork for sale", "contemporary oil paintings", "original modern paintings"]),
  ...seed("originals", "B. Landscape painting purchase", ["atmospheric landscape painting", "modern landscape painting", "countryside oil painting"]),
  ...seed("originals", "C. Figurative painting purchase", ["contemporary portrait painting", "expressive figurative painting"]),
  ...seed("originals", "D. Large / statement wall art", ["large abstract landscape painting", "oversized original painting", "statement wall art"]),
  ...seed("trade", "F. Interior designer / art consultant", ["art for luxury interiors", "art for hotels", "hospitality artwork"]),
  ...seed("prints", "H. Print buyer", ["landscape wall art print", "blue landscape print", "neutral wall art print", "framed giclee print"]),
];

// Signal tokens. Order of precedence in classifyIntent: trade → originals (when "original" is
// explicit) → prints → default. "large ORIGINAL wall art" is an originals buyer, not a print buyer.
const BRAND_SIGNALS = ["ani muradyan", "muradyan", "anymoore", "animuradyan"];
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
  const brand = hits(t, BRAND_SIGNALS);
  const trade = hits(t, TRADE_SIGNALS);
  const original = hits(t, ORIGINAL_SIGNALS);
  const print = hits(t, PRINT_SIGNALS);
  const ambiguous = original.length > 0 && print.length > 0;

  // Branded (the artist's own name) wins first — it's a navigational buyer who already knows Ani,
  // and belongs on the homepage/about, not a generic collection.
  if (brand.length) return { family: "branded", matchedSignals: brand, ambiguous };
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
  branded: ["Ani Muradyan", "contemporary oil painter", "original paintings", "studio", "about the artist"],
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
