import { describe, it, expect } from "vitest";
import {
  printJsonLd,
  printIsIndexable,
  injectPrintMeta,
  renderPrintHtml,
  printImageUrl,
  type PrintSsrDetail,
} from "./printSsr";

const BASE = "https://animuradyan.com";

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
