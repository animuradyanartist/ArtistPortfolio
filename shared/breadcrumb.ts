/**
 * BreadcrumbList JSON-LD — a small, pure builder used by the server SSR to give product/detail pages
 * a crawlable breadcrumb trail (Home → section → this page). Google uses it for the breadcrumb rich
 * result and for understanding site structure; AI systems use it to place a page in context. The
 * page URLs must be the real canonical URLs already served by the site.
 */

export interface BreadcrumbItem {
  name: string;
  url: string;
}

/** Build the BreadcrumbList JSON-LD object from an ordered list of {name, url}. */
export function breadcrumbList(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

/** The ready-to-inject `<script>` tag (id="breadcrumb-jsonld"). Returns "" for an empty trail. */
export function breadcrumbJsonLdScript(items: BreadcrumbItem[]): string {
  if (!items.length) return "";
  const json = JSON.stringify(breadcrumbList(items)).replace(/</g, "\\u003c");
  return `<script type="application/ld+json" id="breadcrumb-jsonld">${json}</script>`;
}

/** Inject a breadcrumb `<script>` before </head>. No-op when items is empty. */
export function injectBreadcrumb(html: string, items: BreadcrumbItem[]): string {
  const tag = breadcrumbJsonLdScript(items);
  if (!tag) return html;
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `  ${tag}\n</head>`) : html;
}
