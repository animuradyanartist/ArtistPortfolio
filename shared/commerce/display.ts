/**
 * WHAT A PUBLIC PAGE MAY SAY AND OFFER ABOUT ONE PAINTING.
 *
 * Every surface that shows a price or a Buy control asks THIS, so the grid, the detail page and
 * the checkout cannot drift into disagreeing about whether a work is for sale or what it costs.
 * It is a thin wrapper over `purchasability()` — the same rule the server enforces before it
 * creates a Stripe session — precisely so there is no second opinion to maintain.
 *
 * IT DELIBERATELY DOES NOT KNOW WHETHER STRIPE IS CONFIGURED. That is a server fact, delivered
 * per-request by /api/commerce/quote, and only the purchase panel needs it. What this decides
 * is narrower and safe to compute anywhere: is this work ON SALE HERE, and therefore is the
 * marketplace a SECONDARY route rather than the primary one?
 *
 * The distinction matters for the bug this exists to prevent. A work she has put on direct sale
 * must never show a primary "Buy Now" that leaves for a marketplace — not while Stripe is being
 * configured, not while shipping needs a quote, not on the grid, not in a modal. In every one of
 * those states the honest primary action is on this site; the marketplace stays, clearly, as a
 * secondary link.
 */
import { purchasability, type PurchasableArtwork } from "./purchasable";
import { formatMoney, isCurrency, DEFAULT_CURRENCY, type Currency } from "./money";

/** The artwork fields any public surface has to hand. */
export interface DisplayArtwork extends PurchasableArtwork {
  /** The MARKETPLACE figure. Never the sale price; shown only when direct sale is off. */
  price?: number | null;
  buyLink?: string | null;
  saatchiUrl?: string | null;
}

export interface ArtworkCommerceDisplay {
  /**
   * She has switched this work on for direct sale AND priced it. True even when something else
   * currently blocks the sale — a live reservation, shipping that needs a quote, Stripe not yet
   * configured — because in all of those the answer is still "buy it here", never "go away to a
   * marketplace".
   */
  directSale: boolean;
  /** Nothing at all stands in the way right now. */
  purchasableNow: boolean;
  /** The website price, formatted, when direct sale applies. */
  websitePrice: string | null;
  currency: Currency;
  /** Where the primary control should point when direct sale applies. */
  checkoutPath: string;
  /** The marketplace, demoted to secondary — or null when there is none. */
  marketplaceUrl: string | null;
  /** Says where it goes, rather than pretending to be a purchase. */
  marketplaceLabel: string;
  /** May a surface show an external marketplace link as its PRIMARY buy control? */
  marketplacePrimaryAllowed: boolean;
}

export function artworkCommerceDisplay(
  a: DisplayArtwork,
  now: Date = new Date(),
): ArtworkCommerceDisplay {
  const priced = Number.isInteger(a.websitePriceMinor) && (a.websitePriceMinor ?? 0) > 0;
  const directSale = a.directSaleEnabled === true && priced;
  const currency: Currency = isCurrency(a.websiteCurrency) ? a.websiteCurrency : DEFAULT_CURRENCY;
  const marketplaceUrl = a.buyLink || a.saatchiUrl || null;

  return {
    directSale,
    purchasableNow: purchasability(a, now).purchasable,
    websitePrice: directSale ? formatMoney(a.websitePriceMinor!, currency) : null,
    currency,
    checkoutPath: `/checkout?artwork=${a.id}`,
    marketplaceUrl,
    // Named for its destination. "Buy Now" pointing off-site was the whole complaint.
    marketplaceLabel: a.saatchiUrl && !a.buyLink ? "View on Saatchi Art" : "View on Singulart",
    // THE RULE, in one place: once a work is on direct sale here, no surface may lead with an
    // off-site purchase.
    marketplacePrimaryAllowed: !directSale,
  };
}
