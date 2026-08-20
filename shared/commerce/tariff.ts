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

export const ZONE_TARIFF: Readonly<Record<ShippingZone, ZoneTariff>> = Object.freeze({
  AM:        { baseMinor:  2500, perKgMinor:   400, minimumMinor:  3500, oversizeSurchargeMinor:  2000, maxChargeableKg: 60 },
  NEARBY:    { baseMinor:  6000, perKgMinor:  1400, minimumMinor:  9000, oversizeSurchargeMinor:  5000, maxChargeableKg: 50 },
  EU:        { baseMinor:  9000, perKgMinor:  2100, minimumMinor: 16000, oversizeSurchargeMinor:  9000, maxChargeableKg: 45 },
  UK:        { baseMinor: 10000, perKgMinor:  2400, minimumMinor: 18000, oversizeSurchargeMinor: 10000, maxChargeableKg: 45 },
  EU_NON_EU: { baseMinor: 10500, perKgMinor:  2500, minimumMinor: 19000, oversizeSurchargeMinor: 10000, maxChargeableKg: 45 },
  NA:        { baseMinor: 12000, perKgMinor:  3000, minimumMinor: 24000, oversizeSurchargeMinor: 12000, maxChargeableKg: 40 },
  GCC:       { baseMinor: 11000, perKgMinor:  2800, minimumMinor: 22000, oversizeSurchargeMinor: 11000, maxChargeableKg: 40 },
  ROW:       { baseMinor: 14000, perKgMinor:  3600, minimumMinor: 28000, oversizeSurchargeMinor: 14000, maxChargeableKg: 35 },
});

/**
 * Added on top of the computed figure, as a fraction.
 *
 * Fuel and remote-area surcharges move, and this estimator cannot see them. 12% is the
 * cushion; it is configuration, and it is applied last so it also covers the surcharge.
 */
export const SAFETY_MARGIN_FRACTION = 0.12;

/** Oversize tests. Trips the surcharge rather than refusing — refusal is in shipping.ts. */
export const OVERSIZE_LONGEST_SIDE_CM = 120;
export const OVERSIZE_LENGTH_PLUS_GIRTH_CM = 266;

/** Beyond these a parcel stops being a parcel and needs a human. */
export const MAX_LONGEST_SIDE_CM = 200;
export const MAX_LENGTH_PLUS_GIRTH_CM = 330;
