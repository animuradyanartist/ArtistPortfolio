/**
 * WHAT THE SITE'S NAVIGATION SHOWS — and where the Articles/Blog entry now lives.
 *
 * The blog is deliberately OUT of the top/main navigation (desktop and mobile). It is reached
 * from the FOOTER only. The route itself — /blog — is unchanged; only its discovery moves.
 *
 * §1 of the article brief still governs the footer link: "Once at least one real article is
 * published, expose the existing article index … Do not expose an empty Articles section."
 * So the footer link is conditional on the published count, not a hand-maintained flag. That
 * decision lives here as a pure function of the count — no fetch, no React — so both the
 * "shown" and "hidden" directions are testable without publishing something to the live site.
 *
 * THE LABEL IS "Articles" because §1 names it. The route stays /blog: §1 says to reuse it
 * "unless there is a genuine technical reason to change it. The user-facing navigation label
 * matters more than renaming working infrastructure." Renaming the route would break every
 * existing link and the sitemap for a word nobody sees.
 */

export interface NavItem {
  name: string;
  href: string;
}

/**
 * The TOP navigation, in order. Articles/Blog is intentionally NOT here — it was moved to the
 * footer. This list is the single source for both the desktop bar and the mobile drawer.
 */
const ALWAYS: NavItem[] = [
  { name: "Home", href: "/" },
  { name: "Originals", href: "/artworks" },
  { name: "Prints", href: "/prints" },
  { name: "The Path", href: "/path" },
  { name: "Exhibitions", href: "/exhibitions" },
  { name: "Gallery", href: "/gallery" },
  { name: "Contact", href: "/contact" },
];

/** The Articles/Blog entry — now rendered in the footer (never the top nav). Route unchanged. */
export const ARTICLES_ITEM: NavItem = { name: "Articles", href: "/blog" };

/**
 * The top navigation. The blog is no longer injected here regardless of the published count —
 * it lives in the footer. The optional count is kept for call-site compatibility and ignored.
 */
export function siteNavigation(_publishedArticleCount?: number | null): NavItem[] {
  return [...ALWAYS];
}

/**
 * True when the FOOTER should show the Articles/Blog link — only once at least one article is
 * published (§1: never advertise an empty Articles section). A missing, negative or non-number
 * count is treated as zero, so a link never flashes while the count is still loading.
 */
export function showsArticles(publishedArticleCount: number | null | undefined): boolean {
  const count = typeof publishedArticleCount === "number" && Number.isFinite(publishedArticleCount)
    ? publishedArticleCount
    : 0;
  return count > 0;
}
