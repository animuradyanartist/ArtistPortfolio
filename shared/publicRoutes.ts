/**
 * WHICH URLS ARE REAL PAGES — AND WHAT AN HONEST NOT-FOUND LOOKS LIKE.
 *
 * The SPA fallback (`app.get('*')` in server/routes.ts) had no idea which paths were real. Its
 * job was "serve index.html and let the client router sort it out", so ANY path that reached it
 * got 200, a self-canonical claiming the URL was legitimate, and `index, follow` — on an empty
 * body. Only the `/artworks/` family ever contradicted that, via isMissingArtworkPath.
 *
 * So /completely-made-up-page, /about/sub/page, /gallery/x and every other string a crawler
 * cares to try answered 200 and invited indexing. That is an UNBOUNDED soft-404 surface: not a
 * handful of thin pages but an infinite family of them, each self-canonical, each claiming to
 * be a page. It is the same defect /prints had, without the boundary /prints at least had.
 *
 * ── WHAT THIS MODULE DOES AND DELIBERATELY DOES NOT DO ────────────────────────────────────
 *
 * It answers ONE question by SHAPE: is this path one the application actually routes? The list
 * below mirrors client/src/App.tsx, because the client router is the definition of what pages
 * exist and two lists that disagree would be worse than one list that is occasionally stale.
 *
 * It does NOT answer "does the data behind this path exist" — that is a database question, and
 * conflating the two is how a valid page becomes a 404 during a slow query. A path whose SHAPE
 * is unknown is not a page. A path whose shape is known but whose row is missing is decided by
 * the existing isMissingArtworkPath / isMissingBlogPath rules, which this does not touch.
 *
 * A BARE SINGLE SEGMENT IS THE INTERESTING CASE. `/:seoSlug` in App.tsx means /some-slug can be
 * a real artwork address, so shape alone cannot rule it out — and cannot rule it IN either, or
 * every typo stays a 200. It is therefore deliberately NOT a known shape here: the caller
 * resolves it against the artwork table first and only asks this module when that came back
 * empty. Data decides; shape is the backstop.
 */

/** Exact paths that are real pages. Mirrors the non-parameterised routes in App.tsx. */
const EXACT_ROUTES: ReadonlySet<string> = new Set([
  "/",
  "/artworks",
  "/about",
  "/path",
  "/exhibitions",
  "/gallery",
  "/contact",
  "/blog",
  // Direct sales. Public, deliberately not indexed, and they must keep working.
  "/cart",
  "/checkout",
  // Admin. Disallowed in robots.txt, never indexed — but it is a real page and 404ing the
  // owner out of her own site would be a far worse bug than the one this fixes.
  "/admin",
  "/admin/create-artwork",
  "/admin/create-print",
  "/admin/orders",
]);

/** Families with one dynamic segment. Anchored, and `[^/]+` so they cannot match deeper. */
const DYNAMIC_ROUTES: readonly RegExp[] = [
  /^\/artworks\/[^/]+$/,
  /^\/collections\/[^/]+$/,
  /^\/blog\/[^/]+$/,
  // Redirected to / by a route registered before the catch-all, so these never reach it.
  // Listed anyway so this stays a complete statement of what the app routes.
  /^\/prints(?:\/[^/]+)?$/,
  /^\/order\/[^/]+$/,
  /^\/admin\/edit-artwork\/[^/]+$/,
  /^\/admin\/edit-print\/[^/]+$/,
  /^\/admin\/orders\/[^/]+$/,
];

/** One trailing slash is the same page; anything else is compared as written. */
function normalise(pathname: string): string {
  const p = pathname.split("?")[0]!.split("#")[0]!;
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

/**
 * Does the application route this path at all?
 *
 * FALSE for a bare single segment even when it turns out to be a real artwork slug — see the
 * note above. Callers resolve those against the data before consulting this.
 */
export function isKnownRouteShape(pathname: string): boolean {
  const p = normalise(pathname);
  if (EXACT_ROUTES.has(p)) return true;
  return DYNAMIC_ROUTES.some((re) => re.test(p));
}

/** A single segment, which `/:seoSlug` means MIGHT be an artwork address. */
export function isBareSlug(pathname: string): boolean {
  const p = normalise(pathname);
  return p !== "/" && /^\/[^/]+$/.test(p);
}

/**
 * Make a 404 body tell the truth about itself.
 *
 * A not-found response was still carrying `index, follow` and a canonical pointing at the URL
 * that does not exist — the page asserting its own legitimacy in the two places a crawler
 * actually reads. The status line said 404 and every tag inside argued with it.
 *
 * `follow` is kept: the shell's navigation is real, and a crawler that lands on a mistyped URL
 * should still be able to walk back into the site.
 */
export function markNotFoundHtml(html: string): string {
  let out = html;
  out = /<meta\s+name="robots"[^>]*>/i.test(out)
    ? out.replace(/<meta\s+name="robots"[^>]*>/i, '<meta name="robots" content="noindex, follow">')
    : out.replace("</head>", '  <meta name="robots" content="noindex, follow">\n</head>');
  // Not rewritten to something else — removed. There is no canonical URL for a page that
  // does not exist, and naming one would be the same lie in a different tag.
  out = out.replace(/\s*<link\s+rel="canonical"[^>]*>/i, "");
  return out;
}
