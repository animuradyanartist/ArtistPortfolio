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

export function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * The canonical link to an artwork's detail page: a readable title slug
 * plus the artwork id, e.g. /artworks/silent-bliss-62. The id keeps the
 * URL unique even when two paintings share a title, so links, reloads,
 * and shares always resolve to the exact piece. The API resolves this by
 * the trailing -id (see server/routes.ts).
 */
export function artworkPath(artwork: { id: number; title: string }): string {
  return `/artworks/${toSlug(artwork.title)}-${artwork.id}`;
}

export function generateArtworkAlt(title: string, medium?: string): string {
  const safeTitle = title?.trim() || 'Original artwork';
  const base = medium
    ? `${safeTitle} – ${medium} by Armenian artist Ani Muradyan`
    : `${safeTitle} – original painting by Armenian artist Ani Muradyan`;
  return base;
}
