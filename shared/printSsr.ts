/**
 * PRINT SSR — the server-rendered <head> meta, Product JSON-LD and prerendered body for a print
 * PDP. Mirrors artworkSsr.ts, but a print is a `Product` with an `Offer`, not a `VisualArtwork`.
 *
 * THE OFFER IS HONEST. A price + `InStock` availability appears ONLY when the print is genuinely
 * purchasable (a ready master, an eligible+enabled+priced variant). An unready print carries no
 * Offer and is served `noindex`, so a page that cannot be bought is never advertised as buyable
 * and never enters the index. Own-site print price only — never a marketplace/original price.
 *
 * Pure + unit-tested; the production route calls `injectPrintMeta` and (optionally) `renderPrintHtml`.
 */

import { printCanonicalUrl } from "./commerce/printProduct";

export interface PrintSsrDetail {
  id: number;
  slug: string;
  title: string;
  description: string;
  image: string | null;
  artworkId: number | null;
  purchasable: boolean;
  startingPriceMinor: number | null;
  currency: string;
}

export const PRINT_BRAND = "Ani Muradyan";

export function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printImageUrl(d: PrintSsrDetail, baseUrl: string): string {
  const img = d.image ?? "";
  if (!img) return "";
  if (/^https?:\/\//i.test(img)) return img;
  return `${baseUrl.replace(/\/+$/, "")}${img.startsWith("/") ? "" : "/"}${img}`;
}

export function printMetaTitle(d: PrintSsrDetail): string {
  return `${d.title} — Fine-Art Print · ${PRINT_BRAND}`;
}

export function printMetaDescription(d: PrintSsrDetail): string {
  return `Museum-quality giclée fine-art print of "${d.title}" by ${PRINT_BRAND} on archival Hahnemühle paper. Open edition. The original painting remains unique.`;
}

/**
 * Product JSON-LD. An `offers` node is present ONLY when the print is purchasable AND priced — a
 * provisional/unready print is a Product with no offer, so it is never claimed to be for sale.
 */
export function printJsonLd(d: PrintSsrDetail, baseUrl: string): Record<string, unknown> {
  const url = printCanonicalUrl(baseUrl, d.slug);
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${d.title} — Fine-Art Print`,
    description: printMetaDescription(d),
    brand: { "@type": "Brand", name: PRINT_BRAND },
    category: "Fine-Art Prints",
    url,
  };
  const image = printImageUrl(d, baseUrl);
  if (image) node.image = image;

  if (d.purchasable && d.startingPriceMinor != null && d.startingPriceMinor > 0) {
    node.offers = {
      "@type": "Offer",
      priceCurrency: d.currency,
      price: (d.startingPriceMinor / 100).toFixed(2),
      availability: "https://schema.org/InStock",
      url,
      seller: { "@type": "Person", name: PRINT_BRAND },
    };
  }
  return node;
}

/** Whether this print may be indexed: only a genuinely purchasable one. */
export function printIsIndexable(d: PrintSsrDetail): boolean {
  return d.purchasable && d.startingPriceMinor != null && d.startingPriceMinor > 0;
}

/** A small server-rendered body for crawlers/no-JS — mirrors renderArtworkHtml. */
export function renderPrintHtml(d: PrintSsrDetail, baseUrl: string): string {
  const image = printImageUrl(d, baseUrl);
  const priceLine =
    printIsIndexable(d)
      ? `<p>From ${escapeHtml(d.currency)} ${(d.startingPriceMinor! / 100).toFixed(2)}</p>`
      : `<p>Coming soon.</p>`;
  const originalLink =
    d.artworkId != null
      ? `<p><a href="${escapeHtml(baseUrl.replace(/\/+$/, ""))}/artworks/${d.artworkId}">View the original painting</a></p>`
      : "";
  return [
    `<article>`,
    `<h1>${escapeHtml(d.title)} — Fine-Art Print</h1>`,
    image ? `<img src="${escapeHtml(image)}" alt="Fine-art print of ${escapeHtml(d.title)}" />` : "",
    `<p>${escapeHtml(printMetaDescription(d))}</p>`,
    priceLine,
    originalLink,
    `</article>`,
  ].filter(Boolean).join("\n");
}

/**
 * Inject a print PDP's meta into the SPA shell: title, description, canonical, og/twitter, a
 * Product JSON-LD, and a robots directive. A non-indexable print gets `noindex`, so unready or
 * unknown prints are never advertised or indexed.
 */
export function injectPrintMeta(html: string, d: PrintSsrDetail, baseUrl: string): string {
  const title = escapeHtml(printMetaTitle(d));
  const desc = escapeHtml(printMetaDescription(d));
  const canonical = printCanonicalUrl(baseUrl, d.slug);
  const image = printImageUrl(d, baseUrl);
  const indexable = printIsIndexable(d);

  let out = html;
  out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);

  const setMeta = (attr: "name" | "property", key: string, content: string) => {
    const re = new RegExp(`<meta\\s+${attr}=["']${key}["'][^>]*>`, "i");
    const tag = `<meta ${attr}="${key}" content="${content}">`;
    if (re.test(out)) out = out.replace(re, tag);
    else out = out.replace(/<\/head>/i, `  ${tag}\n</head>`);
  };

  setMeta("name", "description", desc);
  setMeta("property", "og:title", title);
  setMeta("property", "og:description", desc);
  setMeta("property", "og:url", escapeHtml(canonical));
  setMeta("property", "og:type", "product");
  setMeta("name", "twitter:title", title);
  setMeta("name", "twitter:description", desc);
  if (image) {
    setMeta("property", "og:image", escapeHtml(image));
    setMeta("name", "twitter:image", escapeHtml(image));
  }
  setMeta("name", "robots", indexable ? "index,follow" : "noindex,follow");

  // canonical link
  const canonicalTag = `<link rel="canonical" href="${escapeHtml(canonical)}">`;
  if (/<link\s+rel=["']canonical["'][^>]*>/i.test(out)) {
    out = out.replace(/<link\s+rel=["']canonical["'][^>]*>/i, canonicalTag);
  } else {
    out = out.replace(/<\/head>/i, `  ${canonicalTag}\n</head>`);
  }

  const jsonStr = JSON.stringify(printJsonLd(d, baseUrl)).replace(/</g, "\\u003c");
  out = out.replace(/<\/head>/i, `  <script type="application/ld+json" id="print-jsonld">${jsonStr}</script>\n</head>`);

  return out;
}
