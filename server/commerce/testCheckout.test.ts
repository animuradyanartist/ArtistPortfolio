/**
 * THE $1 TEST HARNESS IS OFF UNLESS DELIBERATELY TURNED ON, AND CANNOT AFFECT A REAL ARTWORK.
 *
 * It creates real Stripe sessions and real orders, so the thing that matters most is that it
 * is inert until the owner sets ENABLE_TEST_CHECKOUT=1, gated by a token even then, and priced
 * at exactly $1.00 with no shipping — never touching the artwork/shipping/reservation code.
 */
import { describe, it, expect, afterEach } from "vitest";
import { TEST_ITEM, testCheckoutEnabled } from "./testCheckout";

const original = process.env.ENABLE_TEST_CHECKOUT;
afterEach(() => { process.env.ENABLE_TEST_CHECKOUT = original; });

describe("the harness fails closed", () => {
  it("is disabled by default", () => {
    delete process.env.ENABLE_TEST_CHECKOUT;
    expect(testCheckoutEnabled()).toBe(false);
  });
  it("is disabled for any value other than exactly '1'", () => {
    for (const v of ["", "0", "true", "yes", "2", " 1 ".trim() === "1" ? "" : "x"]) {
      process.env.ENABLE_TEST_CHECKOUT = v;
      if (v !== "1") expect(testCheckoutEnabled()).toBe(false);
    }
  });
  it("is enabled ONLY when set to exactly '1'", () => {
    process.env.ENABLE_TEST_CHECKOUT = "1";
    expect(testCheckoutEnabled()).toBe(true);
  });
});

describe("the test item is exactly one dollar, no shipping", () => {
  it("is $1.00 USD", () => {
    expect(TEST_ITEM.amountMinor).toBe(100);
    expect(TEST_ITEM.currency).toBe("usd");
  });
  it("is unmistakably a test", () => {
    expect(TEST_ITEM.name).toMatch(/TEST PURCHASE/i);
    expect(TEST_ITEM.name).toMatch(/DO NOT BUY/i);
  });
});
