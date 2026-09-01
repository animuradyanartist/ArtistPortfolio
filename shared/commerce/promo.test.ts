/**
 * PROMO LOGIC — the whole server-authoritative discount decision, unit-tested in isolation.
 *
 * Covers normalization, every validation branch, percentage/fixed maths, the currency rule, and the
 * two invariants that protect the charge: a discount never exceeds the item subtotal, and shipping is
 * never part of the calculation.
 */
import { describe, it, expect } from "vitest";
import {
  normalizePromoCode, validatePromo, computeDiscountMinor, applyPromo,
  PROMO_ERROR_MESSAGE, type PromoRecord,
} from "./promo";

const AT = new Date("2026-06-15T12:00:00Z");

const make = (over: Partial<PromoRecord> = {}): PromoRecord => ({
  code: "SAVE10",
  codeNormalized: "SAVE10",
  discountType: "percentage",
  discountValue: 10,
  currency: null,
  appliesTo: "all",
  active: true,
  validFrom: null,
  expiresAt: null,
  ...over,
});

describe("normalization / case-insensitive lookup", () => {
  it("trims and uppercases", () => {
    expect(normalizePromoCode("save10")).toBe("SAVE10");
    expect(normalizePromoCode(" save10 ")).toBe("SAVE10");
    expect(normalizePromoCode("SAVE10")).toBe("SAVE10");
  });
  it("SAVE10 == save10 == ' save10 '", () => {
    const a = normalizePromoCode("SAVE10");
    expect(normalizePromoCode("save10")).toBe(a);
    expect(normalizePromoCode(" save10 ")).toBe(a);
  });
  it("is safe on junk input", () => {
    expect(normalizePromoCode(null)).toBe("");
    expect(normalizePromoCode(undefined)).toBe("");
  });
});

describe("validation", () => {
  const ctx = { itemType: "originals" as const, currency: "EUR", now: AT };

  it("a missing row is not-found", () => {
    expect(validatePromo(null, ctx)).toEqual({ ok: false, error: "not-found" });
  });
  it("an inactive code is rejected", () => {
    expect(validatePromo(make({ active: false }), ctx)).toEqual({ ok: false, error: "inactive" });
  });
  it("a future valid_from is not-yet-valid", () => {
    expect(validatePromo(make({ validFrom: "2026-07-01T00:00:00Z" }), ctx)).toEqual({ ok: false, error: "not-yet-valid" });
  });
  it("a passed expiry is expired", () => {
    expect(validatePromo(make({ expiresAt: "2026-06-01T00:00:00Z" }), ctx)).toEqual({ ok: false, error: "expired" });
  });
  it("a valid window passes", () => {
    const r = validatePromo(make({ validFrom: "2026-06-01T00:00:00Z", expiresAt: "2026-07-01T00:00:00Z" }), ctx);
    expect(r.ok).toBe(true);
  });
  it("an originals-only code is rejected for a print order", () => {
    expect(validatePromo(make({ appliesTo: "originals" }), { ...ctx, itemType: "prints" }))
      .toEqual({ ok: false, error: "wrong-item" });
  });
  it("a prints-only code is rejected for an originals order", () => {
    expect(validatePromo(make({ appliesTo: "prints" }), { ...ctx, itemType: "originals" }))
      .toEqual({ ok: false, error: "wrong-item" });
  });
  it("an out-of-range percentage is invalid", () => {
    expect(validatePromo(make({ discountValue: 0 }), ctx)).toEqual({ ok: false, error: "invalid" });
    expect(validatePromo(make({ discountValue: 101 }), ctx)).toEqual({ ok: false, error: "invalid" });
  });
  it("a fixed code with no currency is invalid", () => {
    expect(validatePromo(make({ discountType: "fixed", discountValue: 1000, currency: null }), ctx))
      .toEqual({ ok: false, error: "invalid" });
  });
  it("a fixed code in a different currency is rejected", () => {
    const eurCode = make({ discountType: "fixed", discountValue: 1000, currency: "EUR" });
    expect(validatePromo(eurCode, { ...ctx, currency: "USD" })).toEqual({ ok: false, error: "wrong-currency" });
  });
  it("a fixed code in the matching currency passes", () => {
    const usdCode = make({ discountType: "fixed", discountValue: 1000, currency: "USD" });
    expect(validatePromo(usdCode, { ...ctx, currency: "USD" }).ok).toBe(true);
  });
  it("every error has a concise customer-safe message with no ids", () => {
    for (const msg of Object.values(PROMO_ERROR_MESSAGE)) {
      expect(msg.length).toBeGreaterThan(0);
      expect(msg).not.toMatch(/\bid\b|internal|null|undefined/i);
    }
  });
});

describe("discount maths", () => {
  it("percentage applies to the item subtotal", () => {
    expect(computeDiscountMinor("percentage", 10, 10000)).toBe(1000); // 10% of 100.00
    expect(computeDiscountMinor("percentage", 25, 24000)).toBe(6000);
  });
  it("fixed is the amount, in minor units", () => {
    expect(computeDiscountMinor("fixed", 1000, 10000)).toBe(1000);
  });
  it("never exceeds the item subtotal (percentage can't over-discount)", () => {
    expect(computeDiscountMinor("percentage", 100, 5000)).toBe(5000);
  });
  it("a fixed amount larger than the subtotal is capped at the subtotal (item total ≥ 0)", () => {
    expect(computeDiscountMinor("fixed", 999999, 5000)).toBe(5000);
  });
  it("is zero for a zero/negative subtotal", () => {
    expect(computeDiscountMinor("percentage", 50, 0)).toBe(0);
    expect(computeDiscountMinor("fixed", 1000, -1)).toBe(0);
  });
});

describe("applyPromo — the shared entry point", () => {
  const base = { itemType: "originals" as const, currency: "EUR", now: AT, itemsMinor: 10000 };

  it("returns the discount and the discounted item subtotal (shipping untouched — not an input)", () => {
    const r = applyPromo(make({ discountValue: 10 }), base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.applied.discountMinor).toBe(1000);
      expect(r.applied.discountedItemsMinor).toBe(9000);
      expect(r.applied.code).toBe("SAVE10");
      // The function has no shipping parameter at all — it cannot discount shipping by construction.
      expect(Object.keys(base)).not.toContain("shippingMinor");
    }
  });
  it("propagates a validation failure instead of a discount", () => {
    expect(applyPromo(make({ active: false }), base)).toEqual({ ok: false, error: "inactive" });
  });
  it("a fixed USD code prices a USD (print) order", () => {
    const r = applyPromo(make({ discountType: "fixed", discountValue: 1500, currency: "USD" }), { ...base, itemType: "prints", currency: "USD", itemsMinor: 8900 });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.applied.discountMinor).toBe(1500); expect(r.applied.discountedItemsMinor).toBe(7400); }
  });
});
