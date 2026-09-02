/**
 * The Google Merchant Center feed's load-bearing promises: it advertises ONLY genuinely purchasable
 * prints, at the SAME price the PDP shows, with public first-party images and never a base64 blob or
 * the private master. A regression in any of these either gets the account disapproved or leaks the
 * sellable master asset — so each is pinned here.
 */
import { describe, it, expect } from "vitest";
import { buildMerchantFeed, merchantPrice, merchantAdditionalImageLinks, type MerchantFeedItem } from "./merchantFeed";

const BASE = "https://animuradyan.com";
const items: MerchantFeedItem[] = [
  { id: 19, title: "Road Through Gold", slug: "road_through_gold", priceMinor: 6900, currency: "USD" },
  { id: 20, title: "Beyond Every Limit", slug: "beyond_every_limit", priceMinor: 6900, currency: "USD" },
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
