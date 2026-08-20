/**
 * MAY THIS PAINTING BE BOUGHT, RIGHT NOW, ON THIS WEBSITE?
 *
 * ONE function, used by the Admin badge, the artwork page, the cart revalidation and the
 * checkout session builder. The brief's reason for insisting on that is exactly right: four
 * implementations of "is it for sale" will disagree eventually, and the day they disagree is
 * the day two people buy the same painting or a sold one takes a card payment.
 *
 * It is PURE and it returns REASONS, not a boolean, because every caller needs to say
 * something different about the same "no" — Admin explains what to fix, the artwork page
 * shows an inquiry route, the checkout returns a 409.
 *
 * The frontend calling this proves nothing. The server calls it again immediately before
 * creating a Stripe session, against freshly read rows. See server/commerce/checkout.ts.
 */

/** The availability values her catalogue actually uses, plus the reservation state. */
export const AVAILABILITY_AVAILABLE = "available";
export const AVAILABILITY_SOLD = "sold";
/** Set while a checkout holds the work. Not a value she types; the system owns it. */
export const AVAILABILITY_RESERVED = "reserved";

export interface PurchasableArtwork {
  id: number;
  availability: string;
  directSaleEnabled: boolean;
  websitePriceMinor: number | null;
  websiteCurrency: string | null;
  shippingEnabled: boolean;
  /** An unexpired reservation held by SOMEBODY ELSE's checkout. */
  reservedUntil?: Date | string | null;
  /** Promised to a gallery or a collector — available, but not hers to sell. */
  hasCommitment?: boolean | null;
  /** ISO date the promise lapses. Blank/absent means open-ended, which keeps blocking. */
  commitmentUntil?: string | null;
}

export type NotPurchasableReason =
  | "direct-sale-disabled"
  | "no-website-price"
  | "no-currency"
  | "not-available"
  | "reserved"
  | "committed"
  | "shipping-not-configured";

export interface PurchasabilityResult {
  purchasable: boolean;
  reasons: NotPurchasableReason[];
}

export function purchasability(
  artwork: PurchasableArtwork,
  now: Date = new Date(),
): PurchasabilityResult {
  const reasons: NotPurchasableReason[] = [];

  if (!artwork.directSaleEnabled) reasons.push("direct-sale-disabled");

  if (!Number.isInteger(artwork.websitePriceMinor) || (artwork.websitePriceMinor ?? 0) <= 0) {
    reasons.push("no-website-price");
  }
  if (!artwork.websiteCurrency) reasons.push("no-currency");

  // ANY availability that is not exactly "available" blocks the sale. Written as a positive
  // test on purpose: a new value she invents in Admin — "on loan", "promised" — must fail
  // closed, and a blacklist would let it through.
  if (artwork.availability !== AVAILABILITY_AVAILABLE) reasons.push("not-available");

  if (isReservationActive(artwork.reservedUntil, now)) reasons.push("reserved");

  if (isCommitmentActive(artwork.hasCommitment, artwork.commitmentUntil, now)) reasons.push("committed");

  if (!artwork.shippingEnabled) reasons.push("shipping-not-configured");

  return { purchasable: reasons.length === 0, reasons };
}

export function isPurchasableArtwork(artwork: PurchasableArtwork, now?: Date): boolean {
  return purchasability(artwork, now).purchasable;
}

/** A reservation with no expiry is not a reservation; it is a bug that would strand a work. */
export function isReservationActive(reservedUntil: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!reservedUntil) return false;
  const until = reservedUntil instanceof Date ? reservedUntil : new Date(reservedUntil);
  if (Number.isNaN(until.getTime())) return false;
  return until.getTime() > now.getTime();
}

/**
 * Is a promise still binding?
 *
 * An OPEN-ENDED commitment blocks. "Promised to the gallery, no end date agreed" is exactly
 * the case where selling it out from under them would be worst, so a missing date is read as
 * "still promised" rather than as "no promise" — the flag is what she set, and only a date she
 * has actually passed releases it.
 *
 * An unreadable date blocks too, for the same reason.
 */
export function isCommitmentActive(
  hasCommitment: boolean | null | undefined,
  until: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!hasCommitment) return false;
  const raw = (until ?? "").trim();
  if (!raw) return true;
  const end = new Date(raw);
  if (Number.isNaN(end.getTime())) return true;
  // Inclusive of the final day: a commitment "until 2026-09-01" is binding all of that day.
  return end.getTime() + 24 * 60 * 60 * 1000 > now.getTime();
}

/** What Admin shows next to the toggle, so she can see what is still missing. */
export const REASON_LABEL: Record<NotPurchasableReason, string> = {
  "direct-sale-disabled": "Direct sale is off",
  "no-website-price": "No website price set",
  "no-currency": "No currency set",
  "not-available": "Availability is not “available”",
  "reserved": "Held by a checkout in progress",
  "committed": "Promised to a gallery or collector",
  "shipping-not-configured": "Shipping is not enabled",
};
