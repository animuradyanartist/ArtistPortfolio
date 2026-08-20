/**
 * THE SHIPPING ESTIMATE, AND ITS REFUSALS.
 *
 * The single rule this file exists to enforce: when the inputs are not good enough to quote,
 * it does NOT quote. It returns a refusal with a reason, and the checkout path turns that
 * into "Shipping quote required" and a contact route. There is no branch anywhere below that
 * substitutes a default price for missing data — that is how a website silently ships a
 * 120cm canvas to Dubai for the price of a postcard.
 *
 * Precedence, highest first:
 *   1. a manual per-destination override she has set for this artwork
 *   2. a manual flat override she has set for this artwork
 *   3. the deterministic estimate from packing + zone tariff
 *   4. refusal
 */
import { parseArtworkSize } from "./dimensions";
import { packArtwork, longestSideCm, lengthPlusGirthCm, type PackingConfig, type PackingOverrides, type PackedParcel, DEFAULT_PACKING } from "./packing";
import { zoneFor, type ShippingZone } from "./zones";
import {
  ZONE_TARIFF, SAFETY_MARGIN_FRACTION, SHIPPING_ESTIMATE_BASIS,
  OVERSIZE_LONGEST_SIDE_CM, OVERSIZE_LENGTH_PLUS_GIRTH_CM,
  MAX_LONGEST_SIDE_CM, MAX_LENGTH_PLUS_GIRTH_CM,
} from "./tariff";

/** What the estimator is told about one artwork. Deliberately not the DB row. */
export interface ShippableArtwork {
  id: number;
  title: string;
  dimensions: string | null;
  shippingEnabled: boolean;
  /** Flat override in EUR minor units, any destination. */
  shippingOverrideMinor?: number | null;
  /** Per-country overrides, e.g. { DE: 19000 }. Beats the flat override. */
  shippingDestinationOverrides?: Record<string, number> | null;
  packedDepthCm?: number | null;
  packingMarginCm?: number | null;
}

export type ShippingQuote =
  | {
      ok: true;
      amountMinor: number;
      zone: ShippingZone;
      countryCode: string;
      /** How this number was arrived at — shown to the buyer and stored on the order. */
      basis: "manual-destination-override" | "manual-override" | typeof SHIPPING_ESTIMATE_BASIS;
      /** True whenever a human did not set this number. Drives the "estimated" label. */
      estimated: boolean;
      parcel: PackedParcel | null;
      oversize: boolean;
      breakdown: {
        baseMinor: number; weightMinor: number; oversizeMinor: number;
        safetyMarginMinor: number; chargeableWeightKg: number;
      } | null;
    }
  | {
      ok: false;
      /** Machine-readable so the UI can choose its wording without matching on prose. */
      reason:
        | "shipping-disabled"
        | "unsupported-destination"
        | "unknown-dimensions"
        | "parcel-too-large"
        | "over-weight-limit";
      countryCode: string;
      zone: ShippingZone | null;
      detail: string;
    };

export interface EstimateOptions {
  packingConfig?: PackingConfig;
}

