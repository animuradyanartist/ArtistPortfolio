/**
 * THE PAGES THAT SERVED A CRAWLER NOTHING, AND WHAT THEY MUST SERVE NOW.
 *
 * Google live-tested an animuradyan.com URL on 21 August 2026 and answered "URL is not
 * available to Google · Soft 404". Four sitemapped pages — /about, /exhibitions, /gallery,
 * /contact — answered 200 with `<div id="root"></div>`: no words, no <h1>. That is the shape
 * Google calls a soft 404, and on /gallery it also stranded 16 of the 208 images in the image
 * sitemap, because Google Images will not index an image whose host page it cannot index.
 *
 * Two failures are worth more than the feature, and this file exists for them.
 *
 * THE FIRST IS A DOORWAY. The cure for a thin page is not text written for crawlers. Every
 * assertion below pins output to REAL data or to a string the React component already renders,
 * so the prerender cannot drift into copy nobody would show a person.
 *
 * THE SECOND IS THE GALLERY IMAGES SILENTLY NOT RENDERING. The local sample store has zero
 * gallery photographs, so running the server exercises only the empty state — the <img> branch,
 * the alt text and the ordering are unreachable that way. They are reachable here.
 */
import { describe, it, expect } from 'vitest';
import {
  renderAboutHtml,
  renderExhibitionsHtml,
  renderGalleryHtml,
  renderContactHtml,
  type PrerenderExhibition,
  type PrerenderPhoto,
} from './staticPagePrerender';

const shows: PrerenderExhibition[] = [
  { title: 'Solo Show at Yerevan', type: 'solo', venue: 'HayArt', location: 'Yerevan', year: 2025, description: 'Twelve oils.' },
  { title: 'Art Fair Paris', type: 'group', venue: 'Grand Palais', location: 'Paris', year: 2024, description: null },
  { title: 'Early Group Show', type: 'group', venue: null, location: null, year: 2019, description: null },
];

const photos: PrerenderPhoto[] = [
  { title: 'Opening night', image: '/img/gallery/7/0?v=abc123', exhibitionName: 'Solo Show', location: 'Yerevan', year: 2025, position: 2 },
  { title: null, image: '/img/gallery/3/0?v=def456', exhibitionName: null, location: null, year: null, position: 1 },
];

/** Text a crawler actually reads — tags stripped, whitespace collapsed. */
const readable = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('every page carries a heading and real words', () => {
  const pages: Array<[string, string]> = [
    ['about', renderAboutHtml({ description: 'Two decades of oils.', statement: 'I paint space.', education: 'Yerevan Academy', awards: 'Prize 2020' }, shows)],
    ['exhibitions', renderExhibitionsHtml(shows)],
    ['gallery', renderGalleryHtml(photos)],
    ['contact', renderContactHtml()],
  ];

  it.each(pages)('%s has exactly one <h1>', (_name, html) => {
    expect(html.match(/<h1/g) ?? []).toHaveLength(1);
  });

  it.each(pages)('%s carries substantive readable text, not a stub', (_name, html) => {
    // The soft-404 threshold this whole change exists to clear. 120 characters is not a
    // quality bar, it is a floor: below it the page is what it was before.
    expect(readable(html).length).toBeGreaterThan(120);
  });

  it.each(pages)('%s links onward into the site', (_name, html) => {
    expect(html).toContain('href="/artworks"');
  });
});

