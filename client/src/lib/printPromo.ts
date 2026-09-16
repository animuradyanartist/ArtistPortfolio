/**
 * PRINT PROMO — DISPLAY ONLY.
 *
 * This module lets the print PDP *show* the live promotion (a struck normal price beside the
 * discounted one, and the code to enter). It is NOT the source of truth: the real discount is
 * looked up and re-validated server-side from the `promo_codes` table at checkout
 * (see server/commerce/promoCheckout.ts + shared/commerce/promo.ts). This constant simply MIRRORS
 * that DB row so a landing visitor sees the offer before checkout — the server still owns the money.
 *
 * The discount maths here are byte-for-byte the same as the server's `computeDiscountMinor`
 * (Math.round(price * pct / 100)), so the price the PDP advertises always equals the price the
 * checkout charges. If the DB promo is edited/expired, worst case the PDP is briefly out of step and
 * the checkout — the authority — corrects it; the date gate below auto-hides it after it ends.
 */

export interface PrintPromo {
  /** The code the customer types at checkout. */
  code: string;
  /** Whole-percent discount off the item subtotal (matches the DB percentage promo). */
  percentOff: number;
  /** Exclusive end — the promo is shown while now < endsAt. "Valid through Sep 30" → Oct 1 00:00Z. */
  endsAt: Date;
  /** Human label for the end date, e.g. "September 30". */
  endsLabel: string;
}

/**
 * The current print promotion, mirroring the DB row `SAVE30`. Kept here as the single place the
 * storefront reads the campaign from; update or remove it when the DB promo changes.
 */
const CURRENT_PRINT_PROMO: PrintPromo = {
  code: "SAVE30",
  percentOff: 30,
  endsAt: new Date("2026-10-01T00:00:00Z"), // valid THROUGH 30 September 2026
  endsLabel: "September 30",
};

/** The promo to display right now, or null once it has ended (so a stale page never over-promises). */
export function activePrintPromo(now: Date = new Date()): PrintPromo | null {
  return now < CURRENT_PRINT_PROMO.endsAt ? CURRENT_PRINT_PROMO : null;
}

/**
 * Discount in minor units for a percentage promo — IDENTICAL rounding to the server
 * (shared/commerce/promo.ts `computeDiscountMinor`). Never negative, never over the subtotal.
 */
export function promoDiscountMinor(priceMinor: number, percentOff: number): number {
  if (!Number.isFinite(priceMinor) || priceMinor <= 0) return 0;
  let discount = Math.round((priceMinor * percentOff) / 100);
  if (!Number.isFinite(discount) || discount < 0) discount = 0;
  if (discount > priceMinor) discount = priceMinor;
  return discount;
}

/** The discounted item price (per selected variant), in minor units. */
export function promoPriceMinor(priceMinor: number, percentOff: number): number {
  return priceMinor - promoDiscountMinor(priceMinor, percentOff);
}
