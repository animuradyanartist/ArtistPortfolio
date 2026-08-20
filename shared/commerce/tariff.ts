/**
 * WHAT THIS SYSTEM IS WILLING TO SAY A SHIPMENT COSTS.
 *
 * READ THIS BEFORE CHANGING A NUMBER.
 *
 * These are NOT FedEx rates, and nothing in this repository should ever present them as one.
 * No carrier account, contract tariff, or historical shipment record was available when this
 * was written — the repositories were searched and hold none — so the figures below are a
 * deliberately CONSERVATIVE internal estimate: high enough that a real invoice is unlikely to
 * exceed them, and labelled "estimated" everywhere they surface.
 *
 * Being wrong high costs a sale. Being wrong low costs the painting AND the shipping, on a
 * work that cannot be reprinted. The asymmetry is the whole design.
 *
 * WHEN REAL EVIDENCE ARRIVES — an invoice, a rate card, a FedEx account — it replaces this
 * table and nothing else: `FedexRateProvider` in server/commerce/providers slots in beside
 * the deterministic one, and `SHIPPING_ESTIMATE_BASIS` below stops being the answer.
 *
 * Amounts are EUR minor units (cents).
 */
import type { ShippingZone } from "./zones";

export interface ZoneTariff {
  /** Charged before any weight, covering pickup, crating handling and paperwork. */
  baseMinor: number;
  /** Per chargeable kilogram of dimensional weight. */
  perKgMinor: number;
  /** Nothing ships for less than this, whatever the arithmetic says. */
  minimumMinor: number;
  /** Applied when the parcel trips an oversize test — see shipping.ts. */
  oversizeSurchargeMinor: number;
  /** Heaviest chargeable weight this zone will quote before demanding a manual quote. */
  maxChargeableKg: number;
}

/**
 * The provenance string that travels with every estimate produced from this table, into the
 * order snapshot and the UI. If a quote cannot say where its number came from, it should not
 * be shown to a buyer.
 */
export const SHIPPING_ESTIMATE_BASIS =
  "internal-conservative-estimate-v1 (no carrier account configured; not a FedEx tariff)";

/**
 * THE RATE CURVE, FITTED TO THE ANCHOR SHIPMENT.
 *
 * EU is derived first, from the one datapoint that carries a carrier, a size AND a chargeable
 * weight: 65×75cm to Germany, 11kg, ≈€321 paid after her account discount. With the corrected
 * 8cm crate that parcel computes 10.5kg, so:
 *
 *     €130 base + 10.5kg × €17 = €308.50   → +8% margin = €333    (paid: ≈€321, +4%)
 *
 * A base that large relative to the per-kilo rate is not an accident — international express
 * out of Armenia is dominated by fixed cost, which is why her 14.4kg Spain parcel cost barely
 * more than her 10.5kg German one. The other zones are scaled from EU on the same shape.
 *
 * WHAT THIS IS NOT: a FedEx tariff. It is fitted to ONE of her invoices and sanity-checked
 * against two quotes. See calibration.ts, and `calibration.test.ts`, which fails if a change
 * to these numbers stops reproducing the real shipment.
 *
 * Amounts are EUR minor units (cents).
 */
export const ZONE_TARIFF: Readonly<Record<ShippingZone, ZoneTariff>> = Object.freeze({
  AM:        { baseMinor:  2500, perKgMinor:   350, minimumMinor:  3500, oversizeSurchargeMinor:  1500, maxChargeableKg: 60 },
  NEARBY:    { baseMinor:  7000, perKgMinor:  1000, minimumMinor:  9000, oversizeSurchargeMinor:  2500, maxChargeableKg: 50 },
  EU:        { baseMinor: 13000, perKgMinor:  1700, minimumMinor: 18000, oversizeSurchargeMinor:  4000, maxChargeableKg: 45 },
  UK:        { baseMinor: 14000, perKgMinor:  1800, minimumMinor: 19000, oversizeSurchargeMinor:  4500, maxChargeableKg: 45 },
  EU_NON_EU: { baseMinor: 14500, perKgMinor:  1850, minimumMinor: 20000, oversizeSurchargeMinor:  4500, maxChargeableKg: 45 },
  NA:        { baseMinor: 17000, perKgMinor:  2300, minimumMinor: 26000, oversizeSurchargeMinor:  6000, maxChargeableKg: 40 },
  GCC:       { baseMinor: 15500, perKgMinor:  2100, minimumMinor: 23000, oversizeSurchargeMinor:  5500, maxChargeableKg: 40 },
  ROW:       { baseMinor: 19000, perKgMinor:  2700, minimumMinor: 30000, oversizeSurchargeMinor:  7000, maxChargeableKg: 35 },
});

/**
 * Added on top of the computed figure, as a fraction.
 *
 * Fuel and remote-area surcharges move, and this estimator cannot see them. 8% is the cushion,
 * applied last so it also covers the handling surcharge.
 *
 * It came down from 12% because the curve is now fitted to a real invoice rather than guessed:
 * a margin on top of an already-conservative guess was inflation twice over, and the anchor
 * figure is what she actually paid after her discount, not a list price.
 */
export const SAFETY_MARGIN_FRACTION = 0.08;

/** Oversize tests. Trips the surcharge rather than refusing — refusal is in shipping.ts. */
/**
 * ADDITIONAL HANDLING — a real carrier rule, kept, but no longer punitive.
 *
 * FedEx applies additional handling above roughly 121cm on the longest side or 266cm
 * length-plus-girth. Those thresholds are public and are left alone. What changed is the
 * surcharge: €90 on top of an already-overweight parcel was most of the remaining
 * over-estimate, and her own 65×75 shipment (251cm girth) never attracted it at all.
 */
export const OVERSIZE_LONGEST_SIDE_CM = 121;
export const OVERSIZE_LENGTH_PLUS_GIRTH_CM = 266;

/**
 * BEYOND A STANDARD PARCEL — which is not the same as "cannot be shipped".
 *
 * 274cm longest side and 330cm length-plus-girth are the published limits of standard
 * international express. A crate past them still travels; it travels as freight, on a quote,
 * which is a conversation and not a checkout button. So the estimator declines to PRICE it and
 * says so in those words — the work stays listed, keeps its price, and offers a quote route.
 *
 * DOMESTIC ARMENIA IS EXEMPT. A large canvas crossing Yerevan goes in a van, and refusing to
 * quote it because an international parcel rule says so was simply wrong: the first version
 * declined her largest works even for local delivery.
 */
export const MAX_LONGEST_SIDE_CM = 274;
export const MAX_LENGTH_PLUS_GIRTH_CM = 330;

/** Domestic delivery is a van, not a parcel network. */
export const DOMESTIC_MAX_LONGEST_SIDE_CM = 400;
export const DOMESTIC_MAX_LENGTH_PLUS_GIRTH_CM = 900;
