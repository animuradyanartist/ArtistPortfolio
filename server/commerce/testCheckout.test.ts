/**
 * THE $1 TEST HARNESS IS OFF UNLESS BOTH SECRETS ARE SET, TOKEN-GATED, AND PRICED AT ONE DOLLAR.
 *
 * It creates real Stripe sessions and real orders, so what matters most: it is inert unless the
 * owner sets ENABLE_TEST_CHECKOUT=1 AND a TEST_CHECKOUT_TOKEN secret, the token is compared in
 * constant time and read only from the environment (never committed), and the item is exactly
 * $1.00 with no shipping — never touching the artwork/shipping/reservation code.
 */
import { describe, it, expect, afterEach } from "vitest";
import { TEST_ITEM, testCheckoutEnabled, verifyToken } from "./testCheckout";

const flag = process.env.ENABLE_TEST_CHECKOUT;
const tok = process.env.TEST_CHECKOUT_TOKEN;
afterEach(() => {
  if (flag === undefined) delete process.env.ENABLE_TEST_CHECKOUT; else process.env.ENABLE_TEST_CHECKOUT = flag;
  if (tok === undefined) delete process.env.TEST_CHECKOUT_TOKEN; else process.env.TEST_CHECKOUT_TOKEN = tok;
});

describe("armed only when BOTH secrets are set", () => {
  it("is disabled with neither secret", () => {
    delete process.env.ENABLE_TEST_CHECKOUT;
    delete process.env.TEST_CHECKOUT_TOKEN;
    expect(testCheckoutEnabled()).toBe(false);
  });
  it("is disabled with the flag but NO token secret (fails closed)", () => {
    process.env.ENABLE_TEST_CHECKOUT = "1";
    delete process.env.TEST_CHECKOUT_TOKEN;
    expect(testCheckoutEnabled()).toBe(false);
  });
  it("is disabled with a token but the flag not exactly '1'", () => {
    process.env.TEST_CHECKOUT_TOKEN = "s3cr3t-value-not-in-repo";
    for (const v of ["", "0", "true", "2"]) {
      process.env.ENABLE_TEST_CHECKOUT = v;
      expect(testCheckoutEnabled()).toBe(false);
    }
  });
  it("is armed only when flag='1' AND a token secret exists", () => {
    process.env.ENABLE_TEST_CHECKOUT = "1";
    process.env.TEST_CHECKOUT_TOKEN = "s3cr3t-value-not-in-repo";
    expect(testCheckoutEnabled()).toBe(true);
  });
});

describe("the token check reads only the environment and fails closed", () => {
  it("rejects everything when no token secret is set", () => {
    delete process.env.TEST_CHECKOUT_TOKEN;
    expect(verifyToken("anything")).toBe(false);
    expect(verifyToken("")).toBe(false);
    expect(verifyToken(undefined)).toBe(false);
  });
  it("accepts only the exact secret", () => {
    process.env.TEST_CHECKOUT_TOKEN = "the-real-secret-2f9a";
    expect(verifyToken("the-real-secret-2f9a")).toBe(true);
    expect(verifyToken("the-real-secret-2f9b")).toBe(false);
    expect(verifyToken("the-real-secret")).toBe(false); // length mismatch, no throw
    expect(verifyToken(123 as unknown)).toBe(false);
  });
});

describe("the test item is one dollar, no shipping", () => {
  it("is $1.00 USD and unmistakably a test", () => {
    expect(TEST_ITEM.amountMinor).toBe(100);
    expect(TEST_ITEM.currency).toBe("usd");
    expect(TEST_ITEM.name).toMatch(/TEST PURCHASE/i);
    expect(TEST_ITEM.name).toMatch(/DO NOT BUY/i);
  });
});
