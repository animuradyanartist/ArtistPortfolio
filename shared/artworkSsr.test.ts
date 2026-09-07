/**
 * The artwork page's load-bearing promises.
 *
 * Two of these encode defects that were live in production on 18 August 2026 and cost the
 * site every artwork impression it might have had:
 *
 *   - the detail page and the sales page published DIFFERENT currencies for the same
 *     painting (EUR vs USD, 35 works), so one of the two was necessarily false;
 *   - the detail page served 65 characters, no <h1> and no <img>, so there was nothing for
 *     a crawler to rank.
 *
 * A wrong machine-readable claim is worse than an absent one, so the currency assertions
 * are written against the constant AND against the rendered JSON-LD — pinning the value,
 * not merely the plumbing.
 */
import { describe, it, expect } from "vitest";
import {
  ARTWORK_PRICE_CURRENCY,
  artworkDimensions,
  artworkFactLine,
  artworkJsonLd,
  artworkSitemapImageLocs,
  artworkImageUrl,
  artworkNarrative,
  artworkOffer,
  artworkPublicPrice,
  artworkAvailabilityLine,
  isDirectSalePurchasableOriginal,
  originalShippingDetails,
  formatArtworkPrice,
  isPurchasable,
  renderArtworkHtml,
  type SsrArtwork,
} from "./artworkSsr";

const BASE = "https://animuradyan.com";

const artwork = (over: Partial<SsrArtwork> = {}): SsrArtwork => ({
  id: 42,
  title: "Blue Detachment",
  seoSlug: "blue-detachment-42",
  description: "A quiet field of blue that keeps its distance.",
  medium: "Oil on Canvas",
  dimensions: "80x100cm",
  year: 2025,
  price: 2370,
  availability: "available",
  images: ["https://cdn.example.com/blue.jpg"],
  derivedCategories: ["minimal"],
  ...over,
});

describe("the price has exactly one currency", () => {
  it("is USD — the currency the source data states", () => {
    // Singulart's own JSON-LD, which these rows were ingested from, says USD. Flipping
    // this constant does not convert the numbers; it publishes a false price.
    expect(ARTWORK_PRICE_CURRENCY).toBe("USD");
  });

  it("the detail page's offer and the sales page's offer are the same object shape", () => {
    const a = artwork();
    const detail = artworkJsonLd(a, BASE).offers as Record<string, unknown>;
    const list = artworkOffer(a, BASE);
    // The /artworks ItemList builds its offer from artworkOffer(); the detail page builds
    // its JSON-LD from artworkJsonLd(). If these ever disagree the site is once again
    // telling Google two different prices for one painting.
    expect(detail).toEqual(list);
    expect(detail.priceCurrency).toBe("USD");
    expect(detail.price).toBe(2370);
  });

  it("never contradicts itself between the body and the structured data", () => {
    const a = artwork();
    const html = renderArtworkHtml(a, BASE);
    const offer = artworkOffer(a, BASE)!;
    expect(html).toContain("USD 2,370");
    expect(html).not.toContain("EUR");
    expect(offer.priceCurrency).toBe("USD");
  });
});

describe("an offer is only made when the work can actually be bought", () => {
  it("no offer on a sold painting", () => {
    const a = artwork({ availability: "sold" });
    expect(isPurchasable(a)).toBe(false);
    expect(artworkOffer(a, BASE)).toBeNull();
    expect(artworkJsonLd(a, BASE).offers).toBeUndefined();
  });

  it("no offer when the price is zero or missing", () => {
    expect(artworkOffer(artwork({ price: 0 }), BASE)).toBeNull();
    expect(artworkOffer(artwork({ price: null }), BASE)).toBeNull();
  });

  it("a sold painting still renders a page, it just does not promise a sale", () => {
    const html = renderArtworkHtml(artwork({ availability: "sold" }), BASE);
    expect(html).toContain("private collection");
    expect(html).not.toContain("USD 2,370");
  });
});

