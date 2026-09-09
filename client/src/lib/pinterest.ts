/**
 * PINTEREST "SAVE" LINK — pure URL building for Pinterest's documented Pin-creation flow.
 *
 * NO SDK, NO TRACKING SCRIPT, NO COOKIE. This is only the public
 * `pinterest.com/pin/create/button/` endpoint with `url` + `media` + `description`, every
 * parameter URL-encoded (URLSearchParams handles the encoding). The visitor needs no browser
 * extension; the link works on desktop and mobile.
 *
 * `media` MUST BE AN ABSOLUTE, PUBLICLY-FETCHABLE IMAGE URL. Pinterest's servers download the
 * media to build the Pin, so a relative path or a base64 `data:` URI cannot work. The PDPs show
 * first-party `/img/{kind}/{id}/{idx}` refs (the site's public, resized-WebP image route — never
 * the private print master), so `toAbsolutePinImage` turns those into absolute animuradyan.com
 * URLs and refuses anything Pinterest could not fetch.
 */

/** Pinterest's documented Save/Pin-creation endpoint. Opening it needs no SDK. */
export const PINTEREST_CREATE_ENDPOINT = "https://www.pinterest.com/pin/create/button/";

/**
 * Turn a PDP image `src` into an absolute, Pinterest-fetchable URL — or return `null` when it is
 * not usable as Pin media (a `data:` URI or an unexpected bare-relative path). An already-absolute
 * `http(s)`/protocol-relative URL is returned as-is; a first-party `/img/...` ref is prefixed with
 * the site base URL.
 */
export function toAbsolutePinImage(src: string | null | undefined, baseUrl: string): string | null {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src; // already absolute (external CDN / Prodigi mockup)
  if (src.startsWith("//")) return `https:${src}`; // protocol-relative
  if (src.startsWith("/")) return `${baseUrl.replace(/\/+$/, "")}${src}`; // first-party /img ref
  return null; // data: URI or unexpected relative — Pinterest cannot fetch it
}

/**
 * The image ref to pin for an ORIGINAL artwork: the site's OWN first-party `/img/artwork/:id/0`
 * route for the primary image, NOT the artwork's stored `images[0]`. Some originals store an
 * external marketplace image URL in `images[0]`, and putting that straight into Pinterest's `media`
 * would expose (and hotlink) a third-party CDN. Pinning this route instead means the `media`
 * parameter is always animuradyan.com; the route serves the same public pixels (resized WebP for a
 * base64 original, a 302 to the source for an external one) and NEVER the private print master.
 *
 * Prints are deliberately not routed through here — their `images[0]` is already a first-party
 * `/img/print/:id/0` ref, so they stay exactly as implemented.
 */
export function originalPinImageRef(artworkId: number): string {
  return `/img/artwork/${artworkId}/0`;
}

export interface PinterestSaveParams {
  /** Absolute canonical URL the Pin links back to (the exact PDP). */
  url: string;
  /** Absolute, public image URL. Omitted when null — Pinterest then scrapes the page's og:image. */
  media?: string | null;
  /** Short, factual description drawn from existing metadata. No invented marketing claims. */
  description?: string | null;
}

/**
 * Build the fully URL-encoded Pinterest Save URL. `url` is always present; `media` and
 * `description` are included only when provided, so a missing image degrades to Pinterest scraping
 * the linked page rather than producing a broken `media=` parameter.
 */
export function buildPinterestSaveUrl(p: PinterestSaveParams): string {
  const q = new URLSearchParams();
  q.set("url", p.url);
  if (p.media) q.set("media", p.media);
  if (p.description) q.set("description", p.description);
  return `${PINTEREST_CREATE_ENDPOINT}?${q.toString()}`;
}