export function estimateShipping(
  artwork: ShippableArtwork,
  countryCodeRaw: string,
  opts: EstimateOptions = {},
): ShippingQuote {
  const countryCode = (countryCodeRaw ?? "").trim().toUpperCase();
  const zone = zoneFor(countryCode);

  if (!artwork.shippingEnabled) {
    return { ok: false, reason: "shipping-disabled", countryCode, zone,
      detail: "Shipping is not enabled for this work." };
  }
  if (!zone) {
    return { ok: false, reason: "unsupported-destination", countryCode, zone: null,
      detail: "This destination is not quoted automatically." };
  }

  // 1 & 2 — a number a human chose always wins, and is never labelled an estimate.
  const perDestination = artwork.shippingDestinationOverrides?.[countryCode];
  if (isPositiveInt(perDestination)) {
    return quoteFromOverride(perDestination, "manual-destination-override", zone, countryCode);
  }
  if (isPositiveInt(artwork.shippingOverrideMinor)) {
    return quoteFromOverride(artwork.shippingOverrideMinor, "manual-override", zone, countryCode);
  }

  // 3 — the deterministic estimate. Everything from here can still refuse.
  const size = parseArtworkSize(artwork.dimensions);
  if (!size) {
    return { ok: false, reason: "unknown-dimensions", countryCode, zone,
      detail: "This work's dimensions could not be read, so shipping cannot be estimated." };
  }

  const overrides: PackingOverrides = {
    packedDepthCm: artwork.packedDepthCm ?? null,
    packingMarginCm: artwork.packingMarginCm ?? null,
  };
  const parcel = packArtwork(size, overrides, opts.packingConfig ?? DEFAULT_PACKING);

  const longest = longestSideCm(parcel);
  const girth = lengthPlusGirthCm(parcel);
  if (longest > MAX_LONGEST_SIDE_CM || girth > MAX_LENGTH_PLUS_GIRTH_CM) {
    return { ok: false, reason: "parcel-too-large", countryCode, zone,
      detail: "Crated, this work exceeds the size this estimator will quote." };
  }

  const tariff = ZONE_TARIFF[zone];
  if (parcel.chargeableWeightKg > tariff.maxChargeableKg) {
    return { ok: false, reason: "over-weight-limit", countryCode, zone,
      detail: "Crated, this work exceeds the weight this estimator will quote to that destination." };
  }

  const oversize = longest > OVERSIZE_LONGEST_SIDE_CM || girth > OVERSIZE_LENGTH_PLUS_GIRTH_CM;

  const baseMinor = tariff.baseMinor;
  const weightMinor = Math.ceil(parcel.chargeableWeightKg * tariff.perKgMinor);
  const oversizeMinor = oversize ? tariff.oversizeSurchargeMinor : 0;
  const subtotal = baseMinor + weightMinor + oversizeMinor;
  // Margin last, so it also covers the surcharge. Rounded UP — never in the buyer's favour
  // by accident, because the shortfall is hers to absorb.
  const safetyMarginMinor = Math.ceil(subtotal * SAFETY_MARGIN_FRACTION);
  const amountMinor = Math.max(subtotal + safetyMarginMinor, tariff.minimumMinor);

  return {
    ok: true, amountMinor, zone, countryCode,
    basis: SHIPPING_ESTIMATE_BASIS, estimated: true, parcel, oversize,
    breakdown: { baseMinor, weightMinor, oversizeMinor, safetyMarginMinor,
      chargeableWeightKg: parcel.chargeableWeightKg },
  };
}

/**
 * MULTIPLE PAINTINGS IN ONE ORDER — PART 12, resolved on the safe side.
 *
 * Two crated canvases might travel as one parcel for barely more than one, or as two parcels
 * for exactly twice. This estimator cannot tell which without knowing how she will pack them,
 * so it does not guess: each work is quoted as its own parcel and the quotes are SUMMED.
 *
 * That over-charges a buyer who orders two small works. It is still the right v1: the failure
 * mode is a refund she can choose to give, not a shipment she cannot afford to send. The
 * alternative — assuming combined packing — is unrecoverable in the other direction.
 *
 * A single refusal refuses the whole order, because a cart that silently drops the
 * unshippable line and quotes the rest is a cart that lies about its total.
 */
export function estimateShippingForCart(
  artworks: readonly ShippableArtwork[],
  countryCode: string,
  opts: EstimateOptions = {},
): { ok: true; amountMinor: number; perArtwork: ShippingQuote[] } | { ok: false; failed: ShippingQuote; perArtwork: ShippingQuote[] } {
  const perArtwork = artworks.map((a) => estimateShipping(a, countryCode, opts));
  const failed = perArtwork.find((q) => !q.ok);
  if (failed && !failed.ok) return { ok: false, failed, perArtwork };
  let amountMinor = 0;
  for (const q of perArtwork) if (q.ok) amountMinor += q.amountMinor;
  return { ok: true, amountMinor, perArtwork };
}

function quoteFromOverride(
  amountMinor: number,
  basis: "manual-destination-override" | "manual-override",
  zone: ShippingZone,
  countryCode: string,
): ShippingQuote {
  return { ok: true, amountMinor, zone, countryCode, basis, estimated: false,
    parcel: null, oversize: false, breakdown: null };
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}
