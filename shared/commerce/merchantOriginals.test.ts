/**
 * Which originals enter the Merchant feed — the eligibility gate + the serialised shape.
 *
 * These pin that the feed reuses the SAME purchasability rule the checkout uses: only a work that can
 * genuinely be bought on the site right now is advertised, and every excluded state (sold, direct-sale
 * off, no price, committed, reserved, shipping off) is dropped. A leak here either advertises an
 * unbuyable painting to Google or prices it wrong.
 */
import { describe, it, expect } from "vitest";
import {
  selectMerchantOriginals,
  typeLabelFor,
  MERCHANT_ORIGINAL_SHIP_COUNTRIES,
  type MerchantOriginalArtwork,
} from "./merchantOriginals";
import { estimateShipping } from "./shipping";

function artwork(over: Partial<MerchantOriginalArtwork> = {}): MerchantOriginalArtwork {
  return {
    id: 40,
    title: "Blue Drift",
    seoSlug: null,
    type: "oil",
    description: "A quiet field of blue.",
    images: ["data:image/jpeg;base64,AAAA", "https://cdn/x.jpg", "https://cdn/y.jpg"],
    dimensions: "80x100cm", // a standard, quotable size (parcel service, not freight)
    availability: "available",
    directSaleEnabled: true,
    websitePriceMinor: 90000,
    websiteCurrency: "EUR",
    shippingEnabled: true,
    reservedUntil: null,
    hasCommitment: false,
    commitmentUntil: null,
    shippingOverrideMinor: null,
    shippingDestinationOverrides: null,
    packedDepthCm: null,
    packingMarginCm: null,
    ...over,
  };
}

describe("selectMerchantOriginals — eligibility (the canonical gate)", () => {
  it("INCLUDES a genuinely purchasable original", () => {
    const out = selectMerchantOriginals([artwork()]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(40);
  });

  it("EXCLUDES a sold work", () => {
    expect(selectMerchantOriginals([artwork({ availability: "sold" })])).toHaveLength(0);
  });

  it("EXCLUDES a not-for-sale / inquiry-only work (direct sale off)", () => {
    expect(selectMerchantOriginals([artwork({ directSaleEnabled: false })])).toHaveLength(0);
  });

  it("EXCLUDES a work with no website price (price-on-request)", () => {
    expect(selectMerchantOriginals([artwork({ websitePriceMinor: null })])).toHaveLength(0);
    expect(selectMerchantOriginals([artwork({ websitePriceMinor: 0 })])).toHaveLength(0);
  });

  it("EXCLUDES a work with no currency", () => {
    expect(selectMerchantOriginals([artwork({ websiteCurrency: null })])).toHaveLength(0);
  });

  it("EXCLUDES a work promised to a gallery/collector (committed)", () => {
    expect(selectMerchantOriginals([artwork({ hasCommitment: true, commitmentUntil: null })])).toHaveLength(0);
  });

  it("EXCLUDES a work held by another checkout (reserved)", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(selectMerchantOriginals([artwork({ reservedUntil: future })])).toHaveLength(0);
  });

  it("EXCLUDES a work that cannot be shipped", () => {
    expect(selectMerchantOriginals([artwork({ shippingEnabled: false })])).toHaveLength(0);
  });

  it("keeps only the eligible ones from a mixed list", () => {
    const out = selectMerchantOriginals([
      artwork({ id: 1 }),
      artwork({ id: 2, availability: "sold" }),
      artwork({ id: 3, directSaleEnabled: false }),
      artwork({ id: 4, websitePriceMinor: null }),
      artwork({ id: 5 }),
    ]);
    expect(out.map((o) => o.id).sort()).toEqual([1, 5]);
  });
});

