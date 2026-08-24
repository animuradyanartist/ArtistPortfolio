/**
 * WHAT A CRAWLER, AN AI ASSISTANT, AND A PERSON WITH JS OFF READ ON A COLLECTION PAGE.
 *
 * Prerendered INSIDE #root (see the note in server/routes.ts for why in front of it is a bug),
 * so React's first client render replaces it and nothing is duplicated after mount. The body
 * is real: an <h1> a buyer would search, one paragraph of honest copy, and the actual available
 * works with their images, media, size, price and a link to buy — the same rows /api/artworks
 * serves. No copy is written for crawlers; a collection with no members renders an honest empty
 * state rather than an invented one.
 *
 * PURE, so the exact bytes are asserted in tests without a server — including the branch that
 * emits <img> and structured data, which the local sample store cannot always exercise.
 */
import type { CollectionDef } from "./collections";

export interface CollectionRenderWork {
  title: string;
  href: string;            // canonical artwork path
  image: string;           // primary image ref (/img/artwork/:id/0), already refified
  medium: string;
  dimensions: string;
  availability: string;
  priceLabel: string | null;
}

const esc = (t: unknown): string =>
  String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const WRAP = "padding:3rem 1.5rem;max-width:1200px;margin:0 auto;font-family:system-ui,sans-serif";
const H1 = "font-size:2.5rem;font-weight:700;color:#0f172a;margin-bottom:1rem";
const LEAD = "font-size:1.1rem;line-height:1.7;color:#475569;margin-bottom:2rem;max-width:720px";
const GRID = "display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:2rem;list-style:none;padding:0";
const NAME = "font-weight:600;color:#0f172a";
const META = "color:#64748b;font-size:0.9rem";
const LINK = "color:#1d4ed8;text-decoration:underline";

/** The visible, crawlable collection markup. */
export function renderCollectionHtml(def: CollectionDef, works: readonly CollectionRenderWork[]): string {
  const available = works.filter((w) => w.availability === "available");
  return (
    `<section id="collection-ssr" style="${WRAP}">` +
    `<h1 style="${H1}">${esc(def.heading)}</h1>` +
    `<p style="${LEAD}">${esc(def.intro)}</p>` +
    (works.length
      ? `<p style="${META}">${available.length} available of ${works.length} works in this collection.</p>` +
        `<ul style="${GRID}">` +
        works.map((w) =>
          `<li>` +
          `<a href="${esc(w.href)}" style="text-decoration:none;color:inherit">` +
          `<img src="${esc(w.image)}" alt="${esc(w.title)} — ${esc(w.medium)} by Ani Muradyan" loading="lazy" style="width:100%;height:auto;border-radius:8px;margin-bottom:0.5rem" />` +
          `<span style="${NAME}">${esc(w.title)}</span>` +
          `</a>` +
          `<div style="${META}">${esc(w.medium)} · ${esc(w.dimensions)}` +
          `${w.availability === "available"
            ? w.priceLabel ? ` · ${esc(w.priceLabel)}` : ""
            : " · In a private collection"}</div>` +
          `</li>`).join("") +
        `</ul>` +
        `<p style="margin-top:2rem"><a href="/artworks" style="${LINK}">See all original paintings</a> · ` +
        `<a href="/contact" style="${LINK}">Enquire about a work</a></p>`
      : `<p style="${LEAD}">Works in this collection are coming soon. ` +
        `<a href="/artworks" style="${LINK}">See all original paintings.</a></p>`) +
    `</section>`
  );
}

/**
 * CollectionPage + ItemList structured data, so an artwork's place in a saleable collection is
 * a fact a search engine and an AI assistant can read, not a layout a human has to infer.
 */
export function collectionJsonLd(
  def: CollectionDef,
  works: readonly CollectionRenderWork[],
  baseUrl: string,
): string {
  const url = `${baseUrl}/collections/${def.slug}`;
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: def.heading,
    description: def.metaDescription,
    url,
    isPartOf: { "@type": "WebSite", name: "Ani Muradyan", url: baseUrl },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: works.length,
      itemListElement: works.map((w, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: w.href.startsWith("http") ? w.href : `${baseUrl}${w.href}`,
        name: w.title,
      })),
    },
  };
  return `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/<\/script>/gi, "<\\/script>")}</script>`;
}
