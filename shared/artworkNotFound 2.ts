/**
 * WHEN A MISSING PAINTING SHOULD SAY SO.
 *
 * The SPA shell answers every unmatched path with 200. For most routes that is correct — the
 * client router resolves them. For /artworks/<something-that-is-not-a-painting> it is a soft
 * 404: a page that reports success, renders a generic shell, and declares itself canonical.
 * Google treats those as low quality, and after the duplicate-URL fix the surface grew rather
 * than shrank — /artworks/total-nonsense-40 stopped being a duplicate of Blue Drift and became
 * one of these instead.
 *
 * DELIBERATELY NARROW. Only paths under /artworks/ are judged here, and only after the
 * resolver has already failed to find a work. A canonical URL, a legacy marketplace slug, a
 * case variant and a bare id all resolve or redirect long before this is consulted, so none of
 * them can reach it. Everything outside /artworks/ is left to the client router, because a
 * server that guesses which SPA routes exist will eventually 404 a real page.
 *
 * PURE, so the rule is testable without a server.
 */

/** Paths under /artworks that are NOT an individual work and must never 404 from here. */
const COLLECTION_PATHS = new Set(["/artworks", "/artworks/"]);

/**
 * Should this request answer 404?
 *
 * `resolved` is whether the artwork resolver found a work for the path. The caller has
 * already run redirects, so a `false` here means genuinely nothing.
 */
export function isMissingArtworkPath(pathname: string, resolved: boolean): boolean {
  if (resolved) return false;
  const path = pathname.split("?")[0]!.split("#")[0]!;
  if (COLLECTION_PATHS.has(path)) return false;
  if (!path.startsWith("/artworks/")) return false;
  // "/artworks/" with nothing after it is the collection, handled above; anything with a
  // segment is a claim about a specific painting.
  return path.slice("/artworks/".length).length > 0;
}
