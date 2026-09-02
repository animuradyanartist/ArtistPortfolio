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
import { artworkCanonicalPath, type CanonicalArtwork } from "../canonical";
import type { MerchantOriginalItem } from "./merchantFeed";

/** Everything the selector needs from an artwork row (a superset of the purchasability + canonical inputs). */
export interface MerchantOriginalArtwork extends PurchasableArtwork, CanonicalArtwork {
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
 * Select + serialise the ORIGINAL paintings that belong in the Merchant feed. Filters by the canonical
 * purchasability gate, then maps each eligible work to a `MerchantOriginalItem`. `now` is injectable so
 * reservation/commitment expiry is testable.
 */
export function selectMerchantOriginals(
  artworks: MerchantOriginalArtwork[],
  now?: Date,
): MerchantOriginalItem[] {
  return artworks
    .filter((a) => isPurchasableArtwork(a, now))
    .map((a) => ({
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
    }));
}
