// Canonical artwork URL derivation — the single source of truth for the
// canonical URL of an artwork detail page.
//
// An artwork can be reached at two live 200 URLs — its SEO slug (/{seoSlug})
// and the id-suffixed path (/artworks/{titleSlug}-{id}). The site's canonical
// strategy (sitemap.xml, the 301 redirect, and the client-side canonical in
// ArtworkDetailPage/SeoArtworkPage) is: prefer the SEO slug when present, and
// fall back to the id-suffixed path otherwise. This helper centralizes that
// rule so the server-injected canonical + og:url agree with the sitemap and the
// client instead of hardcoding the id-suffixed path.

export interface CanonicalArtwork {
  seoSlug?: string | null;
  title: string;
  id: number;
}

/** Title → URL slug. Mirrors toSlug() in server/routes.ts and client lib/seo.ts. */
export function toCanonicalSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * The canonical PATH for an artwork detail page.
 * - With a (non-empty, trimmed) seoSlug → `/{seoSlug}` (matches the sitemap,
 *   the 301 redirect target, and the client canonical).
 * - Without a seoSlug → `/artworks/{titleSlug}-{id}` (matches the client's
 *   ArtworkDetailPage canonical / artworkPath fallback).
 */
export function artworkCanonicalPath(a: CanonicalArtwork): string {
  const seo = a.seoSlug?.trim();
  return seo ? `/${seo}` : `/artworks/${toCanonicalSlug(a.title)}-${a.id}`;
}

/** The absolute canonical URL for an artwork detail page (base + canonical path). */
export function artworkCanonicalUrl(baseUrl: string, a: CanonicalArtwork): string {
  return `${baseUrl}${artworkCanonicalPath(a)}`;
}