describe("the public price is the website retail price where direct sale is on", () => {
  it("uses the website price + currency, never the marketplace figure, for a direct-sale work", () => {
    const a = artwork({ directSaleEnabled: true, websitePriceMinor: 240000, websiteCurrency: "EUR", price: 2370 });
    expect(artworkPublicPrice(a)).toEqual({ amount: 2400, currency: "EUR" });
    const html = renderArtworkHtml(a, BASE);
    expect(html).toContain("EUR 2,400");     // the website price a buyer can pay
    expect(html).not.toContain("USD 2,370"); // NOT the marketplace figure
  });

  it("falls back to the marketplace figure only when direct sale is off", () => {
    expect(artworkPublicPrice(artwork())).toEqual({ amount: 2370, currency: "USD" });
  });

  it("never reads a private/net price — only websitePriceMinor or the public marketplace price", () => {
    // A direct-sale work with NO website price shows nothing here rather than leaking `price`.
    expect(artworkPublicPrice(artwork({ directSaleEnabled: true, websitePriceMinor: null, price: 9999, availability: "sold" }))).toBeNull();
  });

  it("shows no price on a sold work, even with a website price set", () => {
    const a = artwork({ availability: "sold", directSaleEnabled: true, websitePriceMinor: 240000, websiteCurrency: "EUR" });
    const html = renderArtworkHtml(a, BASE);
    expect(html).not.toContain("EUR 2,400");
    expect(html).toContain("private collection");
  });

  it("the visible SSR price and the JSON-LD offer name the same currency for a direct-sale work", () => {
    const a = artwork({ directSaleEnabled: true, websitePriceMinor: 240000, websiteCurrency: "EUR" });
    const offer = artworkOffer(a, BASE)!;
    expect(offer.priceCurrency).toBe("EUR");
    expect(offer.price).toBe(2400);
    expect(renderArtworkHtml(a, BASE)).toContain("EUR 2,400");
  });

  it("formats an exact-dollar test item as its website price", () => {
    const a = artwork({ directSaleEnabled: true, websitePriceMinor: 100, websiteCurrency: "USD", price: 1 });
    expect(formatArtworkPrice(artworkPublicPrice(a))).toBe("USD 1");
    expect(renderArtworkHtml(a, BASE)).toContain("USD 1");
  });
});

describe("the page is readable by a crawler", () => {
  it("has a single h1 carrying the title", () => {
    const html = renderArtworkHtml(artwork(), BASE);
    expect(html.match(/<h1/g) ?? []).toHaveLength(1);
    expect(html).toContain(">Blue Detachment</h1>");
  });

  it("has an image with descriptive alt text", () => {
    const html = renderArtworkHtml(artwork(), BASE);
    expect(html).toContain('<img src="https://cdn.example.com/blue.jpg"');
    expect(html).toContain('alt="Blue Detachment — Oil on Canvas painting — by Ani Muradyan"');
  });

  it("links a LANDSCAPE work to the collection it belongs to (internal-linking for /collections/landscape-paintings)", () => {
    const landscape = renderArtworkHtml(artwork({ title: "Road to Tuscany" }), BASE); // "road" ∈ landscape words
    expect(landscape).toContain('href="/collections/landscape-paintings"');
    expect(landscape).toContain(">Contemporary Landscape Paintings</a>");
  });

  it("does NOT add the collection link to a non-landscape work", () => {
    // Title + description with no landscape cues (the isLandscape predicate reads both).
    const figurative = renderArtworkHtml(artwork({ title: "Quiet Portrait", description: "A close study of a face in repose." }), BASE);
    expect(figurative).not.toContain("/collections/landscape-paintings");
  });

  it("falls back to this site's image route when the row holds a stored image", () => {
    const html = renderArtworkHtml(artwork({ images: ["data:image/jpeg;base64,AAAA"] }), BASE);
    expect(html).toContain(`src="${BASE}/img/artwork/42/0"`);
  });

  it("carries substantially more than the 65 characters production served", () => {
    const text = renderArtworkHtml(artwork(), BASE).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    expect(text.length).toBeGreaterThan(200);
    expect(text).toContain("Blue Detachment");
    expect(text).toContain("Oil on Canvas");
  });

  it("states the facts it holds and omits the ones it does not", () => {
    expect(artworkFactLine(artwork())).toBe("Oil on Canvas · 80x100cm · 2025");
    expect(artworkFactLine(artwork({ dimensions: null, year: null }))).toBe("Oil on Canvas");
  });
});

