/**
 * PROMO CODE LOGIC — pure, server-authoritative, currency-aware.
 *
 * Everything a discount decision needs lives here as pure functions so the SAME code runs in the
 * "Apply" preview endpoint AND the final checkout POST — they can never diverge, and the client's
 * arithmetic is never trusted. A promo only ever reduces the ITEM SUBTOTAL; shipping is never
 * discounted and is not even passed in.
 *
 * Currency: the store prices originals in EUR and print variants in USD. A PERCENTAGE code is a
 * ratio and carries no currency. A FIXED code is an amount in a specific currency and only applies
 * to an order in that same currency — otherwise a "10 off" would silently mean 10 of the wrong money.
 */

export type PromoDiscountType = "percentage" | "fixed";
export type PromoAppliesTo = "all" | "originals" | "prints";
/** The two kinds of order. A cart is entirely one or the other (originals and prints check out separately). */
export type PromoItemType = "originals" | "prints";

/** Currencies the store actually prices in — the only ones a fixed-amount code may target. */
export const STORE_CURRENCIES = ["EUR", "USD"] as const;
export type StoreCurrency = (typeof STORE_CURRENCIES)[number];

/** The subset of a promo row the validator needs (from the DB, or an admin form under test). */
export interface PromoRecord {
  code: string;
  codeNormalized: string;
  discountType: PromoDiscountType | string;
  discountValue: number;
  currency: string | null;
  appliesTo: PromoAppliesTo | string;
  active: boolean;
  validFrom: Date | string | null;
  expiresAt: Date | string | null;
}

export type PromoError =
  | "not-found"
  | "inactive"
  | "not-yet-valid"
  | "expired"
  | "wrong-item"
  | "wrong-currency"
  | "invalid";

/** Concise, customer-safe messages. Never expose internal ids or record state beyond these. */
export const PROMO_ERROR_MESSAGE: Record<PromoError, string> = {
  "not-found": "Promo code not found",
  "inactive": "This promo code is inactive",
  "not-yet-valid": "This promo code is not valid yet",
  "expired": "This promo code has expired",
  "wrong-item": "This promo code does not apply to this item",
  "wrong-currency": "This promo code is for a different currency",
  "invalid": "This promo code cannot be applied",
};

/** trim + uppercase, so SAVE10, save10 and " save10 " are the SAME code for lookup. */
export function normalizePromoCode(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase();
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function appliesToItem(appliesTo: string, itemType: PromoItemType): boolean {
  return appliesTo === "all" || appliesTo === itemType;
}

/** True when a percentage value is a whole-or-fractional percent in the allowed 1..100 range. */
export function isValidPercentage(value: number): boolean {
  return Number.isFinite(value) && value >= 1 && value <= 100;
}

/** True when a fixed value is a positive integer number of minor units. */
export function isValidFixed(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export interface PromoContext {
  itemType: PromoItemType;
  /** The authoritative ORDER currency (EUR for originals, the variant currency for prints). */
  currency: string;
  now: Date;
}

/**
 * Validate a promo row (already looked up by normalized code, or null) against the order context.
 * Order of checks matches the spec: exists → active → valid_from → expiry → applies_to → value/currency.
 */
export function validatePromo(
  promo: PromoRecord | null | undefined,
  ctx: PromoContext,
): { ok: true; promo: PromoRecord } | { ok: false; error: PromoError } {
  if (!promo) return { ok: false, error: "not-found" };
  if (!promo.active) return { ok: false, error: "inactive" };

  const validFrom = toDate(promo.validFrom);
  if (validFrom && ctx.now < validFrom) return { ok: false, error: "not-yet-valid" };

  const expiresAt = toDate(promo.expiresAt);
  if (expiresAt && ctx.now >= expiresAt) return { ok: false, error: "expired" };

  if (!appliesToItem(String(promo.appliesTo), ctx.itemType)) return { ok: false, error: "wrong-item" };

  if (promo.discountType === "percentage") {
    if (!isValidPercentage(promo.discountValue)) return { ok: false, error: "invalid" };
  } else if (promo.discountType === "fixed") {
    if (!isValidFixed(promo.discountValue)) return { ok: false, error: "invalid" };
    if (!promo.currency) return { ok: false, error: "invalid" };
    if (promo.currency.toUpperCase() !== String(ctx.currency).toUpperCase()) {
      return { ok: false, error: "wrong-currency" };
    }
  } else {
    return { ok: false, error: "invalid" };
  }

  return { ok: true, promo };
}

/**
 * The discount, in minor units, applied to the item subtotal ONLY. Never negative, never more than
 * the subtotal (so the item total can't go below zero, and a percentage can't over-discount).
 */
export function computeDiscountMinor(
  discountType: PromoDiscountType | string,
  discountValue: number,
  itemsMinor: number,
): number {
  if (!Number.isFinite(itemsMinor) || itemsMinor <= 0) return 0;
  let discount = discountType === "percentage"
    ? Math.round((itemsMinor * discountValue) / 100)
    : Math.round(discountValue);
  if (!Number.isFinite(discount) || discount < 0) discount = 0;
  if (discount > itemsMinor) discount = itemsMinor; // cap at the subtotal — item total stays ≥ 0
  return discount;
}

export interface AppliedPromo {
  code: string;
  discountType: PromoDiscountType;
  discountValue: number;
  discountMinor: number;
  /** Item subtotal AFTER the discount. Shipping is added by the caller and is never discounted. */
  discountedItemsMinor: number;
  currency: string | null;
}

/**
 * Validate then price a promo in one call — the single entry point the preview endpoint and the
 * checkout handler both use. `itemsMinor` is the SERVER-resolved item subtotal (never the client's).
 */
export function applyPromo(
  promo: PromoRecord | null | undefined,
  ctx: PromoContext & { itemsMinor: number },
): { ok: true; applied: AppliedPromo } | { ok: false; error: PromoError } {
  const v = validatePromo(promo, ctx);
  if (!v.ok) return v;
  const discountMinor = computeDiscountMinor(v.promo.discountType, v.promo.discountValue, ctx.itemsMinor);
  return {
    ok: true,
    applied: {
      code: v.promo.codeNormalized,
      discountType: v.promo.discountType as PromoDiscountType,
      discountValue: v.promo.discountValue,
      discountMinor,
      discountedItemsMinor: ctx.itemsMinor - discountMinor,
      currency: v.promo.discountType === "fixed" ? (v.promo.currency ?? null) : null,
    },
  };
}
