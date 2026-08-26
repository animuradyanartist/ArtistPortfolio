/**
 * The eligibility engine decides money and quality, so it is tested at the edges that matter:
 * a web-resolution master must fail every size; a true master must pass the small/medium sizes;
 * and the physical size must always keep the master's aspect ratio (never crop/stretch).
 */
import { describe, it, expect } from "vitest";
import {
  evaluateMaster,
  evaluateVariant,
  physicalSize,
  effectiveDpi,
  orientationOf,
  maxLongEdgeCm,
  isPrintable,
  DEFAULT_SIZE_LADDER,
  DEFAULT_DPI_POLICY,
  type MasterImage,
} from "./printEligibility";

const web: MasterImage = { widthPx: 1280, heightPx: 1500 }; // the current site masters
const good: MasterImage = { widthPx: 6000, heightPx: 7500 }; // a real portrait master
const wide: MasterImage = { widthPx: 8000, heightPx: 5000 }; // a landscape master

describe("printEligibility", () => {
  it("refuses every ladder size for a web-resolution master", () => {
    const results = evaluateMaster(web);
    expect(results.every((r) => !r.eligible)).toBe(true);
    // and each failure explains itself
    expect(results[0].reason).toMatch(/DPI floor/);
    expect(isPrintable(web)).toBe(false);
  });

  it("passes S and M for a genuine 6000×7500 master, gates L by policy", () => {
    const [s, m, l] = evaluateMaster(good);
    expect(s.eligible).toBe(true);
    expect(s.meetsPreferred).toBe(true); // ~476 DPI at 40cm
    expect(m.eligible).toBe(true); // ~272 DPI at 70cm
    expect(l.effectiveDpi).toBeGreaterThan(150);
    // at the default 180 floor L (100cm -> ~190 DPI) is eligible but not preferred
    expect(l.eligible).toBe(true);
    expect(l.meetsPreferred).toBe(false);
  });

  it("preserves aspect ratio exactly — never crops or stretches", () => {
    const p = physicalSize(good, 70); // portrait, long edge = height = 70cm
    expect(p.heightCm).toBe(70);
    // width/height ratio of the print must equal the master's ratio
    expect(p.widthCm / p.heightCm).toBeCloseTo(6000 / 7500, 3);

    const w = physicalSize(wide, 70); // landscape, long edge = width = 70cm
    expect(w.widthCm).toBe(70);
    // height snaps to 0.1cm (43.75 -> 43.8), so the ratio matches within that rounding
    expect(w.widthCm / w.heightCm).toBeCloseTo(8000 / 5000, 1);
    expect(w.heightCm).toBe(43.8);
  });

  it("computes effective DPI from the long edge", () => {
    // 6000×7500 long edge 7500px at 70cm: 7500 / (70/2.54) = ~272
    expect(effectiveDpi(good, 70)).toBe(272);
    expect(orientationOf(good)).toBe("portrait");
    expect(orientationOf(wide)).toBe("landscape");
  });

  it("reports the largest long edge a master can reach at a DPI (no upscaling)", () => {
    // 7500px at 300 DPI => 7500/300*2.54 = 63.5cm
    expect(maxLongEdgeCm(good, 300)).toBeCloseTo(63.5, 1);
  });

  it("honours a configurable, stricter floor", () => {
    const strict = { preferredDpi: 300, minimumDpi: 250 };
    const l = evaluateVariant(good, { label: "L", longEdgeCm: 100 }, strict);
    expect(l.eligible).toBe(false); // ~190 DPI < 250
    const m = evaluateVariant(good, { label: "M", longEdgeCm: 70 }, strict);
    expect(m.eligible).toBe(true); // 272 >= 250
  });

  it("uses the documented default policy", () => {
    expect(DEFAULT_DPI_POLICY).toEqual({ preferredDpi: 300, minimumDpi: 180 });
    expect(DEFAULT_SIZE_LADDER.map((s) => s.longEdgeCm)).toEqual([40, 70, 100]);
  });
});
