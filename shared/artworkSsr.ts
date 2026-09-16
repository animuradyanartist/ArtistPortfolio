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
import { isPurchasableArtwork } from "./commerce/purchasable";
import { estimateShipping, shippingMinorInCurrency, type ShippableArtwork } from "./commerce/shipping";
import { MERCHANT_ORIGINAL_SHIP_COUNTRIES } from "./commerce/merchantOriginals";

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
  // Purchasability + shipping inputs, so the server-rendered Offer for a genuinely purchasable
  // original can carry the SAME merchant-completeness data (shipping + return policy) the print
  // Offer and the Merchant feed already carry. All optional and read through the ONE authoritative
  // gate/estimator below, so a missing field fails closed (the work is treated as not purchasable
  // here rather than advertised as buyable). Column names match the artwork row the SSR route passes.
  shippingEnabled?: boolean | null;
  reservedUntil?: Date | string | null;
  hasCommitment?: boolean | null;
  commitmentUntil?: string | null;
  shippingOverrideMinor?: number | null;
  // The artwork row stores this as a JSON TEXT column (string); tests pass an already-parsed object.
  // Accept both and normalise in shippableOfArtwork, so the raw row is assignable here.
  shippingDestinationOverrides?: Record<string, number> | string | null;
  packedDepthCm?: number | null;
  packingMarginCm?: number | null;
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

/** The one-line availability statement, in the words the meta description already uses.
 *  A genuinely purchasable direct-sale original states that it CAN be bought online — the same fact
 *  the client checkout, the Offer and the Merchant feed assert — so a crawl of the server HTML no
 *  longer reads "inquire to acquire" on a work that is actually for sale. Enquiry-only and sold
 *  works are unchanged. */
export function artworkAvailabilityLine(a: SsrArtwork): string {
  if (a.availability === "sold") return "This original work is in a private collection.";
  if (isDirectSalePurchasableOriginal(a)) {
    return "Original painting available to buy online — shipping is calculated at checkout.";
  }
  return "Original painting available — inquire to acquire.";
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

// ── ORIGINAL-ART MERCHANT PARITY ─────────────────────────────────────────────────────────────────
//
// Prints already emit a Product Offer with OfferShippingDetails + MerchantReturnPolicy so Google
// Merchant reads the server HTML as a complete, shoppable listing (see shared/printSsr.ts). A
// genuinely purchasable ORIGINAL was emitting a VisualArtwork with a bare Offer and an "inquire"
// body, so Merchant read its landing page as not-for-sale. The helpers below give an original the
// SAME merchant-completeness — reusing the ONE authoritative purchasability gate, the ONE shipping
// estimator, and the SAME launch countries the Merchant feed uses, so feed ↔ SSR ↔ checkout agree.
// Nothing is invented: the shipping figure is the estimator's own quote (the checkout charge) and
// the return terms are the /returns "Original paintings" policy.

/** Normalise the per-destination shipping overrides — the row stores JSON text, tests pass an object.
 *  Mirrors server/commerce/pricing.ts `parseDestinationOverrides` (kept in step): only 2-letter
 *  country keys mapping to positive integer minor amounts survive, so a malformed value is ignored. */
function normaliseDestinationOverrides(
  raw: Record<string, number> | string | null | undefined,
): Record<string, number> | null {
  if (!raw) return null;
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try { parsed = JSON.parse(raw); } catch { return null; }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (/^[A-Za-z]{2}$/.test(k) && typeof v === "number" && Number.isInteger(v) && v > 0) {
      out[k.toUpperCase()] = v;
    }
  }
  return Object.keys(out).length ? out : null;
}

/** Map an SsrArtwork to the ShippableArtwork the estimator needs (row column names already match). */
function shippableOfArtwork(a: SsrArtwork): ShippableArtwork {
  return {
    id: a.id,
    title: a.title,
    dimensions: a.dimensions ?? null,
    shippingEnabled: !!a.shippingEnabled,
    shippingOverrideMinor: a.shippingOverrideMinor ?? null,
    shippingDestinationOverrides: normaliseDestinationOverrides(a.shippingDestinationOverrides),
    packedDepthCm: a.packedDepthCm ?? null,
    packingMarginCm: a.packingMarginCm ?? null,
  };
}

/**
 * Is this a direct-sale original a buyer can actually purchase online right now? Decided by the ONE
 * canonical `isPurchasableArtwork` gate the feed, cart and Stripe checkout use (direct sale on, a
 * positive website price + currency, availability exactly "available", not reserved, not committed,
 * shipping enabled). A missing field fails closed. This is what upgrades the SSR to a shoppable
 * Product/Offer + a "buy online" body — never a work the checkout would refuse.
 */
