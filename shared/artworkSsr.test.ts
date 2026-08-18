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
  artworkNarrative,
  artworkOffer,
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
