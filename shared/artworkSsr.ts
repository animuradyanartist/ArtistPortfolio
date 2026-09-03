/**
 * ARTWORK DETAIL PAGES — the crawlable version.
 *
 * The site renders on the client, so a crawl of an artwork page returned the shell: 65
 * characters of text, no <h1>, and not a single <img>. Everything a buyer would search for
 * — the title, the medium, the size, the price, her description — existed only after
 * JavaScript ran. Across every period on record, not one of the 53 artwork pages had
 * received a single Google impression. They are the pages most likely to bring a collector
 * looking for a specific kind of painting, and they were contributing nothing.
 *
 * This module is the same answer /path and /blog already use: render the facts the database
 * holds into plain semantic HTML, server-side, from a pure function that can be tested. It
 * is deliberately NOT in server/routes.ts — a renderer that decides what the world is told
 * about a painting should be assertable without booting Express.
 *
 * TWO RULES GOVERN EVERYTHING HERE.
 *
 * 1. NOTHING IS INVENTED. Every sentence is either a column of the row or a sentence she
 *    wrote. Where a work has no description, the page states the medium, size and year and
 *    stops — a page that says less is recoverable, a page that says something false about
 *    her work is not.
 *
 * 2. THE PRICE HAS ONE CURRENCY. `ARTWORK_PRICE_CURRENCY` is the only place a currency is
 *    named, and both the detail page and the /artworks ItemList read it. They previously
 *    disagreed — EUR on the painting's own page, USD on the sales page, for the same 35
 *    works — which meant one of the two machine-readable prices was simply wrong. Exporting
 *    one constant is what stops that from being expressible again.
 */
import { artworkCanonicalUrl, type CanonicalArtwork } from "./canonical";
import { isLandscape } from "./collections";

/**
 * The currency the stored `price` integer is denominated in.
 *
 * USD, established from the source rather than assumed: the Singulart listing pages these
 * rows were ingested from carry `"priceCurrency":"USD"` in their own JSON-LD (29 offers
 * across the saved fixtures, no EUR and no euro sign anywhere), the scraper's price-text
 * fallback only matches a `$` amount, and the field is `priceUsd` through every step of the
 * pipeline. Relabelling these numbers EUR would not convert them — it would publish a false
 * price. Changing the currency the artist actually sells in is a business decision that
 * requires re-reading the source, not editing this line.
 */
export const ARTWORK_PRICE_CURRENCY = "USD";

