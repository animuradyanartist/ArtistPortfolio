/**
 * ONE PAINTING, ONE PRICE — to a crawler and to a person alike.
 *
 * The server injects an Offer before JavaScript runs; the artwork page emits its own after
 * hydration. They disagreed: with direct sale on, the server said "USD 2260" (the Singulart
 * figure) while the rendered page said "EUR 2400" (the website price). A first-wave crawler
 * and a visitor were shown two different prices for the same work.
 */
import { describe, it, expect } from "vitest";
import { artworkOffer, type SsrArtwork } from "./artworkSsr";

const BASE = "https://animuradyan.com";
const work = (over: Partial<SsrArtwork> = {}): SsrArtwork => ({
  id: 40, title: "Blue Drift", slug: null, seoSlug: null,
  price: 2260, availability: "available", dimensions: "79x71cm", ...over,
} as SsrArtwork);

describe("the server-rendered Offer", () => {
  it("states the WEBSITE price when direct sale is on", () => {
    const o = artworkOffer(work({ directSaleEnabled: true, websitePriceMinor: 240000, websiteCurrency: "EUR" }), BASE)!;
    expect(o.price).toBe(2400);
    expect(o.priceCurrency).toBe("EUR");
  });

  it("keeps the marketplace Offer untouched when direct sale is off", () => {
    const o = artworkOffer(work({ directSaleEnabled: false }), BASE)!;
    expect(o.price).toBe(2260);
    expect(o.priceCurrency).toBe("USD");
  });

  it("falls back to the marketplace Offer when direct sale is on but unpriced", () => {
    const o = artworkOffer(work({ directSaleEnabled: true, websitePriceMinor: null }), BASE)!;
    expect(o.price).toBe(2260);
  });

  it("never turns a zero website price into a free painting", () => {
    const o = artworkOffer(work({ directSaleEnabled: true, websitePriceMinor: 0 }), BASE)!;
    expect(o.price).toBe(2260);
  });

  it("publishes NO Offer for a sold work, direct sale or not", () => {
    expect(artworkOffer(work({ availability: "sold" }), BASE)).toBeNull();
    expect(artworkOffer(work({ availability: "sold", directSaleEnabled: true, websitePriceMinor: 240000 }), BASE)).toBeNull();
  });

  it("uses the currency the work is priced in, not a hardcoded one", () => {
    const o = artworkOffer(work({ directSaleEnabled: true, websitePriceMinor: 500000, websiteCurrency: "GBP" }), BASE)!;
    expect(o.priceCurrency).toBe("GBP");
    expect(o.price).toBe(5000);
  });

  it("converts minor units exactly, including a fractional amount", () => {
    const o = artworkOffer(work({ directSaleEnabled: true, websitePriceMinor: 240050 }), BASE)!;
    expect(o.price).toBe(2400.5);
  });
});
