/**
 * WHICH ORIGINAL PAINTINGS MAY GO INTO THE GOOGLE MERCHANT FEED — and their exact feed shape.
 *
 * Eligibility is NOT re-invented here. It is the ONE canonical `isPurchasableArtwork` gate that the
 * artwork page, the cart revalidation and the Stripe checkout already use (directSale on + a positive
 * website price + a currency + availability exactly "available" + not reserved + not committed +
 * shipping enabled). If a work cannot be bought on the site right now, it is not in the feed — a sold,
 * de-listed, inquiry-only, price-on-request or committed work is excluded automatically, and a newly
 * published purchasable original is included automatically on the next feed refresh. Unique quantity:
 * one work, in_stock while available.
 *
 * PRICE is the artwork's OWN website price (`websitePriceMinor`/`websiteCurrency`) — the figure the PDP
 * shows and Stripe charges — never the marketplace `price`. LINK is the artwork's real canonical path.
 * IMAGE is the first-party /img/artwork route (an artwork has no print master; nothing private is ever
 * referenced). Pure over its input, so it is unit-tested without a database.
 */
import { isPurchasableArtwork, type PurchasableArtwork } from "./purchasable";
import { estimateShipping, shippingMinorInCurrency, type ShippableArtwork } from "./shipping";
import { artworkCanonicalPath, type CanonicalArtwork } from "../canonical";
import type { MerchantOriginalItem, MerchantShipping } from "./merchantFeed";

/**
 * The originals launch market: Germany, France, Italy, Austria — all EUR, and the destinations the
 * checkout estimator quotes for these works (they resolve to one EU zone, so the amounts match). An
 * original must have a usable automatic quote to EVERY one of these to enter the feed, so a work whose
 * shipping refuses (e.g. a freight-only oversized canvas) is excluded rather than advertised as buyable.
 */
export const MERCHANT_ORIGINAL_SHIP_COUNTRIES = ["DE", "FR", "IT", "AT"] as const;

/** Everything the selector needs from an artwork row (purchasability + canonical + shipping inputs). */
export interface MerchantOriginalArtwork extends PurchasableArtwork, CanonicalArtwork, ShippableArtwork {
  /** oil | acrylic | mixed — drives the "Original <medium> Painting" title. */
  type?: string | null;
  /** The artist's own published description (public copy), used verbatim when present. */
  description?: string | null;
  /** Stored image values (base64 or URL); the count drives additional_image_link. */
  images?: (string | null)[] | null;
}

/** type column → the clean medium word placed in the title. Unknown/blank → "" ("Original Painting"). */
const TYPE_LABEL: Record<string, string> = { oil: "Oil", acrylic: "Acrylic", mixed: "Mixed-Media" };

export function typeLabelFor(type: string | null | undefined): string {
  return TYPE_LABEL[(type ?? "").trim().toLowerCase()] ?? "";
}

/**
 * Shipping for one original to every launch country, using the AUTHORITATIVE checkout estimator
 * (`estimateShipping`) — the exact same pure function `/api/commerce/quote` and the checkout run, so the
 * feed amount equals what the customer is charged, with no duplicated or approximated logic. Returns
 * `null` if the work cannot be quoted to EVERY launch country (e.g. parcel-too-large / freight-only) —
 * that work is then excluded from the feed. The shipping currency is the artwork's own website currency.
 */
function shippingForLaunchCountries(a: MerchantOriginalArtwork): MerchantShipping[] | null {
  const currency = a.websiteCurrency as string;
  const out: MerchantShipping[] = [];
  for (const country of MERCHANT_ORIGINAL_SHIP_COUNTRIES) {
    const q = estimateShipping(a, country);
    if (!q.ok) return null; // a refusal to any launch country → not automatically purchasable there
    // The estimator is EUR; convert to the work's own currency (USD) at the fixed rate the
    // checkout uses, so the advertised shipping equals what the buyer is charged.
    out.push({ country, priceMinor: shippingMinorInCurrency(q.amountMinor, currency), currency });
  }
  return out;
}

/**
 * Select + serialise the ORIGINAL paintings that belong in the Merchant feed. A work is included ONLY
 * when it passes the canonical purchasability gate AND has a usable automatic shipping quote to every
 * launch country; each included work carries its exact per-country shipping. `now` is injectable so
 * reservation/commitment expiry is testable.
 */
export function selectMerchantOriginals(
  artworks: MerchantOriginalArtwork[],
  now?: Date,
): MerchantOriginalItem[] {
  const out: MerchantOriginalItem[] = [];
  for (const a of artworks) {
    if (!isPurchasableArtwork(a, now)) continue;
    const shipping = shippingForLaunchCountries(a);
    if (!shipping) continue; // no usable automatic quote (e.g. freight-only) → excluded
    out.push({
      id: a.id,
      title: a.title,
      path: artworkCanonicalPath(a),
      description: a.description ?? null,
      typeLabel: typeLabelFor(a.type),
      // Guaranteed a positive integer by isPurchasableArtwork; the `!` documents that invariant.
      priceMinor: a.websitePriceMinor as number,
      currency: a.websiteCurrency as string,
      imageCount: Array.isArray(a.images)
        ? a.images.filter((i) => typeof i === "string" && i.trim()).length
        : null,
      shipping,
    });
  }
  return out;
}
