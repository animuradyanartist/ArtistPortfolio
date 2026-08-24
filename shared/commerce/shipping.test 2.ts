/**
 * THE SHIPPING MATRIX — PART 29, plus the refusals that matter more than the numbers.
 *
 * The numbers themselves are an internal conservative estimate and will change when a real
 * carrier rate arrives. What must NOT change is the SHAPE: bigger parcel never cheaper in the
 * same zone, missing data never cheap, overrides always win, and an unquotable destination
 * refuses rather than inventing a figure.
 */
import { describe, it, expect } from "vitest";
import { estimateShipping, estimateShippingForCart, type ShippableArtwork } from "./shipping";
import { parseArtworkSize } from "./dimensions";
import { packArtwork } from "./packing";
import { zoneFor } from "./zones";

const art = (over: Partial<ShippableArtwork> = {}): ShippableArtwork => ({
  id: 1, title: "Work", dimensions: "60x50cm", shippingEnabled: true, ...over,
});

const SMALL = "43x30cm";
const MEDIUM = "79x71cm";
const LARGE = "119x109cm";
const OVERSIZED = "190x180cm";

describe("the matrix the brief asks for", () => {
  const cases: Array<[string, string, string]> = [
    ["small  → EU (France)",   SMALL,  "FR"],
    ["medium → Germany",       MEDIUM, "DE"],
    ["large-but-quotable → Germany", "100x80cm", "DE"],
    ["medium → USA",           MEDIUM, "US"],
    ["medium → UAE",           MEDIUM, "AE"],
  ];
  for (const [name, dims, country] of cases) {
    it(`quotes ${name}`, () => {
      const q = estimateShipping(art({ dimensions: dims }), country);
      expect(q.ok).toBe(true);
      if (!q.ok) return;
      expect(q.amountMinor).toBeGreaterThan(0);
      expect(q.estimated).toBe(true);
      expect(q.zone).toBe(zoneFor(country));
      // Every estimate carries its own provenance, so nothing can present it as a carrier rate.
      expect(q.basis).toMatch(/internal-conservative-estimate/);
    });
  }

  /**
   * Her three biggest canvases — 119x89, 119x99, 119x109 — crate past the length-plus-girth
   * a standard express parcel accepts (391cm against a 330cm limit), so the estimator refuses
   * them. Measured against the live catalogue on 2026-08-20: 3 of 53 works, all at the top of
   * her range. That is the correct answer rather than a shortfall — those go by freight, and
   * the manual override below is the path for them.
   */
  it("refuses her largest canvases rather than under-quoting freight", () => {
    const q = estimateShipping(art({ dimensions: LARGE }), "DE");
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.reason).toBe("parcel-too-large");
  });

  it("but a manual override ships one of those largest works", () => {
    const q = estimateShipping(art({ dimensions: LARGE, shippingOverrideMinor: 45000 }), "DE");
    expect(q.ok).toBe(true);
    if (q.ok) { expect(q.amountMinor).toBe(45000); expect(q.estimated).toBe(false); }
  });

  it("refuses an oversized work rather than quoting it", () => {
    const q = estimateShipping(art({ dimensions: OVERSIZED }), "DE");
    expect(q.ok).toBe(false);
    if (q.ok) return;
    expect(["parcel-too-large", "over-weight-limit"]).toContain(q.reason);
  });

  it("refuses an unsupported destination", () => {
    const q = estimateShipping(art(), "MN");
    expect(q.ok).toBe(false);
    if (q.ok) return;
    expect(q.reason).toBe("unsupported-destination");
  });
});

describe("monotonicity — a bigger parcel is never cheaper in the same zone", () => {
  it("holds across the whole catalogue's range of sizes", () => {
    const sizes = ["30x20cm","43x30cm","50x40cm","61x71cm","79x71cm","99x79cm","100x80cm"];
    let previous = 0;
    let previousKg = 0;
    for (const dims of sizes) {
      const q = estimateShipping(art({ dimensions: dims }), "DE");
      expect(q.ok).toBe(true);
      if (!q.ok) return;
      const kg = q.breakdown!.chargeableWeightKg;
      expect(kg).toBeGreaterThanOrEqual(previousKg);
      expect(q.amountMinor).toBeGreaterThanOrEqual(previous);
      previous = q.amountMinor; previousKg = kg;
    }
  });

  it("holds for every zone, not just the one we looked at", () => {
    for (const country of ["FR","GB","CH","US","AE","AU","GE","AM"]) {
      let previous = 0;
      for (const dims of ["30x20cm","60x50cm","90x70cm"]) {
        const q = estimateShipping(art({ dimensions: dims }), country);
        if (!q.ok) continue;
        expect(q.amountMinor).toBeGreaterThanOrEqual(previous);
        previous = q.amountMinor;
      }
    }
  });
});

