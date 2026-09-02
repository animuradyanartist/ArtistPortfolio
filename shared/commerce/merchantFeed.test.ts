/**
 * The Google Merchant Center feed's load-bearing promises: it advertises ONLY genuinely purchasable
 * prints, at the SAME price the PDP shows, with public first-party images and never a base64 blob or
 * the private master. A regression in any of these either gets the account disapproved or leaks the
 * sellable master asset — so each is pinned here.
 */
import { describe, it, expect } from "vitest";
import { buildMerchantFeed, merchantPrice, merchantAdditionalImageLinks, type MerchantFeedItem, type MerchantOriginalItem } from "./merchantFeed";

const BASE = "https://animuradyan.com";
const items: MerchantFeedItem[] = [
  { id: 19, title: "Road Through Gold", slug: "road_through_gold", priceMinor: 6900, currency: "USD" },
  { id: 20, title: "Beyond Every Limit", slug: "beyond_every_limit", priceMinor: 6900, currency: "USD" },
];
const EU_SHIP = [
  { country: "DE", priceMinor: 31482, currency: "EUR" },
  { country: "FR", priceMinor: 31482, currency: "EUR" },
  { country: "IT", priceMinor: 31482, currency: "EUR" },
  { country: "AT", priceMinor: 31482, currency: "EUR" },
];
const originals: MerchantOriginalItem[] = [
  { id: 40, title: "Blue Drift", path: "/artworks/blue-drift-40", description: "A quiet field of blue.", typeLabel: "Oil", priceMinor: 90000, currency: "EUR", imageCount: 3, shipping: EU_SHIP },
  { id: 42, title: "Sea & <Sky>", path: "/sea-and-sky", typeLabel: "Acrylic", priceMinor: 110000, currency: "EUR", imageCount: 1, shipping: EU_SHIP },
];

describe("buildMerchantFeed — RSS 2.0 envelope", () => {
  const xml = buildMerchantFeed(items, BASE);

  it("is a valid RSS 2.0 document with the Google namespace", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
    expect(xml).toContain("<channel>");
    expect(xml).toContain("</rss>");
  });

  it("emits one <item> per purchasable print", () => {
    expect((xml.match(/<item>/g) ?? [])).toHaveLength(2);
  });
});

describe("buildMerchantFeed — item contract", () => {
  const xml = buildMerchantFeed(items, BASE);

  it("uses a stable id derived from the print's database id", () => {
    expect(xml).toContain("<g:id>print-19</g:id>");
    expect(xml).toContain("<g:id>print-20</g:id>");
  });

  it("states the price in Google's format, matching the PDP starting price", () => {
    expect(merchantPrice(6900, "USD")).toBe("69.00 USD");
    expect(xml).toContain("<g:price>69.00 USD</g:price>");
  });

  it("marks a purchasable print in_stock with brand, new condition and no GTIN", () => {
    expect(xml).toContain("<g:availability>in_stock</g:availability>");
    expect(xml).toContain("<g:brand>Ani Muradyan</g:brand>");
    expect(xml).toContain("<g:condition>new</g:condition>");
    expect(xml).toContain("<g:identifier_exists>no</g:identifier_exists>");
  });

  it("links to the canonical PDP and a first-party /img/print image", () => {
    expect(xml).toContain("<g:link>https://animuradyan.com/prints/road_through_gold</g:link>");
    expect(xml).toContain("<g:image_link>https://animuradyan.com/img/print/19/0</g:image_link>");
  });

  it("declares the verified Google product category for art prints", () => {
    expect(xml).toContain(
      "<g:google_product_category>Home &amp; Garden &gt; Decor &gt; Artwork &gt; Posters, Prints, &amp; Visual Artwork</g:google_product_category>",
    );
  });
});