describe('/about renders the artist, not a summary of her', () => {
  const html = renderAboutHtml(
    { description: 'First paragraph.\n\nSecond paragraph.', statement: 'A statement.', education: 'An education.', awards: 'An award.' },
    shows,
  );

  it('leads with her name and the intro AboutPage.tsx already shows', () => {
    expect(html).toContain('<h1 style="font-size:2.5rem;font-weight:700;color:#0f172a;margin-bottom:1rem">Ani Muradyan</h1>');
    expect(readable(html)).toContain('Contemporary oil painter working with simplified forms');
  });

  it('renders every stored field — a dropped one is a page that lies by omission', () => {
    const t = readable(html);
    for (const fragment of ['First paragraph.', 'Second paragraph.', 'A statement.', 'An education.', 'An award.']) {
      expect(t).toContain(fragment);
    }
  });

  it('lists exhibitions newest first', () => {
    const t = readable(html);
    expect(t.indexOf('Solo Show at Yerevan')).toBeLessThan(t.indexOf('Art Fair Paris'));
    expect(t.indexOf('Art Fair Paris')).toBeLessThan(t.indexOf('Early Group Show'));
  });

  it('survives a bio that does not exist yet', () => {
    const bare = renderAboutHtml(undefined, []);
    expect(bare).toContain('<h1');
    expect(readable(bare)).toContain('Contemporary oil painter');
  });
});

describe('/exhibitions groups by year, newest first', () => {
  const html = renderExhibitionsHtml(shows);

  it('orders years descending', () => {
    expect(readable(html).indexOf('2025')).toBeLessThan(readable(html).indexOf('2024'));
  });

  it('states type and place the way ExhibitionsPage does', () => {
    const t = readable(html);
    expect(t).toContain('Solo · HayArt, Yerevan');
    expect(t).toContain('Group · Grand Palais, Paris');
  });

  it('omits the separator when there is no venue or location', () => {
    expect(readable(html)).toContain('Group');
    expect(html).not.toContain('· </p>');
  });

  it('shows the real empty state rather than inventing shows', () => {
    expect(readable(renderExhibitionsHtml([]))).toContain('No exhibitions to show yet.');
  });
});

describe('/gallery exposes the photographs a crawler could not see', () => {
  const html = renderGalleryHtml(photos);

  it('emits a real <img> per photograph', () => {
    expect(html.match(/<img /g) ?? []).toHaveLength(2);
    expect(html).toContain('src="/img/gallery/7/0?v=abc123"');
    expect(html).toContain('src="/img/gallery/3/0?v=def456"');
  });

  it('uses the alt text GalleryPage.tsx builds, character for character', () => {
    expect(html).toContain('alt="Opening night – Ani Muradyan"');
    expect(html).toContain('alt="Exhibition photo – Ani Muradyan contemporary art"');
  });

  it('does NOT alter the image URL — cache-busting is a separate question', () => {
    // Canonicalising ?v= across sitemap/SSR/og/JSON-LD/rendered DOM may well be right, but it
    // is a different change with its own evidence. Doing it quietly here would bury it.
    expect(html).toContain('?v=abc123');
  });

  it('orders by position, not by array order', () => {
    expect(html.indexOf('/img/gallery/3/0')).toBeLessThan(html.indexOf('/img/gallery/7/0'));
  });

  it('captions the way GalleryPage joins them', () => {
    expect(readable(html)).toContain('Opening night · Solo Show · Yerevan · 2025');
  });

  it('shows the real empty state when there are no photographs', () => {
    const empty = renderGalleryHtml([]);
    expect(readable(empty)).toContain('Gallery photos coming soon.');
    expect(empty).not.toContain('<img ');
  });
});

describe('/contact states how to reach her', () => {
  const html = renderContactHtml();

  it('carries the real address and location', () => {
    expect(html).toContain('mailto:animuradyan.artist@gmail.com');
    expect(readable(html)).toContain('Yerevan, Armenia');
  });

  it('carries the three real profiles', () => {
    expect(html).toContain('https://www.instagram.com/animuradyan.art/');
    expect(html).toContain('https://www.saatchiart.com/account/profile/1980379');
    expect(html).toContain('https://www.singulart.com/en/artist/ani-muradyan-62448');
  });
});

describe('data is escaped — a title is not markup', () => {
  it('escapes an exhibition title containing HTML', () => {
    const html = renderExhibitionsHtml([{ title: '<script>alert(1)</script>', year: 2025 }]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes a photo title inside its own alt attribute', () => {
    const html = renderGalleryHtml([{ title: 'A "quoted" night', image: '/img/gallery/1/0' }]);
    expect(html).toContain('alt="A &quot;quoted&quot; night – Ani Muradyan"');
  });
});
