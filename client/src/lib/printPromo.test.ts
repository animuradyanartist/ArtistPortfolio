import { describe, it, expect } from "vitest";
import { activePrintPromo, promoDiscountMinor, promoPriceMinor } from "./printPromo";
// The SERVER's discount maths — the PDP display must match this to the minor unit.
import { computeDiscountMinor } from "@shared/commerce/promo";

describe("printPromo — display math mirrors the server", () => {
  it("computes SAVE30 (30%) exactly as verified against the live quote endpoint", () => {
    // $69.00 → $20.70 off → $48.30 (matches /api/commerce/prints/quote for variant 84)
    expect(promoDiscountMinor(6900, 30)).toBe(2070);
    expect(promoPriceMinor(6900, 30)).toBe(4830);
    // $129.00 canvas → $38.70 off → $90.30 (matches variant 88)
    expect(promoDiscountMinor(12900, 30)).toBe(3870);
    expect(promoPriceMinor(12900, 30)).toBe(9030);
    // The other real variants on this print.
    expect(promoPriceMinor(9900, 30)).toBe(6930);   // $99 → $69.30
    expect(promoPriceMinor(11900, 30)).toBe(8330);  // $119 → $83.30
    expect(promoPriceMinor(15900, 30)).toBe(11130); // $159 → $111.30
    expect(promoPriceMinor(22900, 30)).toBe(16030); // $229 → $160.30
  });

  it("uses the same rounding as the server for every price", () => {
    for (const p of [6900, 9900, 11900, 12900, 15900, 22900, 4999, 12345]) {
      expect(promoDiscountMinor(p, 30)).toBe(computeDiscountMinor("percentage", 30, p));
    }
  });

  it("guards degenerate inputs like the server does", () => {
    expect(promoDiscountMinor(0, 30)).toBe(0);
    expect(promoDiscountMinor(-100, 30)).toBe(0);
    expect(promoPriceMinor(6900, 100)).toBe(0); // never below zero
  });

  it("shows the promo through Sep 30 and hides it afterwards", () => {
    expect(activePrintPromo(new Date("2026-09-16T12:00:00Z"))).not.toBeNull();
    expect(activePrintPromo(new Date("2026-09-30T23:59:59Z"))).not.toBeNull();
    expect(activePrintPromo(new Date("2026-10-01T00:00:01Z"))).toBeNull();
    expect(activePrintPromo(new Date("2026-11-01T00:00:00Z"))).toBeNull();
  });

  it("carries the code and end label the PDP renders", () => {
    const promo = activePrintPromo(new Date("2026-09-16T12:00:00Z"));
    expect(promo?.code).toBe("SAVE30");
    expect(promo?.percentOff).toBe(30);
    expect(promo?.endsLabel).toBe("September 30");
  });
});
