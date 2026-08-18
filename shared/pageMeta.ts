/**
 * Page titles that BOTH the server and the client must agree on.
 *
 * The server injects a title per route (server/routes.ts PAGE_META) and the React page then
 * sets `document.title` on mount. When those two strings differ, the second one wins in the
 * rendered DOM — which is the version Google indexes — so a title carefully chosen on the
 * server was being quietly replaced on render. /artworks served
 * "Original Oil Paintings for Sale — Ani Muradyan" and rendered
 * "Original Paintings by Ani Muradyan | Oil Paintings for Sale".
 *
 * One constant, imported by both, so the served and rendered titles cannot drift again.
 */
export const ARTWORKS_TITLE = "Original Oil Paintings for Sale — Ani Muradyan";