describe("nothing is invented", () => {
  it("uses her published description when she wrote one", () => {
    expect(artworkNarrative(artwork())).toBe("A quiet field of blue that keeps its distance.");
  });

  it("states only what the row says when she did not", () => {
    const n = artworkNarrative(artwork({ description: null }));
    expect(n).toBe(
      "Blue Detachment, an original oil on canvas painting (80x100cm, 2025) by Armenian contemporary artist Ani Muradyan.",
    );
  });

  it("genre is emitted only from categories her own words stated", () => {
    expect(artworkJsonLd(artwork(), BASE).genre).toEqual(["minimal"]);
    expect(artworkJsonLd(artwork({ derivedCategories: [] }), BASE).genre).toBeUndefined();
    expect(artworkJsonLd(artwork({ derivedCategories: null }), BASE).genre).toBeUndefined();
  });

  it("dimensions become structured data only when they parse cleanly", () => {
    expect(artworkDimensions(artwork())).toEqual({ width: 80, height: 100 });
    expect(artworkDimensions(artwork({ dimensions: "roughly a metre" }))).toBeNull();
    expect(artworkJsonLd(artwork({ dimensions: "roughly a metre" }), BASE).width).toBeUndefined();
  });

  it("the description reaches the structured data, not just the meta tag", () => {
    // 36 descriptions were stored and none of them appeared in page data.
    expect(artworkJsonLd(artwork(), BASE).description).toBe(
      "A quiet field of blue that keeps its distance.",
    );
  });
});