describe("additional_image_link — first-party gallery images", () => {
  it("emits one additional image per extra stored image, all first-party /img/print refs", () => {
    const xml = buildMerchantFeed([{ id: 19, title: "Road Through Gold", slug: "road_through_gold", priceMinor: 6900, currency: "USD", imageCount: 5 }], BASE);
    // 5 images → primary + 4 additional (indexes 1..4)
    expect((xml.match(/<g:additional_image_link>/g) ?? [])).toHaveLength(4);
    expect(xml).toContain("<g:additional_image_link>https://animuradyan.com/img/print/19/1</g:additional_image_link>");
    expect(xml).toContain("<g:additional_image_link>https://animuradyan.com/img/print/19/4</g:additional_image_link>");
  });

  it("caps additional images at Google's limit of 10", () => {
    expect(merchantAdditionalImageLinks(BASE, 1, 100)).toHaveLength(10);
  });

  it("emits none for a single-image print or an unknown count", () => {
    expect(merchantAdditionalImageLinks(BASE, 1, 1)).toEqual([]);
    expect(merchantAdditionalImageLinks(BASE, 1, undefined)).toEqual([]);
    expect(merchantAdditionalImageLinks(BASE, 1, null)).toEqual([]);
    const xml = buildMerchantFeed([{ id: 1, title: "One", slug: "one", priceMinor: 5000, currency: "USD", imageCount: 1 }], BASE);
    expect(xml).not.toContain("additional_image_link");
  });

  it("additional images never reference the master or base64", () => {
    const links = merchantAdditionalImageLinks(BASE, 19, 5);
    for (const u of links) {
      expect(u).toMatch(/^https:\/\/animuradyan\.com\/img\/print\/19\/[1-4]$/);
      expect(u).not.toContain("master");
      expect(u).not.toContain("data:");
    }
  });
});

describe("buildMerchantFeed — safety invariants", () => {
  it("NEVER contains a base64 blob or the private master route/asset", () => {
    const xml = buildMerchantFeed(items, BASE);
    expect(xml).not.toContain("data:image");
    expect(xml).not.toContain("master-file");
    expect(xml).not.toContain("printReadyAssetUrl");
    expect(xml).not.toContain("/api/"); // no blocked/private API URL is ever an image or link
  });

  it("drops an item with no positive price rather than advertising it as buyable", () => {
    const withUnpriced = buildMerchantFeed(
      [...items, { id: 99, title: "Unpriced", slug: "unpriced", priceMinor: 0, currency: "USD" }],
      BASE,
    );
    expect((withUnpriced.match(/<item>/g) ?? [])).toHaveLength(2);
    expect(withUnpriced).not.toContain("print-99");
  });

  it("XML-escapes titles so an ampersand or angle bracket cannot break the feed", () => {
    const xml = buildMerchantFeed([{ id: 1, title: 'Sea & <Sky>', slug: "sea-sky", priceMinor: 5000, currency: "USD" }], BASE);
    expect(xml).toContain("Sea &amp; &lt;Sky&gt;");
    expect(xml).not.toContain("Sea & <Sky>");
  });

  it("an empty catalogue yields a valid, item-less channel (never a broken document)", () => {
    const xml = buildMerchantFeed([], BASE);
    expect(xml).toContain("<channel>");
    expect(xml).toContain("</rss>");
    expect(xml).not.toContain("<item>");
  });
});

describe("buildMerchantFeed — original paintings in the same feed", () => {
  it("PRINT OUTPUT IS UNCHANGED when no originals are passed (byte-for-byte)", () => {
    expect(buildMerchantFeed(items, BASE, [])).toBe(buildMerchantFeed(items, BASE));
  });

  it("emits prints AND originals with collision-safe ids that cannot clash", () => {
    const xml = buildMerchantFeed(items, BASE, originals);
    expect((xml.match(/<item>/g) ?? [])).toHaveLength(4);
    expect(xml).toContain("<g:id>print-19</g:id>");
    expect(xml).toContain("<g:id>print-20</g:id>");
    expect(xml).toContain("<g:id>original-40</g:id>");
    expect(xml).toContain("<g:id>original-42</g:id>");
    // A print id and an original id share the same number but never the same feed id.
    const printAlso20 = buildMerchantFeed([{ id: 40, title: "P", slug: "p", priceMinor: 5000, currency: "USD" }], BASE, [originals[0]]);
    expect(printAlso20).toContain("<g:id>print-40</g:id>");
    expect(printAlso20).toContain("<g:id>original-40</g:id>");
  });

  it("gives an original its own title, product_type, EUR price and canonical link", () => {
    const xml = buildMerchantFeed([], BASE, [originals[0]]);
    expect(xml).toContain("<g:title>Blue Drift — Original Oil Painting</g:title>");
    expect(xml).toContain("<g:product_type>Original Paintings</g:product_type>");
    expect(xml).toContain("<g:price>900.00 EUR</g:price>");
    expect(xml).toContain("<g:link>https://animuradyan.com/artworks/blue-drift-40</g:link>");
    expect(xml).toContain("<g:availability>in_stock</g:availability>");
    expect(xml).toContain("<g:brand>Ani Muradyan</g:brand>");
    expect(xml).toContain("<g:condition>new</g:condition>");
    expect(xml).toContain("<g:identifier_exists>no</g:identifier_exists>");
  });

  it("honours a root-level seoSlug link and XML-escapes the title", () => {
    const xml = buildMerchantFeed([], BASE, [originals[1]]);
    expect(xml).toContain("<g:link>https://animuradyan.com/sea-and-sky</g:link>");
    expect(xml).toContain("Sea &amp; &lt;Sky&gt; — Original Acrylic Painting");
  });

  it("uses first-party /img/artwork images (primary + additional), NEVER a print master or base64", () => {
    const xml = buildMerchantFeed([], BASE, [originals[0]]);
    expect(xml).toContain("<g:image_link>https://animuradyan.com/img/artwork/40/0</g:image_link>");
    expect((xml.match(/<g:additional_image_link>/g) ?? [])).toHaveLength(2); // 3 images → 1..2
    expect(xml).toContain("<g:additional_image_link>https://animuradyan.com/img/artwork/40/1</g:additional_image_link>");
    expect(xml).not.toContain("/img/print/");   // never a print image on an original
    expect(xml).not.toContain("master");
    expect(xml).not.toContain("data:image");
    expect(xml).not.toContain("/api/");
  });

  it("the channel title advertises both product lines only when originals are present", () => {
    expect(buildMerchantFeed(items, BASE, originals)).toContain("Fine Art Prints &amp; Original Paintings");
    expect(buildMerchantFeed(items, BASE, [])).toContain("<title>Ani Muradyan — Fine Art Prints</title>");
  });

  it("drops an unpriced original rather than advertising it", () => {
    const xml = buildMerchantFeed([], BASE, [{ id: 7, title: "Free?", path: "/artworks/free-7", typeLabel: "Oil", priceMinor: 0, currency: "EUR" }]);
    expect(xml).not.toContain("original-7");
    expect(xml).not.toContain("<item>");
  });
});