describe("it fails conservatively, never cheaply", () => {
  it("refuses when the dimensions cannot be read", () => {
    for (const bad of [null, "", "large", "unknown", "42"]) {
      const q = estimateShipping(art({ dimensions: bad as string }), "DE");
      expect(q.ok).toBe(false);
      if (!q.ok) expect(q.reason).toBe("unknown-dimensions");
    }
  });

  it("refuses when shipping is switched off for the work", () => {
    const q = estimateShipping(art({ shippingEnabled: false }), "DE");
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.reason).toBe("shipping-disabled");
  });

  it("never returns zero or a negative amount", () => {
    for (const country of ["DE","US","AE","GB","AM"]) {
      const q = estimateShipping(art({ dimensions: MEDIUM }), country);
      if (q.ok) expect(q.amountMinor).toBeGreaterThan(0);
    }
  });

  it("charges at least the zone minimum for a tiny work", () => {
    const q = estimateShipping(art({ dimensions: "20x15cm" }), "US");
    expect(q.ok).toBe(true);
    if (q.ok) expect(q.amountMinor).toBeGreaterThanOrEqual(24000);
  });
});

describe("override precedence", () => {
  it("a flat override beats the estimate and is not labelled estimated", () => {
    const q = estimateShipping(art({ shippingOverrideMinor: 12345 }), "DE");
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.amountMinor).toBe(12345);
    expect(q.estimated).toBe(false);
    expect(q.basis).toBe("manual-override");
  });

  it("a destination override beats a flat override", () => {
    const q = estimateShipping(art({
      shippingOverrideMinor: 12345,
      shippingDestinationOverrides: { DE: 9999 },
    }), "DE");
    expect(q.ok).toBe(true);
    if (q.ok) { expect(q.amountMinor).toBe(9999); expect(q.basis).toBe("manual-destination-override"); }
  });

  it("a destination override for somewhere else does not leak", () => {
    const q = estimateShipping(art({ shippingDestinationOverrides: { DE: 9999 } }), "FR");
    expect(q.ok).toBe(true);
    if (q.ok) expect(q.amountMinor).not.toBe(9999);
  });

  it("an override still cannot ship a work whose shipping is disabled", () => {
    const q = estimateShipping(art({ shippingEnabled: false, shippingOverrideMinor: 100 }), "DE");
    expect(q.ok).toBe(false);
  });
});

describe("packing overrides reach the parcel", () => {
  it("a deeper crate costs more", () => {
    const shallow = estimateShipping(art({ dimensions: MEDIUM, packedDepthCm: 8 }), "DE");
    const deep = estimateShipping(art({ dimensions: MEDIUM, packedDepthCm: 20 }), "DE");
    expect(shallow.ok && deep.ok).toBe(true);
    if (shallow.ok && deep.ok) expect(deep.amountMinor).toBeGreaterThan(shallow.amountMinor);
  });

  it("a wider margin costs more", () => {
    const tight = estimateShipping(art({ dimensions: MEDIUM, packingMarginCm: 4 }), "DE");
    const generous = estimateShipping(art({ dimensions: MEDIUM, packingMarginCm: 24 }), "DE");
    if (tight.ok && generous.ok) expect(generous.amountMinor).toBeGreaterThan(tight.amountMinor);
  });
});

describe("a cart of several originals", () => {
  it("sums per-artwork quotes rather than guessing combined packing", () => {
    const a = art({ id: 1, dimensions: MEDIUM });
    const b = art({ id: 2, dimensions: SMALL });
    const one = estimateShipping(a, "DE");
    const two = estimateShipping(b, "DE");
    const cart = estimateShippingForCart([a, b], "DE");
    expect(cart.ok).toBe(true);
    if (!cart.ok || !one.ok || !two.ok) return;
    expect(cart.amountMinor).toBe(one.amountMinor + two.amountMinor);
  });

  it("one unshippable work refuses the whole cart", () => {
    const cart = estimateShippingForCart(
      [art({ id: 1, dimensions: MEDIUM }), art({ id: 2, dimensions: OVERSIZED })], "DE");
    expect(cart.ok).toBe(false);
  });
});

describe("dimension parsing", () => {
  it("reads her catalogue's real formats", () => {
    expect(parseArtworkSize("79x71cm")).toEqual({ widthCm: 79, heightCm: 71, sourceUnit: "cm" });
    expect(parseArtworkSize("119x109cm")).toEqual({ widthCm: 119, heightCm: 109, sourceUnit: "cm" });
    expect(parseArtworkSize('40" × 30"')?.sourceUnit).toBe("in");
    expect(parseArtworkSize("60 x 50 cm")?.widthCm).toBe(60);
  });

  it("treats a small unitless pair as inches, not as a postcard", () => {
    const s = parseArtworkSize("20x16");
    expect(s?.sourceUnit).toBe("in");
    expect(s?.widthCm).toBeCloseTo(50.8, 1);
  });

  it("returns null rather than guessing", () => {
    for (const bad of ["", "big", "n/a", "0x0", "500x500cm"]) expect(parseArtworkSize(bad)).toBeNull();
  });
});

describe("packing arithmetic is the documented formula", () => {
  it("adds the margin to both sides and rounds weight up to the step", () => {
    const p = packArtwork({ widthCm: 80, heightCm: 60 }, { packedDepthCm: 12, packingMarginCm: 10 });
    expect(p.packedWidthCm).toBe(90);
    expect(p.packedHeightCm).toBe(70);
    expect(p.packedDepthCm).toBe(12);
    expect(p.rawVolumetricKg).toBeCloseTo((90 * 70 * 12) / 5000, 3);
    expect(p.chargeableWeightKg).toBe(Math.ceil(p.rawVolumetricKg / 0.5) * 0.5);
  });
});