describe("untrusted text cannot break out of the markup", () => {
  it("escapes a title that contains markup", () => {
    const html = renderArtworkHtml(artwork({ title: '<script>alert("x")</script>' }), BASE);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("ONE image URL across every surface (Google Images)", () => {
  // Google renders the page and indexes the URL in the rendered <img>. The site's data path
  // serves /img/artwork/:id/0?v=<hash> (a content cache-buster the /img route needs, because
  // it answers immutable/1-year). If the SSR <img>, the JSON-LD and the sitemap declare the
  // CLEAN /img/artwork/:id/0 instead, Google sees two URLs for one picture. These pin the fix:
  // when the row already carries the ?v= path, every surface preserves it verbatim.
  const refified = (over: Partial<SsrArtwork> = {}) =>
    artwork({ images: ["/img/artwork/42/0?v=abc123"], ...over });

  it("artworkImageUrl preserves a site-relative /img path, including its ?v= cache-buster", () => {
    expect(artworkImageUrl(refified(), BASE)).toBe(`${BASE}/img/artwork/42/0?v=abc123`);
  });

  it("still uses an absolute URL as-is, and synthesises only for a data: row", () => {
    expect(artworkImageUrl(artwork({ images: ["https://cdn.example.com/x.jpg"] }), BASE))
      .toBe("https://cdn.example.com/x.jpg");
    expect(artworkImageUrl(artwork({ images: ["data:image/jpeg;base64,AAAA"] }), BASE))
      .toBe(`${BASE}/img/artwork/42/0`);
  });

  it("the sitemap loc carries the same ?v= URL the rendered <img> uses", () => {
    const [loc] = artworkSitemapImageLocs(42, ["/img/artwork/42/0?v=abc123"], BASE);
    expect(loc).toBe(`${BASE}/img/artwork/42/0?v=abc123`);
  });

  it("the SSR <img> and the JSON-LD name the identical URL", () => {
    const a = refified();
    const html = renderArtworkHtml(a, BASE);
    const url = `${BASE}/img/artwork/42/0?v=abc123`;
    expect(html).toContain(`<img src="${url}"`);
    const ld = artworkJsonLd(a, BASE).image as Record<string, unknown>;
    expect(ld.contentUrl).toBe(url);
  });
});

describe("the artwork image is an ImageObject a crawler can read", () => {
  it("is an ImageObject with contentUrl, a caption, and representativeOfPage", () => {
    const img = artworkJsonLd(artwork(), BASE).image as Record<string, unknown>;
    expect(img["@type"]).toBe("ImageObject");
    expect(typeof img.contentUrl).toBe("string");
    expect(img.caption).toContain("Blue Detachment");
    expect(img.caption).toContain("Ani Muradyan");
    expect(img.representativeOfPage).toBe(true);
  });
});

// ── MERCHANT PARITY FOR PURCHASABLE ORIGINALS ────────────────────────────────────────────────────
// A genuinely purchasable direct-sale original must present to a crawler exactly like a print does:
// a shoppable Product/Offer with the website USD price, InStock, real shipping and a return policy —
// and its server body must NOT say "inquire to acquire". Enquiry-only originals are unchanged.
describe("purchasable original — Merchant-complete SSR (parity with prints)", () => {
  const buyable = (over: Partial<SsrArtwork> = {}): SsrArtwork =>
    artwork({
      id: 69,
      title: "Road to Tuscany",
      seoSlug: "road-to-tuscany-69",
      dimensions: "61x71cm",
      price: 2420, // the marketplace figure — must NOT become the offer price
      directSaleEnabled: true,
      websitePriceMinor: 110000,
      websiteCurrency: "USD",
      availability: "available",
      shippingEnabled: true,
      ...over,
    });

  it("the gate accepts a fully-eligible direct-sale original and fails closed otherwise", () => {
    expect(isDirectSalePurchasableOriginal(buyable())).toBe(true);
    expect(isDirectSalePurchasableOriginal(buyable({ shippingEnabled: false }))).toBe(false);
    expect(isDirectSalePurchasableOriginal(buyable({ availability: "reserved" }))).toBe(false);
    expect(isDirectSalePurchasableOriginal(buyable({ directSaleEnabled: false }))).toBe(false);
    expect(isDirectSalePurchasableOriginal(buyable({ websitePriceMinor: null }))).toBe(false);
  });

  it("the server-rendered body does NOT say 'inquire to acquire' — it says buy online", () => {
    const html = renderArtworkHtml(buyable(), BASE);
    expect(html.toLowerCase()).not.toContain("inquire to acquire");
    expect(html.toLowerCase()).toContain("buy online");
    expect(artworkAvailabilityLine(buyable())).not.toMatch(/inquire to acquire/i);
  });

  it("represents the direct-sale WEBSITE price (1100 USD), never the marketplace 2420", () => {
    const offer = artworkOffer(buyable(), BASE) as Record<string, any>;
    expect(offer.price).toBe(1100);
    expect(offer.priceCurrency).toBe("USD");
    expect(offer.availability).toBe("https://schema.org/InStock");
  });

  it("is a Product (multi-typed with VisualArtwork) with brand + condition", () => {
    const ld = artworkJsonLd(buyable(), BASE) as Record<string, any>;
    expect(ld["@type"]).toEqual(["VisualArtwork", "Product"]);
    expect(ld.brand).toMatchObject({ "@type": "Brand", name: "Ani Muradyan" });
    expect(ld.itemCondition).toBe("https://schema.org/NewCondition");
    expect(ld.offers["@type"]).toBe("Offer");
  });

  it("the Offer carries OfferShippingDetails with a real US rate", () => {
    const offer = artworkOffer(buyable(), BASE) as Record<string, any>;
    expect(Array.isArray(offer.shippingDetails)).toBe(true);
    expect(offer.shippingDetails.length).toBeGreaterThan(0);
    const us = offer.shippingDetails.find(
      (s: any) => s.shippingDestination?.addressCountry === "US",
    );
    expect(us["@type"]).toBe("OfferShippingDetails");
    expect(us.shippingRate.currency).toBe("USD");
    expect(Number(us.shippingRate.value)).toBeGreaterThan(0);
    // The same authoritative estimator the Merchant feed + checkout use.
    expect(originalShippingDetails(buyable()).length).toBeGreaterThan(0);
  });

  it("the Offer carries a MerchantReturnPolicy (14-day, by mail)", () => {
    const offer = artworkOffer(buyable(), BASE) as Record<string, any>;
    expect(offer.hasMerchantReturnPolicy["@type"]).toBe("MerchantReturnPolicy");
    expect(offer.hasMerchantReturnPolicy.merchantReturnDays).toBe(14);
    expect(offer.hasMerchantReturnPolicy.returnMethod).toBe("https://schema.org/ReturnByMail");
  });

  it("an enquiry-only original is unchanged: 'inquire', VisualArtwork only, no shipping/return fields", () => {
    const enquiry = artwork({ directSaleEnabled: false, availability: "available" });
    expect(isDirectSalePurchasableOriginal(enquiry)).toBe(false);
    expect(renderArtworkHtml(enquiry, BASE).toLowerCase()).toContain("inquire to acquire");
    const ld = artworkJsonLd(enquiry, BASE) as Record<string, any>;
    expect(ld["@type"]).toBe("VisualArtwork");
    expect(ld.offers?.shippingDetails).toBeUndefined();
    expect(ld.offers?.hasMerchantReturnPolicy).toBeUndefined();
  });

  it("a direct-sale work with shipping disabled is not advertised as buyable (fails closed)", () => {
    const noShip = buyable({ shippingEnabled: false });
    expect(renderArtworkHtml(noShip, BASE).toLowerCase()).toContain("inquire to acquire");
    const offer = artworkOffer(noShip, BASE) as Record<string, any>;
    // Still the honest website offer, but WITHOUT the merchant-completeness fields.
    expect(offer.price).toBe(1100);
    expect(offer.shippingDetails).toBeUndefined();
    expect(offer.hasMerchantReturnPolicy).toBeUndefined();
    expect(originalShippingDetails(noShip)).toHaveLength(0);
  });
});
