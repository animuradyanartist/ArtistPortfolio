/**
 * THE PAGE THAT TOLD GOOGLE A PAINTING DID NOT EXIST.
 *
 * Google live-tested https://animuradyan.com/artworks/blue-drift-40 on 21 August 2026. The
 * server had already resolved it: correct <title>, canonical, `index, follow`, VisualArtwork
 * JSON-LD, and `window.__PRELOADED_ARTWORK__` carrying the whole row for id 40. Then the app
 * rendered `<h1>Artwork not found</h1>` into #root, and Google — which indexes the RENDERED
 * DOM — filed the URL as a soft 404.
 *
 * One condition did it: `if (error || !artwork)`. `error` is set by any failed request, so a
 * single 500 or dropped connection did not degrade the page, it inverted it. Every one of the
 * 53 artwork URLs in the sitemap ran through that same line.
 *
 * The rule these tests defend: A PAGE THAT HAS A PAINTING TO SHOW NEVER SAYS NOT FOUND. Only a
 * definitive 404 may, and a real 404 still must.
 */
import { describe, it, expect } from 'vitest';
import {
  ArtworkMissingError,
  isMissingResponse,
  meansArtworkMissing,
  artworkViewState,
} from './artworkAvailability';
import { knownAddresses, isKnownAddressFor } from './artworkAddress';

const blueDrift = { id: 40, title: 'Blue Drift', slug: null, seoSlug: null };
const view = (o: Partial<Parameters<typeof artworkViewState<typeof blueDrift>>[0]>) =>
  artworkViewState<typeof blueDrift>({ fetched: undefined, preloaded: undefined, error: undefined, isLoading: false, ...o });

describe('only a 404 means the painting is absent', () => {
  it('404 is absence', () => {
    expect(isMissingResponse(404)).toBe(true);
  });

  it.each([500, 502, 503, 504, 429, 408, 0])('%i is NOT absence — it is unreachability', (status) => {
    expect(isMissingResponse(status)).toBe(false);
  });

  it('recognises its own error and nothing else', () => {
    expect(meansArtworkMissing(new ArtworkMissingError('blue-drift-40'))).toBe(true);
    expect(meansArtworkMissing(new Error('500: Internal Server Error'))).toBe(false);
    expect(meansArtworkMissing(new TypeError('Failed to fetch'))).toBe(false);
    expect(meansArtworkMissing(undefined)).toBe(false);
  });
});

describe('THE REGRESSION: /artworks/blue-drift-40 under a failing API', () => {
  // The exact production shape Google captured: preload present, fetch failed, not a 404.
  it('shows Blue Drift when the API 500s, because the server already sent it', () => {
    const v = view({ preloaded: blueDrift, error: new Error('500: Internal Server Error') });
    expect(v.state).toBe('artwork');
    expect(v.show).toEqual(blueDrift);
  });

  it.each([
    ['a 500', new Error('500: Internal Server Error')],
    ['a 502 during redeploy', new Error('502: Bad Gateway')],
    ['a dropped connection', new TypeError('Failed to fetch')],
    ['a timeout', new Error('The operation was aborted')],
  ])('never renders not-found on %s', (_label, err) => {
    expect(view({ preloaded: blueDrift, error: err }).state).not.toBe('missing');
  });

  it('prefers the freshly fetched row over the preload when both exist', () => {
    const fresh = { ...blueDrift, title: 'Blue Drift (updated)' };
    expect(view({ fetched: fresh, preloaded: blueDrift }).show).toEqual(fresh);
  });

  it('keeps showing the painting while a background refetch is in flight', () => {
    expect(view({ preloaded: blueDrift, isLoading: true }).state).toBe('artwork');
  });
});

describe('404 handling is NOT weakened', () => {
  it('a genuine 404 still renders not-found, even with a stale preload on the page', () => {
    // Navigating in-app can leave a previous painting on `window`. A definitive 404 must win.
    const v = view({ preloaded: blueDrift, error: new ArtworkMissingError('deleted-work-999') });
    expect(v.state).toBe('missing');
    expect(v.show).toBeUndefined();
  });

  it('an unknown URL with nothing to show is still not-found', () => {
    expect(view({ error: new ArtworkMissingError('nonsense-999') }).state).toBe('missing');
  });

  it('unreachable AND nothing to show is not-found — the last branch, not the first', () => {
    // No preload (client-side navigation), API failed: there is genuinely nothing to render.
    expect(view({ error: new Error('500') }).state).toBe('missing');
  });

  it('shows loading, not not-found, before the first answer arrives', () => {
    expect(view({ isLoading: true }).state).toBe('loading');
  });
});

describe('every supported slug form resolves to the same painting', () => {
  // The URL contract shared by sitemap, SSR, router, canonical, structured data and links.
  const withEverything = { id: 40, title: 'Blue Drift', slug: 'blue-drift-oil', seoSlug: 'blue-drift-original' };

  it('accepts the canonical title-id form — the one in the sitemap', () => {
    expect(knownAddresses(blueDrift)).toContain('blue-drift-40');
    expect(isKnownAddressFor(blueDrift, 'blue-drift-40')).toBe(true);
  });

  it.each([
    ['canonical title-id', 'blue-drift-40'],
    ['bare numeric id', '40'],
    ['marketplace slug', 'blue-drift-oil'],
    ['explicit seoSlug', 'blue-drift-original'],
  ])('accepts the %s form', (_label, param) => {
    expect(isKnownAddressFor(withEverything, param)).toBe(true);
  });

  it('is case-insensitive, because a crawler will try both', () => {
    expect(isKnownAddressFor(blueDrift, 'Blue-Drift-40')).toBe(true);
  });

  it('still rejects an invented address — no unbounded near-duplicates', () => {
    expect(isKnownAddressFor(blueDrift, 'total-nonsense-40')).toBe(false);
    expect(isKnownAddressFor(blueDrift, '41')).toBe(false);
  });

  it('the preload is only used for the URL it was served for', () => {
    // A page served for Blue Drift must not render its preload at another painting's address.
    const usable = (param: string) => (isKnownAddressFor(blueDrift, param) ? blueDrift : undefined);
    expect(view({ preloaded: usable('blue-drift-40'), error: new Error('500') }).state).toBe('artwork');
    expect(view({ preloaded: usable('path-to-tranquility-78'), error: new Error('500') }).state).toBe('missing');
  });
});
