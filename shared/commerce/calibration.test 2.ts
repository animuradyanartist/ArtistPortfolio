/**
 * DOES THE ESTIMATOR STILL REPRODUCE HER REAL SHIPMENTS?
 *
 * This is the test that stops the tariff drifting back into invention. If somebody changes a
 * base rate, a per-kilo figure, the crate depth or the divisor, and the model stops matching
 * what she actually paid, this fails and says by how much.
 *
 * The bands are asymmetric on purpose: over-estimating loses a sale, under-estimating loses
 * the painting AND the carriage. So the model may sit above the evidence and may not sit
 * meaningfully below it.
 */
import { describe, it, expect } from "vitest";
import { estimateShipping } from "./shipping";
import { parseArtworkSize } from "./dimensions";
import { packArtwork } from "./packing";
import { SHIPMENT_EVIDENCE, evidenceEur } from "./calibration";

const work = (w: number, h: number) => ({
  id: 1, title: "x", dimensions: `${w}x${h}cm`, shippingEnabled: true,
});

describe("the anchor shipment — 65×75 Armenia → Germany, FedEx, 11kg, ≈€321", () => {
  const anchor = SHIPMENT_EVIDENCE.find((e) => e.reportedChargeableKg)!;

  it("computes a chargeable weight close to the one the carrier actually billed", () => {
    const size = parseArtworkSize(`${anchor.widthCm}x${anchor.heightCm}cm`)!;
    const parcel = packArtwork(size);
    // The carrier said 11kg. Anything within a kilo means the crate model is right; the 12cm
    // depth this replaced computed 15.3kg.
    expect(parcel.chargeableWeightKg).toBeGreaterThan(9.5);
    expect(parcel.chargeableWeightKg).toBeLessThan(12);
  });

  it("quotes at or a little above what she actually paid — never below", () => {
    const paid = evidenceEur(anchor);              // ≈ €321
    const q = estimateShipping(work(anchor.widthCm, anchor.heightCm), anchor.destinationCountry);
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    const eur = q.amountMinor / 100;
    expect(eur).toBeGreaterThanOrEqual(paid * 0.95);  // must not undercut what it costs her
    expect(eur).toBeLessThanOrEqual(paid * 1.25);     // and must not be a deterrent
  });
});

describe("the corroborating Spain quotes", () => {
  it("lands in a believable band for an 80×90 to the EU", () => {
    const spain = SHIPMENT_EVIDENCE.filter((e) => e.destinationCountry === "ES");
    const highest = Math.max(...spain.map(evidenceEur));   // ≈ €310
    const q = estimateShipping(work(80, 90), "ES");
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    const eur = q.amountMinor / 100;
    // A larger parcel than the anchor, so above the anchor is expected. The ceiling is the
    // conversion guard: 1.6× the highest real quote is as far as an estimate may stray.
    expect(eur).toBeGreaterThanOrEqual(highest * 0.9);
    expect(eur).toBeLessThanOrEqual(highest * 1.6);
  });
});

describe("the regression that produced €613", () => {
  it("no longer quotes anything like €613 for a 79×71 to Germany", () => {
    const q = estimateShipping(work(79, 71), "DE");
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    const eur = q.amountMinor / 100;
    expect(eur).toBeLessThan(450);
    // And still comfortably above what a parcel that size really costs her.
    expect(eur).toBeGreaterThan(250);
  });

  it("keeps a small work from inheriting a large work's base", () => {
    const q = estimateShipping(work(30, 20), "DE");
    expect(q.ok).toBe(true);
    if (q.ok) expect(q.amountMinor / 100).toBeLessThan(250);
  });
});