export interface SsrArtwork extends CanonicalArtwork {
  description?: string | null;
  medium?: string | null;
  dimensions?: string | null;
  year?: number | null;
  price?: number | null;
  availability?: string | null;
  images?: (string | null)[] | null;
  /** Categories her own source description explicitly states. Never inferred. */
  derivedCategories?: string[] | null;
  /** Direct website sale — so the server-rendered Offer can state the price a buyer can
   *  actually pay here, rather than the marketplace figure. See artworkOffer. */
  directSaleEnabled?: boolean | null;
  websitePriceMinor?: number | null;
  websiteCurrency?: string | null;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** True when a work is genuinely purchasable at a stated price. */
export function isPurchasable(a: SsrArtwork): boolean {
  return a.availability === "available" && typeof a.price === "number" && a.price > 0;
}

/**
 * The image a crawler should see. Prefers the absolute source URL — the same one the image
 * sitemap already declares, so the picture found on the page is the picture that was
 * submitted — and falls back to this site's own image route when the row holds a stored
 * (base64) image rather than a URL.
 */
export function artworkImageUrl(a: SsrArtwork, baseUrl: string): string {
  const first = Array.isArray(a.images) ? a.images.find((i) => typeof i === "string" && i.trim()) : null;
  if (!first) return `${baseUrl}/img/artwork/${a.id}/0`;
  // An absolute URL is used as-is. A SITE-RELATIVE path is preserved verbatim — including any
  // `?v=<hash>` cache-buster — so the URL a crawler is given here is byte-for-byte the one the
  // hydrated page renders and Google Images actually indexes. Rebuilding the clean path (the
  // old behaviour) produced a SECOND address for the same picture: the sitemap and the SSR
  // declared /img/artwork/40/0 while the rendered <img> pointed at /img/artwork/40/0?v=…, so
  // Google saw two URLs for one image. Only a data: URL (or a bare token) is synthesised.
  if (/^https?:\/\//i.test(first)) return first;
  if (first.startsWith("/")) return `${baseUrl}${first}`;
  return `${baseUrl}/img/artwork/${a.id}/0`;
}

/** "Oil on Canvas · 79x71cm · 2026" — only the parts that exist. */
export function artworkFactLine(a: SsrArtwork): string {
  return [a.medium, a.dimensions, a.year ? String(a.year) : null]
    .map((p) => (typeof p === "string" ? p.trim() : p))
    .filter(Boolean)
    .join(" · ");
}

/** The one-line availability statement, in the words the meta description already uses. */
export function artworkAvailabilityLine(a: SsrArtwork): string {
  return a.availability === "sold"
    ? "This original work is in a private collection."
    : "Original painting available — inquire to acquire.";
}

/**
 * The prose for the page.
 *
 * Her published description when she wrote one. Otherwise a sentence assembled strictly
 * from the row's own columns — medium, size, year — which states what the work IS without
 * characterising it. `sourceDescription` is deliberately NOT used as a substitute: it is
 * ingested as source material for grounding claims, not as copy for her site, and every
 * work that has one already has a published description anyway (36 of 36), so reaching for
 * it would add nothing and quietly publish text she never chose to publish.
 */
export function artworkNarrative(a: SsrArtwork): string {
  const published = a.description?.trim();
  if (published) return published.replace(/\s+/g, " ");
  const bits = [a.dimensions, a.year ? String(a.year) : null].filter(Boolean).join(", ");
  const medium = (a.medium?.trim() || "oil on canvas").toLowerCase();
  return `${a.title}, an original ${medium} painting${bits ? ` (${bits})` : ""} by Armenian contemporary artist Ani Muradyan.`;
}

/** Dimensions as structured data — emitted ONLY when the stored string parses cleanly. */
export function artworkDimensions(a: SsrArtwork): { width: number; height: number } | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*cm\s*$/i.exec(a.dimensions ?? "");
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

/** The Offer node — or null when the work is not for sale, so the site never promises
 *  something it cannot deliver. */
export function artworkOffer(a: SsrArtwork, baseUrl: string): Record<string, unknown> | null {
  if (!isPurchasable(a)) return null;
  const url = artworkCanonicalUrl(baseUrl, a);

  // ONE PAINTING, ONE OFFER — whoever is asking.
  //
  // This runs server-side, before JavaScript; the artwork page emits its own Offer after
  // hydration. When direct sale is on they must agree, and they did not: this said
  // "USD 2260" (the Singulart figure) while the rendered page said "EUR 2400" (the website
  // price), so a first-wave crawler and a person saw two different prices for the same work.
  //
  // Direct sale wins where it applies, because it is the price somebody can actually pay
  // here. Everywhere else the marketplace Offer is untouched.
  const websiteMinor = a.websitePriceMinor;
  if (a.directSaleEnabled && typeof websiteMinor === "number" && websiteMinor > 0) {
    return {
      "@type": "Offer",
      price: websiteMinor / 100,
      priceCurrency: a.websiteCurrency || "USD",
      availability: "https://schema.org/InStock",
      url,
    };
  }

  return {
    "@type": "Offer",
    price: a.price,
    priceCurrency: ARTWORK_PRICE_CURRENCY,
    availability: "https://schema.org/InStock",
    url,
  };
}

/**
 * THE PUBLIC PRICE A BUYER CAN ACTUALLY PAY, and its currency.
 *
 * Website retail price where direct sale is on (the figure the Buy button charges), otherwise
 * the marketplace price. NEVER the artist/net price — that column is not read here at all. Null
 * for a work that is not on sale at a stated price, so no caller can show a misleading number.
 * The Offer node and the visible price line both read this, so structured data and the words on
 * the page can never name different prices for one painting.
 */
export function artworkPublicPrice(a: SsrArtwork): { amount: number; currency: string } | null {
  if (a.directSaleEnabled && typeof a.websitePriceMinor === "number" && a.websitePriceMinor > 0) {
    return { amount: a.websitePriceMinor / 100, currency: a.websiteCurrency || "USD" };
  }
  if (a.availability === "available" && typeof a.price === "number" && a.price > 0) {
    return { amount: a.price, currency: ARTWORK_PRICE_CURRENCY };
  }
  return null;
}

/**
 * "USD 2,370" / "EUR 2,400" — the public price formatted for the crawlable body.
 *
 * The `CODE amount` shape is kept deliberately: it is the one this module and the /artworks
 * labels have always used, and one machine-readable format for the price is the whole point of
 * this file. (The hydrated client panel formats the same figure with a currency symbol; it
 * replaces this on load.) Null when there is no price to show.
 */
export function formatArtworkPrice(p: { amount: number; currency: string } | null): string | null {
  if (!p) return null;
  const amount = p.amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${p.currency} ${amount}`;
}

/** VisualArtwork structured data for one painting. */
export function artworkJsonLd(a: SsrArtwork, baseUrl: string): Record<string, unknown> {
  const url = artworkCanonicalUrl(baseUrl, a);
  const jsonld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "VisualArtwork",
    name: a.title,
    description: artworkNarrative(a),
    // An ImageObject, not a bare URL — so the picture carries its own contentUrl and a caption
    // Google Images can read, rather than a naked link. `representativeOfPage` marks it as THE
    // image of this artwork, which is exactly what a single-work page is.
    image: {
      "@type": "ImageObject",
      contentUrl: artworkImageUrl(a, baseUrl),
      url: artworkImageUrl(a, baseUrl),
      caption: `${a.title} — ${a.medium || "oil on canvas"} painting by Ani Muradyan`,
      representativeOfPage: true,
    },
    url,
    artform: "Painting",
    artMedium: a.medium || "oil on canvas",
    artworkSurface: "Canvas",
    // Same @id as the homepage Person and the /about ProfilePage, so search/AI systems unify the
    // creator of every artwork with the one artist entity instead of minting a new node per page.
    creator: { "@type": "Person", "@id": `${baseUrl}/#person`, name: "Ani Muradyan", url: baseUrl },
  };
  if (a.year) jsonld.dateCreated = String(a.year);

  const dims = artworkDimensions(a);
  if (dims) {
    jsonld.width = { "@type": "QuantitativeValue", value: dims.width, unitCode: "CMT" };
    jsonld.height = { "@type": "QuantitativeValue", value: dims.height, unitCode: "CMT" };
  }

  // Genre comes only from categories her own description explicitly stated. An empty list
  // is the common and correct answer, and is left absent rather than guessed.
  const genres = (a.derivedCategories ?? []).filter((g): g is string => Boolean(g && g.trim()));
  if (genres.length) jsonld.genre = genres;

  const offer = artworkOffer(a, baseUrl);
  if (offer) jsonld.offers = offer;
  return jsonld;
}

/**
 * The prerendered body for an artwork detail page.
 *
 * Mirrors the markup /blog and /artworks inject — a plain <article> with inline styles,
 * placed inside #root — so a first-wave crawler reads the painting rather than an empty
 * shell, and React replaces it on hydration.
 */
/**
 * Intrinsic pixel size of the primary image, when it could be MEASURED.
 *
 * Optional, and omitted rather than guessed: a wrong width/height reserves the wrong box and
 * the layout shifts anyway, only with confidence. The server measures the bytes and passes
 * the result; callers that cannot measure pass nothing and the attributes are absent.
 */
export interface SsrImageSize {
  width: number;
  height: number;
}

export function renderArtworkHtml(a: SsrArtwork, baseUrl: string, imageSize?: SsrImageSize | null): string {
  const e = escapeHtml;
  const fact = artworkFactLine(a);
  const image = artworkImageUrl(a, baseUrl);
  // The alt text describes the picture in the terms the row states — the title, what it is
  // painted in, and whose work it is. It is never the page title repeated verbatim.
  const alt = [a.title, a.medium ? `${a.medium} painting` : "painting", "by Ani Muradyan"]
    .filter(Boolean)
    .join(" — ");
  // Present only when real. `width`/`height` give the browser an aspect to reserve space
  // with and tell Google the shape of the picture; the CSS above still governs how it is
  // actually laid out, so adding them changes no visual result.
  const sizeAttrs = imageSize ? ` width="${imageSize.width}" height="${imageSize.height}"` : "";
  // The public price a buyer can actually pay — website retail where direct sale is on, else the
  // marketplace figure — shown only while the work is on sale, so a sold page states no price.
  const priceShown = a.availability !== "sold" ? formatArtworkPrice(artworkPublicPrice(a)) : null;
  const priceLine = priceShown
    ? `<p style="font-size:1.05rem;color:#0f172a;margin-bottom:0.25rem"><strong>${e(priceShown)}</strong></p>`
    : "";

  return (
    `<article id="artwork-ssr" style="padding:3rem 1.5rem;max-width:760px;margin:0 auto;font-family:system-ui,sans-serif">` +
    `<img src="${e(image)}" alt="${e(alt)}"${sizeAttrs}` +
    ` style="width:100%;height:auto;border-radius:12px;margin-bottom:2rem" />` +
    `<h1 style="font-size:2.4rem;font-weight:700;color:#0f172a;margin-bottom:0.5rem">${e(a.title)}</h1>` +
    (fact ? `<p style="color:#64748b;font-size:1rem;margin-bottom:1.5rem">${e(fact)}</p>` : "") +
    `<p style="font-size:1.1rem;line-height:1.75;color:#334155;margin-bottom:1.5rem">${e(artworkNarrative(a))}</p>` +
    priceLine +
    `<p style="color:#475569;margin-bottom:2rem">${e(artworkAvailabilityLine(a))}</p>` +
    `<p><a href="/artworks" style="color:#1d4ed8;text-decoration:underline">See all original paintings</a>` +
    // A landscape work links to the collection it belongs to (same isLandscape predicate the
    // collection uses to include it) — symmetric internal linking that strengthens the
    // "contemporary landscape paintings" collection page. Only when the work genuinely qualifies.
    (isLandscape({ title: a.title, description: a.description }) ?
      ` · <a href="/collections/landscape-paintings" style="color:#1d4ed8;text-decoration:underline">Contemporary Landscape Paintings</a>` : "") +
    ` · <a href="/about" style="color:#1d4ed8;text-decoration:underline">About Ani Muradyan</a></p>` +
    `</article>`
  );
}

/**
 * The image addresses an artwork declares to a crawler, in slot order.
 *
 * ONE IMPLEMENTATION, because a sitemap that disagrees with the page about which images
 * exist is worse than either version alone. routes.ts builds the XML around this; nothing
 * else decides the rule.
 *
 * A stored (`data:`) image is represented by the route that actually serves its bytes.
 * Skipping those declared nothing for every self-hosted work — 38 images across 14 artworks
 * in production, announced nowhere.
 */
export function artworkSitemapImageLocs(
  artworkId: number,
  images: (string | null | undefined)[] | null | undefined,
  baseUrl: string,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  (images ?? []).forEach((imgSrc, imgIdx) => {
    if (typeof imgSrc !== "string" || !imgSrc) return;
    const url = imgSrc.startsWith("data:")
      ? `${baseUrl}/img/artwork/${artworkId}/${imgIdx}`
      : imgSrc.startsWith("http")
        ? imgSrc
        : `${baseUrl}${imgSrc}`;
    // One entry per address: two slots holding the same file would otherwise declare the
    // same image twice under a single page.
    if (seen.has(url)) return;
    seen.add(url);
    out.push(url);
  });
  return out;
}