export function isDirectSalePurchasableOriginal(a: SsrArtwork): boolean {
  if (!a.directSaleEnabled) return false;
  return isPurchasableArtwork({
    id: a.id,
    availability: a.availability ?? "",
    directSaleEnabled: !!a.directSaleEnabled,
    websitePriceMinor: a.websitePriceMinor ?? null,
    websiteCurrency: a.websiteCurrency ?? null,
    shippingEnabled: !!a.shippingEnabled,
    reservedUntil: a.reservedUntil ?? null,
    hasCommitment: a.hasCommitment ?? null,
    commitmentUntil: a.commitmentUntil ?? null,
  });
}

/** MerchantReturnPolicy for an original — the /returns "Original paintings" terms: a 14-day return
 *  window in the launch markets; for a change-of-mind return the buyer arranges and pays the return
 *  shipping (a damaged/defective work is put right at no cost, handled directly). Not invented. */
function originalReturnPolicy(): Record<string, unknown> {
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: [...MERCHANT_ORIGINAL_SHIP_COUNTRIES],
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: 14,
    returnMethod: "https://schema.org/ReturnByMail",
    returnFees: "https://schema.org/ReturnShippingFees",
  };
}

/**
 * OfferShippingDetails for an original, one per launch country that the authoritative estimator can
 * quote — the SAME per-country figure the Merchant feed advertises and checkout charges (converted
 * from the EUR estimator into the work's own currency by `shippingMinorInCurrency`, exactly as the
 * feed does). A country the estimator refuses (e.g. freight-only) is simply omitted; never a guess.
 */
export function originalShippingDetails(a: SsrArtwork): Record<string, unknown>[] {
  const currency = a.websiteCurrency || "USD";
  const shippable = shippableOfArtwork(a);
  const out: Record<string, unknown>[] = [];
  for (const country of MERCHANT_ORIGINAL_SHIP_COUNTRIES) {
    const q = estimateShipping(shippable, country);
    if (!q.ok) continue;
    out.push({
      "@type": "OfferShippingDetails",
      shippingRate: {
        "@type": "MonetaryAmount",
        value: (shippingMinorInCurrency(q.amountMinor, currency) / 100).toFixed(2),
        currency,
      },
      shippingDestination: { "@type": "DefinedRegion", addressCountry: country },
    });
  }
  return out;
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
    const offer: Record<string, unknown> = {
      "@type": "Offer",
      price: websiteMinor / 100,
      priceCurrency: a.websiteCurrency || "USD",
      availability: "https://schema.org/InStock",
      url,
    };
    // Merchant-listing completeness — added ONLY for a genuinely purchasable original: a seller, the
    // originals return policy, and the SAME per-country shipping the feed + checkout use. Price,
    // currency, availability and url are unchanged; nothing here is invented.
    if (isDirectSalePurchasableOriginal(a)) {
      offer.seller = { "@type": "Person", "@id": `${baseUrl.replace(/\/+$/, "")}/#person`, name: "Ani Muradyan" };
      offer.hasMerchantReturnPolicy = originalReturnPolicy();
      const shipping = originalShippingDetails(a);
      if (shipping.length) offer.shippingDetails = shipping;
    }
    return offer;
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

  // A genuinely purchasable original is ALSO a Product, so Google Merchant reads the landing page
  // as a shoppable listing (parity with prints). Multi-typed so the art semantics (artMedium,
  // artform, dimensions) are kept while the Product type + brand + condition are added — exactly
  // the fields the feed states (brand "Ani Muradyan", condition new). Non-purchasable works are
  // left as a plain VisualArtwork, unchanged.
  if (isDirectSalePurchasableOriginal(a)) {
    jsonld["@type"] = ["VisualArtwork", "Product"];
    jsonld.brand = { "@type": "Brand", name: "Ani Muradyan" };
    jsonld.itemCondition = "https://schema.org/NewCondition";
  }
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

export function renderArtworkHtml(
  a: SsrArtwork,
  baseUrl: string,
  imageSize?: SsrImageSize | null,
  // The slug of a genuinely purchasable fine-art print OF this painting, or null. Passed by the
  // server from `purchasablePrintSlugForArtwork` (the same gate the client's cross-link uses), so
  // the original→print relation is factual and deterministic. When set, a crawlable link is added —
  // completing the internal graph on the ORIGINAL side, where until now only the print PDP linked
  // back. Non-JS crawlers and text-extracting AI never ran the client component that renders it.
  relatedPrintSlug?: string | null,
): string {
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
    // Original → print. Only when a real, purchasable print exists; the original stays the premium,
    // one-of-a-kind work, so the wording keeps that line clear (it does not call the print the work).
    (relatedPrintSlug
      ? `<p><a href="/prints/${e(relatedPrintSlug)}" style="color:#1d4ed8;text-decoration:underline">Available as a fine-art print</a></p>`
      : "") +
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
