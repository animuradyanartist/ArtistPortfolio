/**
 * FROM A PAINTING TO A PARCEL.
 *
 * A carrier charges for the box, not the canvas. An unstretched 100x80cm work leaves the
 * studio as a crated parcel with margin on every side and a depth that has nothing to do
 * with the thickness of the paint.
 *
 * EVERY NUMBER HERE IS CONFIGURATION. The brief is explicit that the volumetric divisor must
 * not be buried in business logic, and the same argument applies to the margin and the depth:
 * a carrier changes its divisor, or she changes her crating, and this file changes — nothing
 * else does. Per-artwork overrides beat the defaults, because she knows which works are
 * awkward and the formula does not.
 */

export interface PackingConfig {
  /** Added to BOTH width and height — 10cm of margin is 5cm of padding on each side. */
  packingMarginCm: number;
  /** The depth of a crated painting. Not derived from the artwork; crating decides it. */
  packedDepthCm: number;
  /**
   * kg = (l × w × h in cm) / divisor. 5000 is the common express figure and is a DEFAULT,
   * not a claim about any particular carrier's current tariff.
   */
  volumetricDivisor: number;
  /** Chargeable weight is rounded UP to this step. Carriers round up; so do we. */
  weightRoundingStepKg: number;
}

/**
 * CALIBRATED, NOT GUESSED — and the depth is the number that mattered.
 *
 * The first version used a 12cm crate. Against the owner's own FedEx shipment — a 65×75cm work
 * the carrier billed at ~11kg — a 12cm crate computes 15.3kg: roughly 50% too heavy on EVERY
 * work, which then multiplied through the per-kilo rate AND pushed almost every painting over
 * the additional-handling threshold. That single wrong constant was most of why a 79×71cm work
 * quoted €613 to Germany.
 *
 * 8cm reproduces the carrier's own figure: 75×85×8 = 10.2kg against a reported 11kg. It is
 * also the depth the specification itself uses in its worked example. A flat canvas travels in
 * a flat crate; 12cm was the thickness of a box nobody was packing.
 */
export const DEFAULT_PACKING: PackingConfig = {
  packingMarginCm: 10,
  packedDepthCm: 8,
  volumetricDivisor: 5000,
  weightRoundingStepKg: 0.5,
};

/** Per-artwork overrides. Any field left null falls through to the configured default. */
export interface PackingOverrides {
  packedDepthCm?: number | null;
  packingMarginCm?: number | null;
}

export interface PackedParcel {
  packedWidthCm: number;
  packedHeightCm: number;
  packedDepthCm: number;
  /** Before rounding — kept so a quote can show its own arithmetic. */
  rawVolumetricKg: number;
  /** What a carrier would actually bill, rounded up to the configured step. */
  chargeableWeightKg: number;
  config: PackingConfig;
}

export function packArtwork(
  size: { widthCm: number; heightCm: number },
  overrides: PackingOverrides = {},
  base: PackingConfig = DEFAULT_PACKING,
): PackedParcel {
  const config: PackingConfig = {
    ...base,
    packingMarginCm: overrides.packingMarginCm ?? base.packingMarginCm,
    packedDepthCm: overrides.packedDepthCm ?? base.packedDepthCm,
  };

  const packedWidthCm = round1(size.widthCm + config.packingMarginCm);
  const packedHeightCm = round1(size.heightCm + config.packingMarginCm);
  const packedDepthCm = round1(config.packedDepthCm);

  const rawVolumetricKg = (packedWidthCm * packedHeightCm * packedDepthCm) / config.volumetricDivisor;
  const step = config.weightRoundingStepKg;
  const chargeableWeightKg = Math.ceil(rawVolumetricKg / step) * step;

  return {
    packedWidthCm, packedHeightCm, packedDepthCm,
    rawVolumetricKg: Math.round(rawVolumetricKg * 1000) / 1000,
    chargeableWeightKg: Math.round(chargeableWeightKg * 100) / 100,
    config,
  };
}

/** Longest single side — carriers surcharge on it, so it is computed once here. */
export function longestSideCm(p: PackedParcel): number {
  return Math.max(p.packedWidthCm, p.packedHeightCm, p.packedDepthCm);
}

/** Length + girth, the other standard oversize test. */
export function lengthPlusGirthCm(p: PackedParcel): number {
  const dims = [p.packedWidthCm, p.packedHeightCm, p.packedDepthCm].sort((a, b) => b - a);
  return round1(dims[0]! + 2 * (dims[1]! + dims[2]!));
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