describe("selectMerchantOriginals — serialised shape (matches PDP + checkout)", () => {
  it("carries the website price + currency (never the marketplace price)", () => {
    const o = selectMerchantOriginals([artwork({ websitePriceMinor: 90000, websiteCurrency: "EUR" })])[0];
    expect(o.priceMinor).toBe(90000);
    expect(o.currency).toBe("EUR");
  });

  it("uses the /artworks/<slug>-<id> canonical path when there is no seoSlug", () => {
    expect(selectMerchantOriginals([artwork({ seoSlug: null, title: "Blue Drift", id: 40 })])[0].path)
      .toBe("/artworks/blue-drift-40");
  });

  it("uses the root-level /<seoSlug> canonical path when a seoSlug exists", () => {
    expect(selectMerchantOriginals([artwork({ seoSlug: "blue-drift-original-oil-painting" })])[0].path)
      .toBe("/blue-drift-original-oil-painting");
  });

  it("derives the medium label from the type column", () => {
    expect(typeLabelFor("oil")).toBe("Oil");
    expect(typeLabelFor("acrylic")).toBe("Acrylic");
    expect(typeLabelFor("mixed")).toBe("Mixed-Media");
    expect(typeLabelFor("")).toBe("");
    expect(selectMerchantOriginals([artwork({ type: "acrylic" })])[0].typeLabel).toBe("Acrylic");
  });

  it("counts only real stored images for additional_image_link", () => {
    expect(selectMerchantOriginals([artwork({ images: ["a", "b", "", null, "c"] })])[0].imageCount).toBe(3);
    expect(selectMerchantOriginals([artwork({ images: null })])[0].imageCount).toBeNull();
  });
});

describe("selectMerchantOriginals — per-item shipping (reuses the checkout estimator)", () => {
  it("attaches shipping for EVERY launch country (DE, FR, IT, AT) to an eligible original", () => {
    const o = selectMerchantOriginals([artwork()])[0];
    expect(o.shipping?.map((s) => s.country).sort()).toEqual(["AT", "DE", "FR", "IT"]);
  });

  it("emits the EXACT DE shipping the authoritative checkout estimator returns", () => {
    const a = artwork();
    const quote = estimateShipping(a, "DE");
    expect(quote.ok).toBe(true);
    const de = selectMerchantOriginals([a])[0].shipping?.find((s) => s.country === "DE");
    expect(de?.priceMinor).toBe(quote.ok ? quote.amountMinor : -1);
  });

  it("emits the EXACT FR shipping the authoritative checkout estimator returns", () => {
    const a = artwork();
    const quote = estimateShipping(a, "FR");
    const fr = selectMerchantOriginals([a])[0].shipping?.find((s) => s.country === "FR");
    expect(fr?.priceMinor).toBe(quote.ok ? quote.amountMinor : -1);
  });

  it("emits the EXACT IT shipping the authoritative checkout estimator returns", () => {
    const a = artwork();
    const quote = estimateShipping(a, "IT");
    const it = selectMerchantOriginals([a])[0].shipping?.find((s) => s.country === "IT");
    expect(it?.priceMinor).toBe(quote.ok ? quote.amountMinor : -1);
  });

  it("emits the EXACT AT shipping the authoritative checkout estimator returns", () => {
    const a = artwork();
    const quote = estimateShipping(a, "AT");
    const at = selectMerchantOriginals([a])[0].shipping?.find((s) => s.country === "AT");
    expect(at?.priceMinor).toBe(quote.ok ? quote.amountMinor : -1);
  });

  it("labels every shipping line with the artwork's own currency (EUR)", () => {
    const o = selectMerchantOriginals([artwork({ websiteCurrency: "EUR" })])[0];
    expect(o.shipping?.every((s) => s.currency === "EUR")).toBe(true);
  });

  it("PARITY: every launch-country shipping equals estimateShipping() minor-for-minor (no duplicated logic)", () => {
    const a = artwork({ id: 41, dimensions: "70x90cm" });
    const o = selectMerchantOriginals([a])[0];
    for (const country of MERCHANT_ORIGINAL_SHIP_COUNTRIES) {
      const quote = estimateShipping(a, country);
      expect(quote.ok).toBe(true);
      const line = o.shipping?.find((s) => s.country === country);
      expect(line?.priceMinor).toBe(quote.ok ? quote.amountMinor : -1);
    }
  });

  it("EXCLUDES a freight-only / parcel-too-large original (no usable automatic quote)", () => {
    // Longest side 300cm > MAX_LONGEST_SIDE_CM (274) → estimateShipping refuses → excluded.
    // This is the exact mechanism that removes artwork id 79 ("No Measure for Distance",
    // parcel-too-large in production) from the feed while checkout cannot auto-quote it.
    const oversized = artwork({ id: 79, dimensions: "300x60cm" });
    expect(estimateShipping(oversized, "DE").ok).toBe(false);
    expect(selectMerchantOriginals([oversized])).toHaveLength(0);
  });

  it("EXCLUDES a work whose dimensions cannot be read (no automatic quote)", () => {
    const noDims = artwork({ id: 43, dimensions: null });
    expect(estimateShipping(noDims, "DE").ok).toBe(false);
    expect(selectMerchantOriginals([noDims])).toHaveLength(0);
  });
});
