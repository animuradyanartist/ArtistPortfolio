/**
 * WHAT THE SITE'S NAVIGATION SHOWS — and the one entry that comes and goes.
 *
 * The Articles link is conditional, and the condition is not a preference. §1 of the
 * article brief: "Once at least one real article is published, expose the existing article
 * index in the website navigation with the user-facing label: Articles. Do not expose an
 * empty Articles section."
 *
 * That was previously honoured by hand — the /blog entry sat commented out with a note to
 * link it in the same commit as the first real piece of writing. Which works exactly once,
 * in one direction. It cannot un-link itself if she unpublishes the only article, and it
 * relies on whoever publishes remembering to ship a code change at the same moment. A nav
 * link to "Nothing published yet" advertises an empty room, and an artist's site advertising
 * an empty room is worse than one with no writing section at all.
 *
 * So the decision lives here, as a function of the published count, and the component that
 * renders it just asks. PURE — no fetch, no React — so both directions are testable without
 * a browser, which is the only way to check the disappearing case without publishing
 * something real to make a link appear.
 *
 * THE LABEL IS "Articles" because §1 names it. The route stays /blog: §1 also says to reuse
 * it "unless there is a genuine technical reason to change it. The user-facing navigation
 * label matters more than renaming working infrastructure." Renaming the route would break
 * every existing link and the sitemap for a word nobody sees.
 */

export interface NavItem {
  name: string;
  href: string;
}

/** The entries that are always present, in order. */
const ALWAYS: NavItem[] = [
  { name: "Home", href: "/" },
  { name: "Originals", href: "/artworks" },
  { name: "Prints", href: "/prints" },
  { name: "The Path", href: "/path" },
  { name: "Exhibitions", href: "/exhibitions" },
  { name: "Gallery", href: "/gallery" },
  { name: "Contact", href: "/contact" },
];

/** Where Articles sits when it is shown — after Exhibitions, before Gallery. */
const ARTICLES_AFTER = "Exhibitions";

export const ARTICLES_ITEM: NavItem = { name: "Articles", href: "/blog" };

/**
 * The navigation for a site with `publishedArticleCount` live articles.
 *
 * A count that is missing, negative or not a number is treated as zero: while the query is
 * still loading we do not yet know that anything is published, and flashing a link that
 * then vanishes is worse than showing it a moment late.
 */
export function siteNavigation(publishedArticleCount: number | null | undefined): NavItem[] {
  const count = typeof publishedArticleCount === "number" && Number.isFinite(publishedArticleCount)
    ? publishedArticleCount
    : 0;
  if (count <= 0) return [...ALWAYS];
  const out = [...ALWAYS];
  const at = out.findIndex((i) => i.name === ARTICLES_AFTER);
  out.splice(at === -1 ? out.length : at + 1, 0, ARTICLES_ITEM);
  return out;
}

/** True when the Articles entry should be visible. Kept separate for readability at call sites. */
export function showsArticles(publishedArticleCount: number | null | undefined): boolean {
  return siteNavigation(publishedArticleCount).some((i) => i.href === ARTICLES_ITEM.href);
}
