/**
 * THE REAL SHIPMENTS THIS ESTIMATOR IS CALIBRATED AGAINST.
 *
 * Three figures the owner supplied from her own shipping history out of Armenia. They are
 * EVIDENCE, not a tariff: no carrier account or rate card is available to this system, and
 * nothing here may be presented as an official FedEx price.
 *
 * They are kept in a file of their own, with their units and their doubts attached, because
 * `calibration.test.ts` asserts the estimator still reproduces them. That is what stops the
 * tariff drifting back into a number somebody guessed.
 *
 * ── THE AMD → EUR RATE IS A CALIBRATION CONSTANT, NOT A RUNTIME CONVERSION ────────────────
 *
 * The rate below is used ONCE, here, to express historical Armenian invoices in the currency
 * the shop actually charges. It is never called at runtime, never applied to a price, and
 * never used to convert an order. A shop that converted currencies live from a hardcoded rate
 * would mis-charge every time the rate moved; this one prices in EUR and stays there.
 */

/** Approximate mid-market rate, 2026. Only ever used to read the evidence below. */
export const AMD_PER_EUR_FOR_CALIBRATION = 420;

export interface ShipmentEvidence {
  label: string;
  widthCm: number;
  heightCm: number;
  destinationCountry: string;
  amountAmd: number;
  /** The chargeable weight the carrier itself used, when she was told it. */
  reportedChargeableKg?: number;
  /** Anything that makes the figure less than a clean comparison. */
  caveat: string;
}

export const SHIPMENT_EVIDENCE: readonly ShipmentEvidence[] = [
  {
    label: "80×90 Armenia → Spain",
    widthCm: 80, heightCm: 90, destinationCountry: "ES",
    amountAmd: 120_000,
    caveat: "Service level and date unknown; no chargeable weight reported.",
  },
  {
    label: "80×90 Armenia → Spain (second quote)",
    widthCm: 80, heightCm: 90, destinationCountry: "ES",
    amountAmd: 130_000,
    caveat: "A quote rather than an invoice.",
  },
  {
    /**
     * THE ANCHOR. The only datapoint with a carrier, a destination, a size AND a chargeable
     * weight, so it is the one the model is fitted to. The other two corroborate the band.
     */
    label: "65×75 Armenia → Germany, FedEx",
    widthCm: 65, heightCm: 75, destinationCountry: "DE",
    amountAmd: 135_000, reportedChargeableKg: 11,
    caveat: "After a reported 15% account discount, so it reflects what she pays, not list.",
  },
];

export const evidenceEur = (e: ShipmentEvidence): number =>
  Math.round(e.amountAmd / AMD_PER_EUR_FOR_CALIBRATION);

/**
 * WHY THE EVIDENCE CANNOT BE FITTED EXACTLY, stated rather than smoothed over.
 *
 * The Spain figures are for a LARGER parcel than the Germany one and are LOWER — different
 * destinations, different dates, probably different service levels. No monotonic curve passes
 * through all three. So the model is fitted to the anchor and the Spain figures are used only
 * to check the result lands in a believable band. Pretending otherwise would be a curve
 * chosen to look calibrated rather than to be.
 */
export const CALIBRATION_NOTE =
  "Fitted to the FedEx Germany shipment (11kg chargeable, ≈€321 paid). The Spain figures " +
  "corroborate a €280–320 band for mid-size works to the EU but are not mutually consistent " +
  "with it, so they are a sanity check rather than fit points.";
