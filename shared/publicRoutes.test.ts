/**
 * THE UNBOUNDED SOFT-404 SURFACE.
 *
 * The SPA fallback served index.html for ANY path that reached it — 200, a self-canonical
 * claiming the URL was real, and `index, follow`, on an empty body. Only `/artworks/` ever
 * contradicted that. So /completely-made-up-page, /about/sub/page, /gallery/x and every other
 * string a crawler cares to try answered 200 and invited indexing: not a handful of thin pages
 * but an infinite family of them.
 *
 * Two failures are worth more than the fix, and this file is here for them.
 *
 * THE FIRST IS 404ING A REAL PAGE. Far worse than the bug being fixed: a soft 404 costs
 * ranking, a hard 404 on /gallery costs the page. Every route in App.tsx is pinned below,
 * including /cart, /checkout and the whole /admin family, which are public routes that must
 * keep working even though they are never indexed.
 *
 * THE SECOND IS DECIDING BY SHAPE WHAT ONLY DATA CAN ANSWER. `/:seoSlug` means a bare segment
 * may be a real artwork address, so shape must not rule it in OR out — the caller resolves it
 * against the artwork table and only falls back to shape when that came back empty.
 */
import { describe, it, expect } from 'vitest';
import { isKnownRouteShape, isBareSlug, markNotFoundHtml } from './publicRoutes';

const SHELL =
  '<html><head><title>t</title><meta name="robots" content="index, follow">' +
  '<link rel="canonical" href="https://animuradyan.com/completely-made-up-page"></head>' +
  '<body><div id="root"></div></body></html>';

describe('1 · every known public route is still a route', () => {
  it.each([
    '/', '/artworks', '/about', '/path', '/exhibitions', '/gallery', '/contact', '/blog',
    '/shipping', '/returns', '/privacy',
    '/cart', '/checkout',
    '/admin', '/admin/create-artwork', '/admin/create-print', '/admin/orders',
  ])('%s is routed', (p) => {
    expect(isKnownRouteShape(p)).toBe(true);
  });

  it('the policy pages that were soft-404ing are now known routes (return 200, not 404)', () => {
    for (const p of ['/shipping', '/returns', '/privacy']) {
      expect(isKnownRouteShape(p)).toBe(true);
    }
  });

  it('tolerates one trailing slash — same page, not a 404', () => {
    for (const p of ['/about/', '/artworks/', '/blog/', '/gallery/']) {
      expect(isKnownRouteShape(p)).toBe(true);
    }
  });

  it('ignores query strings and fragments', () => {
    expect(isKnownRouteShape('/artworks?page=2')).toBe(true);
    expect(isKnownRouteShape('/about#bio')).toBe(true);
  });
});

describe('2+3 · valid artwork and blog URLs are routed', () => {
  it.each([
    '/artworks/blue-drift-40', '/artworks/path-to-tranquility-78', '/artworks/40',
  ])('artwork %s', (p) => expect(isKnownRouteShape(p)).toBe(true));

  it.each([
    '/blog/minimalist-landscape-painting', '/blog/ani-muradyan-blue-abstract-landscapes',
  ])('article %s', (p) => expect(isKnownRouteShape(p)).toBe(true));

  it('a missing artwork or article is still SHAPE-valid — its own rule decides', () => {
    // isMissingArtworkPath / isMissingBlogPath own that call and are untouched by this module.
    expect(isKnownRouteShape('/artworks/does-not-exist-999')).toBe(true);
    expect(isKnownRouteShape('/blog/does-not-exist')).toBe(true);
  });
});

describe('4+5 · unknown paths, flat and nested, are not routes', () => {
  it.each([
    '/about/sub/page', '/gallery/x', '/contact/foo', '/path/anything',
    '/artworks/a/b', '/blog/a/b', '/a/b/c/d/e', '/wp-admin/setup-config.php'.replace('.php',''),
    '/gallery/x/y/z', '/checkout/steps/2', '/cart/items/9',
  ])('%s is not a route', (p) => expect(isKnownRouteShape(p)).toBe(false));

  it('a bare segment is NOT decided by shape — data decides', () => {
    // The whole point: /completely-made-up-page and a genuine seoSlug are the same shape.
    expect(isBareSlug('/completely-made-up-page')).toBe(true);
    expect(isBareSlug('/some-real-artwork-slug')).toBe(true);
    expect(isKnownRouteShape('/completely-made-up-page')).toBe(false);
    expect(isBareSlug('/')).toBe(false);
    expect(isBareSlug('/about/sub')).toBe(false);
  });
});

describe('6 · /prints keeps its redirect family', () => {
  it.each(['/prints', '/prints/anything', '/prints/path-to-tranquility-78'])(
    '%s stays a known route so the catch-all never 404s it',
    (p) => expect(isKnownRouteShape(p)).toBe(true),
  );

  it('but does not extend to deeper paths', () => {
    expect(isKnownRouteShape('/prints/a/b')).toBe(false);
  });
});

describe('7 · asset, API and image paths are never judged by this module', () => {
  // They are routed before the catch-all and the catch-all skips extensioned paths. If any of
  // these ever reached here, treating them as pages would be the bug — so they are not routes.
  it.each([
    '/api/artworks', '/img/artwork/40/0', '/assets/index-abc123',
  ])('%s is not a page route', (p) => expect(isKnownRouteShape(p)).toBe(false));
});

describe('8+9 · a not-found body stops asserting it is a page', () => {
  const out = markNotFoundHtml(SHELL);

  it('drops the self-canonical entirely rather than naming another URL', () => {
    expect(out).not.toContain('rel="canonical"');
    expect(out).not.toContain('completely-made-up-page');
  });

  it('says noindex', () => {
    expect(out).toContain('content="noindex, follow"');
    expect(out).not.toContain('content="index, follow"');
  });

  it('keeps follow, so a crawler can walk back into the site', () => {
    expect(out).toContain('follow');
  });

  it('still returns a real document — the shell renders for the person who mistyped', () => {
    expect(out).toContain('<div id="root">');
    expect(out).toContain('<title>');
  });

  it('adds the robots tag when the shell has none', () => {
    const bare = '<html><head><title>t</title></head><body></body></html>';
    expect(markNotFoundHtml(bare)).toContain('content="noindex, follow"');
  });

  it('is idempotent — applying it twice changes nothing further', () => {
    expect(markNotFoundHtml(out)).toBe(out);
  });
});
