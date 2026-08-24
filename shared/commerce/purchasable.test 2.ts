/**
 * THE ONE RULE, PINNED.
 *
 * Every "no" below is a painting that must not take a card payment. The positive test on
 * availability matters most: a value nobody anticipated must fail closed.
 */
import { describe, it, expect } from "vitest";
import { purchasability, isPurchasableArtwork, isReservationActive, type PurchasableArtwork } from "./purchasable";
import { canTransition, nextStatuses, ADMIN_SETTABLE, isTerminal } from "./orderStatus";

const ok = (over: Partial<PurchasableArtwork> = {}): PurchasableArtwork => ({
  id: 1, availability: "available", directSaleEnabled: true,
  websitePriceMinor: 240000, websiteCurrency: "EUR", shippingEnabled: true, ...over,
});

describe("a work is purchasable only when everything is true", () => {
  it("accepts a fully configured available work", () => {
    expect(isPurchasableArtwork(ok())).toBe(true);
  });

  const blocked: Array<[string, Partial<PurchasableArtwork>, string]> = [
    ["direct sale off",     { directSaleEnabled: false }, "direct-sale-disabled"],
    ["no price",            { websitePriceMinor: null },  "no-website-price"],
    ["zero price",          { websitePriceMinor: 0 },     "no-website-price"],
    ["negative price",      { websitePriceMinor: -1 },    "no-website-price"],
    ["no currency",         { websiteCurrency: null },    "no-currency"],
    ["sold",                { availability: "sold" },     "not-available"],
    ["shipping off",        { shippingEnabled: false },   "shipping-not-configured"],
  ];
  for (const [name, patch, reason] of blocked) {
    it(`refuses when ${name}`, () => {
      const r = purchasability(ok(patch));
      expect(r.purchasable).toBe(false);
      expect(r.reasons).toContain(reason);
    });
  }

  it("fails closed on an availability value nobody anticipated", () => {
    for (const v of ["reserved", "on loan", "promised", "not currently available",
                     "in a private collection", "Available", "", "AVAILABLE"]) {
      expect(isPurchasableArtwork(ok({ availability: v }))).toBe(false);
    }
  });

  it("reports every reason at once, so Admin can list what is missing", () => {
    const r = purchasability(ok({ directSaleEnabled: false, websitePriceMinor: null, shippingEnabled: false }));
    expect(r.reasons.sort()).toEqual(["direct-sale-disabled","no-website-price","shipping-not-configured"]);
  });
});

describe("reservations", () => {
  const now = new Date("2026-08-20T12:00:00Z");

  it("blocks a work held by a live checkout", () => {
    expect(isPurchasableArtwork(ok({ reservedUntil: "2026-08-20T12:30:00Z" }), now)).toBe(false);
  });

  it("releases a work whose hold has expired", () => {
    expect(isPurchasableArtwork(ok({ reservedUntil: "2026-08-20T11:30:00Z" }), now)).toBe(true);
  });

  it("treats an absent or unreadable expiry as no reservation, never as forever", () => {
    for (const v of [null, undefined, "", "not-a-date"]) {
      expect(isReservationActive(v as string, now)).toBe(false);
    }
  });
});

describe("the order state machine", () => {
  it("walks the ordinary path", () => {
    expect(canTransition("pending", "checkout_created")).toBe(true);
    expect(canTransition("checkout_created", "paid")).toBe(true);
    expect(canTransition("paid", "preparing")).toBe(true);
    expect(canTransition("preparing", "shipped")).toBe(true);
    expect(canTransition("shipped", "delivered")).toBe(true);
  });

  it("refuses to cancel money that already arrived — that is a refund", () => {
    expect(canTransition("paid", "cancelled")).toBe(false);
    expect(canTransition("paid", "refunded")).toBe(true);
  });

  it("refuses to skip payment", () => {
    expect(canTransition("pending", "paid")).toBe(false);
    expect(canTransition("pending", "shipped")).toBe(false);
    expect(canTransition("checkout_created", "delivered")).toBe(false);
  });

  it("refuses to reanimate a terminal order", () => {
    for (const t of ["cancelled", "refunded"] as const) {
      expect(isTerminal(t)).toBe(true);
      expect(nextStatuses(t)).toEqual([]);
      expect(canTransition(t, "paid")).toBe(false);
    }
  });

  it("is idempotent for a repeated status", () => {
    expect(canTransition("paid", "paid")).toBe(true);
  });

  it("never lets Admin declare an order paid or refunded by hand", () => {
    expect(ADMIN_SETTABLE).not.toContain("paid");
    expect(ADMIN_SETTABLE).not.toContain("refunded");
  });
});