describe("buildMerchantFeed — per-item g:shipping on originals (launch market DE/FR/IT/AT, EUR)", () => {
  it("emits a g:shipping block for EACH launch country with the exact amount + EUR", () => {
    const xml = buildMerchantFeed([], BASE, [originals[0]]);
    expect((xml.match(/<g:shipping>/g) ?? [])).toHaveLength(4);
    for (const c of ["DE", "FR", "IT", "AT"]) {
      expect(xml).toContain(`<g:country>${c}</g:country>`);
    }
    // Each country carries its price as a nested <g:price> inside <g:shipping>, in Google's format.
    expect((xml.match(/<g:price>314\.82 EUR<\/g:price>/g) ?? [])).toHaveLength(4);
  });

  it("keeps the item's own <g:price> distinct from its shipping prices", () => {
    const xml = buildMerchantFeed([], BASE, [originals[0]]);
    expect(xml).toContain("<g:price>900.00 EUR</g:price>"); // the artwork price (90000 minor)
    expect(xml).toContain("<g:price>314.82 EUR</g:price>"); // a shipping price (31482 minor)
  });

  it("emits shipping in the artwork's own currency (EUR)", () => {
    const xml = buildMerchantFeed([], BASE, [originals[0]]);
    // No non-EUR currency leaks into a shipping line.
    expect(xml).not.toMatch(/<g:price>[\d.]+ USD<\/g:price>\s*<\/g:shipping>/);
    expect(xml).toContain("<g:country>DE</g:country>");
  });

  it("PRINTS carry NO per-item g:shipping (their shipping stays account-level, unchanged)", () => {
    const xml = buildMerchantFeed(items, BASE); // prints only
    expect(xml).not.toContain("<g:shipping>");
    expect(xml).not.toContain("<g:country>");
  });

  it("an original WITHOUT a shipping array emits no g:shipping (never a blank/zero shipping line)", () => {
    const xml = buildMerchantFeed([], BASE, [{ id: 8, title: "No Ship", path: "/artworks/no-ship-8", typeLabel: "Oil", priceMinor: 50000, currency: "EUR" }]);
    expect(xml).toContain("<g:id>original-8</g:id>");
    expect(xml).not.toContain("<g:shipping>");
  });

  it("remains a valid RSS 2.0 document with prints + originals + shipping all present", () => {
    const xml = buildMerchantFeed(items, BASE, originals);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
    expect((xml.match(/<item>/g) ?? [])).toHaveLength(4);
    expect((xml.match(/<item>/g) ?? []).length).toBe((xml.match(/<\/item>/g) ?? []).length);
    expect((xml.match(/<g:shipping>/g) ?? []).length).toBe((xml.match(/<\/g:shipping>/g) ?? []).length);
    expect(xml).toContain("</rss>");
    // Safety still holds with shipping present.
    expect(xml).not.toContain("data:image");
    expect(xml).not.toContain("master");
    expect(xml).not.toContain("/api/");
  });
});
