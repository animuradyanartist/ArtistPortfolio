/**
 * PROMO, RESOLVED FOR ONE PRICED ORDER — the single server-side bridge between the promo table and
 * a checkout. The "Apply" preview endpoints AND the final checkout POST both call this, so the
 * discount a customer is shown is exactly the discount they are charged, and neither trusts the
 * client's arithmetic. `itemsMinor` and `currency` are ALWAYS the server-resolved values.
 */
import { applyPromo, normalizePromoCode, PROMO_ERROR_MESSAGE, type AppliedPromo, type PromoItemType } from "@shared/commerce/promo";
import { getPromoByCode } from "./promoRepo";

export type PromoResolution =
  | { status: "none" }
  | { status: "applied"; applied: AppliedPromo; promoId: number }
  | { status: "error"; error: string; message: string };

/**
 * Look the code up, validate it against this order, and price the discount — or report why it does
 * not apply. An empty/absent code is `none` (a normal no-promo checkout), never an error.
 */
export async function resolvePromoForOrder(
  rawCode: unknown,
  ctx: { itemType: PromoItemType; currency: string; itemsMinor: number; now: Date },
): Promise<PromoResolution> {
  const code = normalizePromoCode(rawCode);
  if (!code) return { status: "none" };

  const promo = await getPromoByCode(code);
  const result = applyPromo(promo ?? null, ctx);
  if (!result.ok) {
    return { status: "error", error: result.error, message: PROMO_ERROR_MESSAGE[result.error] };
  }
  return { status: "applied", applied: result.applied, promoId: promo!.id };
}

/** The order columns to snapshot from an applied promo (nulls for a no-promo order). */
export function promoOrderSnapshot(res: PromoResolution): {
  promo_code: string | null;
  promo_discount_minor: number | null;
  promo_discount_type: string | null;
  promo_discount_value: number | null;
  promo_code_id: number | null;
} {
  if (res.status !== "applied") {
    return { promo_code: null, promo_discount_minor: null, promo_discount_type: null, promo_discount_value: null, promo_code_id: null };
  }
  return {
    promo_code: res.applied.code,
    promo_discount_minor: res.applied.discountMinor,
    promo_discount_type: res.applied.discountType,
    promo_discount_value: res.applied.discountValue,
    promo_code_id: res.promoId,
  };
}
