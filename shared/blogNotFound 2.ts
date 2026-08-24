/**
 * WHEN A MISSING ARTICLE SHOULD SAY SO.
 *
 * The sibling of `artworkNotFound.ts`, for the surface that fix never covered. `/artworks/x`
 * has answered 404 since the duplicate-URL work; `/blog/x` still answers 200 with the generic
 * shell and — the part that matters — a canonical tag pointing at ITSELF.
 *
 * That last detail is why this is worth closing rather than tolerating. A 200 shell alone is
 * merely thin. A 200 shell that declares each invented URL canonical makes every one of them a
 * distinct, self-endorsed, indexable page of identical content, and there are infinitely many
 * of them. Verified on 2026-08-20: /blog/definitely-not-a-real-slug and /blog/zzz-nonsense-slug
 * differ in exactly one byte-range — their canonical hrefs.
 *
 * IT ALSO SITS ON EVERY FUTURE ARTICLE'S URL. A draft is written days before it is published,
 * and its slug answers 200 the whole time. Better for that URL to be honestly absent until the
 * article exists than to spend its pre-publication life as a self-endorsed empty page.
 *
 * A DRAFT IS CORRECTLY MISSING HERE. The caller resolves through `getBlogPostBySlug`, which
 * excludes drafts unless explicitly asked for them, so an unpublished article is "not found"
 * to the public exactly as it should be — and becomes 200 the moment it is published, with no
 * change here.
 *
 * DELIBERATELY NARROW, for the same reason as the artwork rule: only paths under /blog/ are
 * judged, only after the lookup has already failed, and the collection itself is never judged.
 * The client router declares exactly two routes here — /blog and /blog/:slug — so a segment
 * that resolves to no post is genuinely nothing rather than a page this file failed to know
 * about.
 *
 * PURE, so the rule is testable without a server.
 */

/** Paths under /blog that are the collection, not an article, and must never 404 from here. */
const COLLECTION_PATHS = new Set(["/blog", "/blog/"]);

/**
 * Should this request answer 404?
 *
 * `resolved` is whether a PUBLISHED post was found for the slug. The caller has already
 * decoded the slug and stripped query and hash.
 */
export function isMissingBlogPath(pathname: string, resolved: boolean): boolean {
  if (resolved) return false;
  const path = pathname.split("?")[0]!.split("#")[0]!;
  if (COLLECTION_PATHS.has(path)) return false;
  if (!path.startsWith("/blog/")) return false;
  return path.slice("/blog/".length).length > 0;
}
