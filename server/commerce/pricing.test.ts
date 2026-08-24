/**
 * THE SERVER DECIDES THE MONEY.
 *
 * These exercise the exact function the checkout route calls, because that is where a client
 * would have to be believed for anything to go wrong. Nothing below passes a price in.
 */
import { describe, it, expect } from "vitest";
import { priceOrder, parseDestinationOverrides, toShippable, currencyOf } from "./pricing";
import type { Artwork } from "@shared/schema";

const artwork = (over: Partial<Artwork> = {}): Artwork => ({
  id: 1, title: "Blue Drift", slug: null, seoSlug: null, description: "", medium: "Oil on Canvas",
  dimensions: "79x71cm", year: 2026, price: 2420, images: ["/img/artwork/1/0"], type: "oil",
  category: null, size: "medium", availability: "available", saatchiUrl: null, buyLink: null,
  featured: false, position: 0, availableForPrint: false, printSizes: null,
  preferredPrintMaterial: null, singulartId: null, source: "manual", detailImagesChecked: false,
  sourceDescription: null, sourceDescriptionProvider: null, derivedCategories: null,
  directSaleEnabled: true, websitePriceMinor: 240000, websiteCurrency: "EUR",
  shippingEnabled: true, shippingOverrideMinor: null, shippingDestinationOverrides: null,
  packedDepthCm: null, packingMarginCm: null, fulfilmentNotes: null,
  reservedUntil: null, reservedByOrderId: null,
  ...over,
} as Artwork);

describe("priceOrder", () => {
  it("prices a purchasable work from the row, not from anything a client sent", async () => {
    const r = await priceOrder([artwork()], "DE");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itemsMinor).toBe(240000);
    expect(r.shippingMinor).toBeGreaterThan(0);
    expect(r.totalMinor).toBe(r.itemsMinor + r.shippingMinor);
    expect(r.currency).toBe("EUR");
    expect(r.shippingEstimated).toBe(true);
  });

  it("ships the production-test item FREE — exactly $1.00 total in USD (test harness)", async () => {
    const r = await priceOrder([artwork({ source: "production-test", websitePriceMinor: 100, websiteCurrency: "USD" })], "US");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itemsMinor).toBe(100);
    expect(r.shippingMinor).toBe(0);
    expect(r.totalMinor).toBe(100);
    expect(r.currency).toBe("USD");
    expect(r.shippingEstimated).toBe(false);
  });

  it("leaves a normal work's shipping positive — the test branch is inert for real sales", async () => {
    const r = await priceOrder([artwork()], "DE");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.shippingMinor).toBeGreaterThan(0);
  });

  it("REFUSES a sold work — the case that must never reach Stripe", async () => {
    const r = await priceOrder([artwork({ availability: "sold" })], "DE");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("not-purchasable");
  });

  it("refuses a work held by somebody else's live checkout", async () => {
    const future = new Date(Date.now() + 10 * 60_000);
    const r = await priceOrder([artwork({ reservedUntil: future })], "DE");
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.kind === "not-purchasable") expect(r.error.reasons).toContain("reserved");
  });

  it("allows a work whose hold has lapsed", async () => {
    const past = new Date(Date.now() - 60_000);
    const r = await priceOrder([artwork({ reservedUntil: past })], "DE");
    expect(r.ok).toBe(true);
  });

  it("refuses a work with direct sale switched off, however it is priced", async () => {
    const r = await priceOrder([artwork({ directSaleEnabled: false })], "DE");
    expect(r.ok).toBe(false);
  });

  it("NEVER falls back to the marketplace price when the website price is missing", async () => {
    // `price` is 2420 here. If anything read it as a fallback this would succeed.
    const r = await priceOrder([artwork({ websitePriceMinor: null })], "DE");
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.kind === "not-purchasable") expect(r.error.reasons).toContain("no-website-price");
  });

  it("refuses rather than quoting when shipping cannot be worked out", async () => {
    const r = await priceOrder([artwork({ dimensions: "unknown" })], "DE");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("shipping-unavailable");
  });

  it("refuses an unsupported destination", async () => {
    const r = await priceOrder([artwork()], "MN");
    expect(r.ok).toBe(false);
  });

  it("refuses to mix currencies in one order", async () => {
    const r = await priceOrder([artwork({ id: 1 }), artwork({ id: 2, websiteCurrency: "USD" })], "DE");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("mixed-currency");
  });

  it("sums several works and their per-parcel shipping", async () => {
    const one = await priceOrder([artwork({ id: 1 })], "DE");
    const two = await priceOrder([artwork({ id: 1 }), artwork({ id: 2, dimensions: "43x30cm" })], "DE");
    expect(one.ok && two.ok).toBe(true);
    if (!one.ok || !two.ok) return;
    expect(two.itemsMinor).toBe(480000);
    expect(two.shippingMinor).toBeGreaterThan(one.shippingMinor);
  });

  it("uses a manual override and stops calling the figure estimated", async () => {
    const r = await priceOrder([artwork({ shippingOverrideMinor: 15000 })], "DE");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.shippingMinor).toBe(15000);
    expect(r.shippingEstimated).toBe(false);
  });

  it("rejects an empty order", async () => {
    const r = await priceOrder([], "DE");
    expect(r.ok).toBe(false);
  });
});

describe("per-destination overrides are parsed defensively", () => {
  it("reads a well-formed map", () => {
    expect(parseDestinationOverrides('{"DE":19000,"us":26000}')).toEqual({ DE: 19000, US: 26000 });
  });
  it("discards anything that would ship a painting for nothing", () => {
    expect(parseDestinationOverrides('{"DE":0}')).toBeNull();
    expect(parseDestinationOverrides('{"DE":-5}')).toBeNull();
    expect(parseDestinationOverrides('{"DE":"free"}')).toBeNull();
  });
  it("survives malformed input rather than throwing into a checkout", () => {
    for (const bad of [null, "", "{", "[]", '{"NOTACOUNTRY":100}', "12"]) {
      expect(parseDestinationOverrides(bad as string)).toBeNull();
    }
  });
});

describe("row → shippable", () => {
  it("carries the overrides the estimator needs", () => {
    const s = toShippable(artwork({ packedDepthCm: 20, packingMarginCm: 6,
      shippingDestinationOverrides: '{"DE":19000}' }));
    expect(s.packedDepthCm).toBe(20);
    expect(s.packingMarginCm).toBe(6);
    expect(s.shippingDestinationOverrides).toEqual({ DE: 19000 });
  });
  it("treats a null shippingEnabled as enabled, matching the column default", () => {
    expect(toShippable(artwork({ shippingEnabled: null as unknown as boolean })).shippingEnabled).toBe(true);
  });
  it("falls back to EUR for an unrecognised currency rather than throwing", () => {
    expect(currencyOf(artwork({ websiteCurrency: "XYZ" }))).toBe("EUR");
  });
});
