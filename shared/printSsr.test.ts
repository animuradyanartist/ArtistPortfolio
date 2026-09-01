import { describe, it, expect } from "vitest";
import {
  printJsonLd,
  printIsIndexable,
  injectPrintMeta,
  printMetaDescription,
  injectPrintsIndexMeta,
  renderPrintHtml,
  printImageUrl,
  type PrintSsrDetail,
} from "./printSsr";

const BASE = "https://animuradyan.com";
const SHELL = `<!doctype html><html><head><title>Ani Muradyan – Contemporary Oil Painter</title><meta name="title" content="old"><meta name="description" content="old"><meta property="og:title" content="old"><meta property="og:description" content="old"><meta property="og:url" content="old"><meta name="twitter:title" content="old"><meta name="twitter:description" content="old"><meta name="robots" content="index,follow"><link rel="canonical" href="https://animuradyan.com/old"></head><body><div id="root"></div></body></html>`;

function detail(over: Partial<PrintSsrDetail> = {}): PrintSsrDetail {
  return {
    id: 10,
    slug: "blue-hour",
    title: "Blue Hour",
    description: "desc",
    image: "/img/artwork/42/0",
    artworkId: 42,
    purchasable: true,
    startingPriceMinor: 6500,
    currency: "EUR",
    ...over,
  };
}

describe("printJsonLd — Product with an honest Offer", () => {
  it("emits a Product with an InStock Offer when purchasable + priced", () => {
    const ld = printJsonLd(detail(), BASE) as any;
    expect(ld["@type"]).toBe("Product");
    expect(ld.brand).toEqual({ "@type": "Brand", name: "Ani Muradyan" });
    expect(ld.url).toBe("https://animuradyan.com/prints/blue-hour");
    expect(ld.offers).toMatchObject({
      "@type": "Offer",
      priceCurrency: "EUR",
      price: "65.00",
      availability: "https://schema.org/InStock",
    });
  });

  it("emits NO offer when not purchasable (the whole catalogue today)", () => {
    const ld = printJsonLd(detail({ purchasable: false }), BASE) as any;
    expect(ld["@type"]).toBe("Product");
    expect(ld.offers).toBeUndefined();
  });

  it("emits NO offer when purchasable but unpriced", () => {
    const ld = printJsonLd(detail({ startingPriceMinor: null }), BASE) as any;
    expect(ld.offers).toBeUndefined();
  });

  it("uses the own-site price only — never a marketplace figure (there is no fallback path)", () => {
    const ld = printJsonLd(detail({ startingPriceMinor: 12000 }), BASE) as any;
    expect(ld.offers.price).toBe("120.00");
  });
});

describe("indexability + image", () => {
  it("is indexable only when purchasable + priced", () => {
    expect(printIsIndexable(detail())).toBe(true);
    expect(printIsIndexable(detail({ purchasable: false }))).toBe(false);
    expect(printIsIndexable(detail({ startingPriceMinor: null }))).toBe(false);
    expect(printIsIndexable(detail({ startingPriceMinor: 0 }))).toBe(false);
  });

  it("absolutises a relative image, leaves an absolute one alone", () => {
    expect(printImageUrl(detail({ image: "/img/x.jpg" }), BASE)).toBe("https://animuradyan.com/img/x.jpg");
    expect(printImageUrl(detail({ image: "https://cdn/x.jpg" }), BASE)).toBe("https://cdn/x.jpg");
    expect(printImageUrl(detail({ image: null }), BASE)).toBe("");
  });
});

describe("injectPrintMeta", () => {
  const shell = `<!doctype html><html><head><title>old</title><meta name="description" content="old"><link rel="canonical" href="https://x/old"></head><body><div id="root"></div></body></html>`;

  it("sets a print-specific title, canonical and index directive when purchasable", () => {
    const out = injectPrintMeta(shell, detail(), BASE);
    expect(out).toContain("<title>Blue Hour — Fine-Art Print · Ani Muradyan</title>");
    expect(out).toContain(`href="https://animuradyan.com/prints/blue-hour"`);
    expect(out).toContain('name="robots" content="index,follow"');
    expect(out).toContain('id="print-jsonld"');
    expect(out).toContain('"@type":"Product"');
  });

  it("marks an unready print noindex and omits the Offer", () => {
    const out = injectPrintMeta(shell, detail({ purchasable: false }), BASE);
    expect(out).toContain('name="robots" content="noindex,follow"');
    expect(out).not.toContain("InStock");
  });
});

describe("renderPrintHtml", () => {
  it("shows a price line for a purchasable print and a link to the original", () => {
    const html = renderPrintHtml(detail(), BASE);
    expect(html).toContain("From EUR 65.00");
    expect(html).toContain("/artworks/42");
  });
  it("shows coming soon for an unready print", () => {
    expect(renderPrintHtml(detail({ purchasable: false }), BASE)).toContain("Coming soon");
  });
});

describe("printMetaDescription — front-loads the work's real subject", () => {
  it("leads with the description's first sentence so the SERP snippet says what it depicts", () => {
    const d = printMetaDescription(detail({
      title: "Beyond Every Limit",
      description: "Edge of the Infinite captures the quiet power of nature through luminous blue waters, towering white cliffs and an expansive horizon. More text that should not appear.",
    }));
    expect(d.startsWith("Edge of the Infinite captures the quiet power of nature")).toBe(true);
    expect(d).toContain("luminous blue waters");
    expect(d).not.toContain("More text that should not appear");
    expect(d).toContain("Beyond Every Limit"); // still names the print
    expect(d).toContain("Giclée fine-art print");
  });
  it("falls back to the plain framing when there is no description", () => {
    const d = printMetaDescription(detail({ title: "Untitled", description: "" }));
    expect(d).toContain("Museum-quality");
    expect(d).toContain('"Untitled"');
  });
});

describe("injectPrintsIndexMeta — the /prints listing gets its OWN SEO", () => {
  const cards = [
    { title: "Beyond Every Limit", slug: "beyond_every_limit" },
    { title: "Road Through Gold", slug: "road_through_gold" },
  ];
  const out = injectPrintsIndexMeta(SHELL, cards, BASE);

  it("replaces the inherited homepage title with a fine-art-prints title", () => {
    expect(out).toContain("<title>Fine Art Prints — Giclée Prints of Contemporary Paintings | Ani Muradyan</title>");
    expect(out).not.toContain("Ani Muradyan – Contemporary Oil Painter</title>");
  });
  it("sets a prints-specific description + canonical + og:url + index,follow", () => {
    expect(out).toContain('name="description" content="Museum-quality giclée fine art prints');
    expect(out).toContain('rel="canonical" href="https://animuradyan.com/prints"');
    expect(out).toContain('property="og:url" content="https://animuradyan.com/prints"');
    expect(out).toContain('name="robots" content="index,follow"');
  });
  it("injects a crawlable H1 + a link per purchasable print", () => {
    expect(out).toContain('id="prints-ssr"');
    expect(out).toContain(">Fine Art Prints</h1>");
    expect(out).toContain('href="https://animuradyan.com/prints/beyond_every_limit"');
    expect(out).toContain('href="https://animuradyan.com/prints/road_through_gold"');
    expect(out).toContain('href="https://animuradyan.com/artworks"'); // links back to originals
  });
  it("adds a CollectionPage + ItemList JSON-LD covering every print", () => {
    expect(out).toContain('id="prints-collection-jsonld"');
    expect(out).toContain('"@type":"CollectionPage"');
    expect(out).toContain('"@type":"ItemList"');
    expect(out).toContain('"numberOfItems":2');
  });
});
