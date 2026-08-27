/**
 * PRINT SHOP SEO (Phase 11) — SEO architecture for /prints that CANNOT lie. A print landing page is
 * recommended only when live demand + a beatable SERP justify it AND real purchasable inventory
 * exists to fill it; a print PDP is indexable / gets Product schema only when the product is
 * genuinely purchasable. This reuses the verified print purchasability rule (printProduct.ts) rather
 * than inventing a second notion of "sellable".
 *
 * Pure + shared + unit-tested.
 */

import { hasPurchasableVariant, type PrintVariantView, type PrintMasterView } from "../commerce/printProduct";
import type { OpportunityScore } from "./scoring";

export type LandingDecision = "create" | "wait-for-inventory" | "skip";

export interface PrintLandingInput {
  slug: string;
  label: string;
  score: OpportunityScore;
  /** Fraction 0..1 of the SERP that is beatable (from serpComposition.independentShare). */
  serpIndependentShare: number;
  /** How many genuinely purchasable print products match this theme right now. */
  matchingPurchasableProducts: number;
}

export interface PrintLandingRecommendation {
  slug: string;
  label: string;
  decision: LandingDecision;
  reason: string;
  evidence: string;
}

/**
 * Decide whether to build a print landing page. Order matters: a weak/blocked SERP is a hard skip;
 * otherwise a good opportunity with NO purchasable inventory is "wait" (never publish an empty page);
 * only a good opportunity WITH inventory is "create".
 */
export function recommendPrintLanding(input: PrintLandingInput): PrintLandingRecommendation {
  const { slug, label, score } = input;
  const evidence = `Score ${score.score}/100; winnable SERP ${(input.serpIndependentShare * 100).toFixed(0)}%; ${input.matchingPurchasableProducts} purchasable product(s).`;

  if (score.band === "low" || input.serpIndependentShare < 0.2) {
    return { slug, label, decision: "skip", evidence, reason: "Demand is weak or the SERP is dominated by marketplaces/social — not worth a landing page now." };
  }
  if (input.matchingPurchasableProducts < 1) {
    return {
      slug, label, decision: "wait-for-inventory", evidence,
      reason: "The opportunity is real, but there is no purchasable print to list yet. Do not publish an empty page — build it once at least one matching variant is genuinely purchasable.",
    };
  }
  return {
    slug, label, decision: "create", evidence,
    reason: "Demand + a beatable SERP + real purchasable inventory justify a dedicated landing page.",
  };
}

/**
 * May a print PDP be indexed / carry Product structured data? ONLY when the product is genuinely
 * purchasable (active + eligible variant + ready master + price + checkout). Same rule as the feed
 * and the storefront — one source of truth, so an empty/preview product is never exposed to search.
 */
export function printPdpIndexable(variants: PrintVariantView[], master: PrintMasterView | null): boolean {
  return hasPurchasableVariant(variants, master);
}

/** Product schema is allowed under exactly the same condition — never for a non-purchasable product. */
export function printProductSchemaAllowed(variants: PrintVariantView[], master: PrintMasterView | null): boolean {
  return printPdpIndexable(variants, master);
}
