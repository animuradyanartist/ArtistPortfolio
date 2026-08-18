import { toSlug, artworkCanonicalPath } from '@shared/canonical';

// Slug logic lives in @shared/canonical (single source of truth); re-exported
// here so existing `@/lib/seo` importers keep working unchanged.
export { toSlug };

export const BASE_URL = 'https://animuradyan.com';

export function updateCanonicalUrl(path: string) {
  const canonicalUrl = `${BASE_URL}${path}`;
  
  let link = document.querySelector("link[rel='canonical']") as HTMLLinkElement;
  
  if (link) {
    link.href = canonicalUrl;
  } else {
    link = document.createElement('link');
    link.rel = 'canonical';
    link.href = canonicalUrl;
    document.head.appendChild(link);
  }
}

export function updateMetaDescription(description: string) {
  let meta = document.querySelector("meta[name='description']") as HTMLMetaElement;
  if (meta) {
    meta.content = description;
  } else {
    meta = document.createElement('meta');
    meta.name = 'description';
    meta.content = description;
    document.head.appendChild(meta);
  }
}

export function injectJsonLd(id: string, data: object) {
  let script = document.getElementById(id) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.id = id;
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

export function removeJsonLd(id: string) {
  const script = document.getElementById(id);
  if (script) script.remove();
}

/**
 * The canonical link to an artwork's detail page: a readable title slug
 * plus the artwork id, e.g. /artworks/silent-bliss-62. The id keeps the
 * URL unique even when two paintings share a title, so links, reloads,
 * and shares always resolve to the exact piece. The API resolves this by
 * the trailing -id (see server/routes.ts).
 */
/**
 * The canonical path for an artwork detail page.
 *
 * Delegates to @shared/canonical — the same function the server's canonical tag, the 301
 * redirect and both sitemaps use. It previously re-implemented the id-suffixed form and
 * ignored `seoSlug` entirely, so the moment any artwork gained a seoSlug the links on this
 * page would have pointed somewhere the page itself disowns.
 */
export function artworkPath(artwork: { id: number; title: string; seoSlug?: string | null }): string {
  return artworkCanonicalPath(artwork);
}

export function generateArtworkAlt(title: string, medium?: string): string {
  const safeTitle = title?.trim() || 'Original artwork';
  const base = medium
    ? `${safeTitle} – ${medium} by Armenian artist Ani Muradyan`
    : `${safeTitle} – original painting by Armenian artist Ani Muradyan`;
  return base;
}
