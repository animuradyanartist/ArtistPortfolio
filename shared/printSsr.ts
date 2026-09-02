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
  // Front-load the work's OWN subject (its real description's first sentence) so the SERP snippet
  // states what the piece depicts — e.g. a blue coastal seascape — instead of a generic boilerplate
  // that reads the same for every print. Falls back to the plain framing when there is no description.
  const lead = firstSentence(d.description);
  const framing = `Giclée fine-art print of "${d.title}" by ${PRINT_BRAND} on archival Hahnemühle paper — open edition; the original painting remains unique.`;
  return lead ? `${lead} ${framing}` : `Museum-quality ${framing}`;
}

/** The first sentence of a description, whitespace-collapsed and capped so a meta stays sane. */
function firstSentence(text: string | null | undefined): string {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const m = t.match(/^.*?[.!?](?=\s|$)/);
  let s = (m ? m[0] : t).trim();
  if (s.length > 160) s = s.slice(0, 157).replace(/\s+\S*$/, "") + "…";
  return s;
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
      seller: { "@type": "Person", "@id": `${baseUrl.replace(/\/+$/, "")}/#person`, name: PRINT_BRAND },
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

/** The public print-shop listing card the /prints index SEO needs (title + slug). */
export interface PrintIndexCard {
  title: string;
  slug: string;
}

export const PRINTS_INDEX_TITLE =
  "Fine Art Prints & Canvas Prints of Contemporary Paintings | Ani Muradyan";
export const PRINTS_INDEX_DESCRIPTION =
  "Museum-quality giclée fine art prints and canvas prints of Ani Muradyan's contemporary oil paintings — landscapes and seascapes on archival Hahnemühle paper or stretched canvas, printed to order. Each original remains a unique work.";

/**
 * Give the /prints LISTING its own SEO instead of inheriting the homepage <title>/meta. Sets the
 * prints title/description/OG/twitter/canonical, injects a crawlable heading + print links (removed
 * client-side once the React grid mounts), a CollectionPage + ItemList JSON-LD, and robots
 * index,follow. Call ONLY when there is at least one purchasable print. Pure string work, so it is
 * unit-tested directly. `cards` are the purchasable prints, in display order.
 */
export function injectPrintsIndexMeta(html: string, cards: PrintIndexCard[], baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const url = `${base}/prints`;
  const title = PRINTS_INDEX_TITLE;
  const desc = PRINTS_INDEX_DESCRIPTION;

  let out = html;
  out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);

  const setMeta = (attr: "name" | "property", key: string, content: string) => {
    const re = new RegExp(`<meta\\s+${attr}=["']${key}["'][^>]*>`, "i");
    const tag = `<meta ${attr}="${key}" content="${escapeHtml(content)}">`;
    if (re.test(out)) out = out.replace(re, tag);
    else out = out.replace(/<\/head>/i, `  ${tag}\n</head>`);
  };
  setMeta("name", "title", title);
  setMeta("name", "description", desc);
  setMeta("property", "og:title", title);
  setMeta("property", "og:description", desc);
  setMeta("property", "og:url", url);
  setMeta("name", "twitter:title", title);
  setMeta("name", "twitter:description", desc);
  setMeta("name", "robots", "index,follow");

  const canonicalTag = `<link rel="canonical" href="${escapeHtml(url)}">`;
  out = /<link\s+rel=["']canonical["'][^>]*>/i.test(out)
    ? out.replace(/<link\s+rel=["']canonical["'][^>]*>/i, canonicalTag)
    : out.replace(/<\/head>/i, `  ${canonicalTag}\n</head>`);

  const items = cards
    .map((c) => {
      const href = printCanonicalUrl(baseUrl, c.slug);
      return `<li style="margin-bottom:0.5rem"><a href="${escapeHtml(href)}" style="color:#1d4ed8;text-decoration:underline">${escapeHtml(c.title)} — fine-art print</a></li>`;
    })
    .join("");
  const ssr =
    `<section id="prints-ssr" style="padding:3rem 1.5rem;max-width:1200px;margin:0 auto;font-family:system-ui,sans-serif">` +
    `<h1 style="font-size:2.5rem;font-weight:700;color:#0f172a;margin-bottom:1rem">Fine Art Prints</h1>` +
    `<p style="font-size:1.1rem;color:#475569;margin-bottom:1.5rem">Museum-quality giclée fine-art prints and canvas prints of contemporary oil paintings and landscapes by Armenian artist Ani Muradyan — printed to order on archival Hahnemühle paper or stretched canvas. The original paintings remain unique works — <a href="${escapeHtml(base)}/artworks" style="color:#1d4ed8;text-decoration:underline">browse the originals</a>.</p>` +
    `<ul style="list-style:disc;padding-left:1.5rem;color:#334155">${items}</ul>` +
    `</section>`;
  out = out.replace('<div id="root">', ssr + '<div id="root">');

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Fine Art Prints by Ani Muradyan",
    description: desc,
    url,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: cards.length,
      itemListElement: cards.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: printCanonicalUrl(baseUrl, c.slug),
        name: `${c.title} — Fine-Art Print`,
      })),
    },
  };
  const jsonStr = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
  out = out.replace(/<\/head>/i, `  <script type="application/ld+json" id="prints-collection-jsonld">${jsonStr}</script>\n</head>`);

  return out;
}
