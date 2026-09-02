/**
 * WHAT A CRAWLER READS ON THE FOUR PAGES THAT USED TO SERVE IT NOTHING.
 *
 * /about, /exhibitions, /gallery and /contact are in the sitemap, answer 200 and say
 * `index, follow` — and their body was `<div id="root"></div>`. Zero words, no <h1>. A 200
 * with an empty body is what Google classifies as a SOFT 404, and it reported exactly that on
 * 21 August 2026. /gallery is also the declared host page for 16 of the 208 images in the
 * image sitemap, and Google Images will not index an image whose host page it cannot index —
 * so the photographs went down with the page.
 *
 * EVERY STRING HERE IS ALREADY ON THE PAGE. The headings, the intro sentences and the contact
 * details are copied from AboutPage/ExhibitionsPage/GalleryPage/ContactPage; the biography,
 * exhibitions and photographs come from the same storage the /api routes serve. Nothing is
 * written for crawlers — a page written for crawlers is a doorway, and a doorway is worse than
 * the soft 404 it replaces.
 *
 * PURE, and separate from routes.ts, for one concrete reason: the local sample store has no
 * gallery photographs, so the branch that emits <img> and its alt text cannot be exercised by
 * running the server. It is exercised by the tests next to this file instead.
 *
 * The caller injects the result INSIDE <div id="root">, where React's first client render
 * replaces it — see the note in routes.ts about why the homepage learned that the hard way.
 */

export interface PrerenderBio {
  description?: string | null;
  statement?: string | null;
  education?: string | null;
  awards?: string | null;
}

export interface PrerenderExhibition {
  title: string;
  type?: string | null;
  venue?: string | null;
  location?: string | null;
  year?: number | null;
  description?: string | null;
}

export interface PrerenderPhoto {
  title?: string | null;
  image: string;
  exhibitionName?: string | null;
  location?: string | null;
  year?: number | null;
  position?: number | null;
}

const esc = (t: unknown): string =>
  String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const WRAP = 'padding:3rem 1.5rem;max-width:820px;margin:0 auto;font-family:system-ui,sans-serif';
const H1 = 'font-size:2.5rem;font-weight:700;color:#0f172a;margin-bottom:1rem';
const LEAD = 'font-size:1.1rem;line-height:1.7;color:#475569;margin-bottom:1.5rem';
const BODY = 'line-height:1.7;color:#334155;margin-bottom:1rem';
const MUTED = 'color:#64748b;margin-bottom:0.25rem';
const LINK = 'color:#1d4ed8;text-decoration:underline';

/** [venue, location] joined exactly as ExhibitionsPage and AboutPage join them. */
function where(e: PrerenderExhibition): string {
  return [e.venue, e.location].map((x) => x?.trim()).filter(Boolean).join(', ');
}

/** Newest first — the order AboutPage sorts into. */
function newestFirst(list: readonly PrerenderExhibition[]): PrerenderExhibition[] {
  return [...list].sort((a, b) => (b.year || 0) - (a.year || 0));
}

/**
 * The /about page IS the artist's entity hub, but it carried no structured data. This binds the
 * canonical Person to /about via a ProfilePage, using ONLY facts already stated publicly on the site
 * (name, role, location, medium) + the same sameAs profiles as the global Person block. Stable @id so
 * search/AI systems can unify this node with the homepage Person and the artwork `creator` nodes.
 */
function aboutProfileJsonLd(): string {
  const person = {
    "@type": ["Person", "VisualArtist"],
    "@id": "https://animuradyan.com/#person",
    name: "Ani Muradyan",
    jobTitle: "Artist",
    description:
      "Ani Muradyan is an Armenian contemporary oil painter based in Yerevan, known for atmospheric landscape and figurative works. She makes original, one-of-a-kind oil paintings and offers fine-art and canvas prints of selected works.",
    url: "https://animuradyan.com",
    mainEntityOfPage: "https://animuradyan.com/about",
    image: "https://animuradyan.com/ani-portrait.webp",
    nationality: { "@type": "Country", name: "Armenia" },
    homeLocation: {
      "@type": "Place",
      name: "Yerevan, Armenia",
      address: { "@type": "PostalAddress", addressLocality: "Yerevan", addressCountry: "AM" },
    },
    artform: "Oil painting",
    artMedium: "Oil on canvas",
    sameAs: [
      "https://www.instagram.com/animuradyan.art/",
      "https://www.singulart.com/en/artist/ani-muradyan-62448",
      "https://www.saatchiart.com/account/profile/1980379",
      "https://www.artfinder.com/artist/ani-muradyan/",
    ],
    knowsAbout: [
      "Oil Painting", "Figurative Painting", "Landscape Painting",
      "Contemporary Landscape Painting", "Armenian Contemporary Art", "Fine Art",
    ],
  };
  const ld = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: "https://animuradyan.com/about",
    mainEntity: person,
  };
  return `<script type="application/ld+json" id="about-jsonld">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;
}

export function renderAboutHtml(bio: PrerenderBio | undefined, exhibitions: readonly PrerenderExhibition[]): string {
  const shows = newestFirst(exhibitions);
  return (
    aboutProfileJsonLd() +
    `<section id="about-ssr" style="${WRAP}">` +
    `<h1 style="${H1}">Ani Muradyan</h1>` +
    `<p style="${LEAD}">Contemporary oil painter working with simplified forms, colour, space, and emotional atmosphere — based in Yerevan, Armenia.</p>` +
    (bio?.description
      ? String(bio.description).split(/\n+/).filter(Boolean)
          .map((para) => `<p style="${BODY}">${esc(para)}</p>`).join('')
      : '') +
    (bio?.statement ? `<h2>Artist Statement</h2><blockquote style="${BODY}">${esc(bio.statement)}</blockquote>` : '') +
    (bio?.education ? `<h2>Education</h2><p style="${BODY}">${esc(bio.education)}</p>` : '') +
    (bio?.awards ? `<h2>Awards &amp; Recognition</h2><p style="${BODY}">${esc(bio.awards)}</p>` : '') +
    (shows.length
      ? `<h2>Exhibitions</h2>` +
        `<p style="${LEAD}">Ani Muradyan's work has been exhibited internationally and in Armenia.</p>` +
        `<ul>` +
        shows.map((e) =>
          `<li style="${BODY}">${e.year ? `${esc(e.year)} · ` : ''}${esc(e.title)}` +
          `${where(e) ? ` — ${esc(where(e))}` : ''}</li>`).join('') +
        `</ul>`
      : '') +
    `<p><a href="/artworks" style="${LINK}">View Originals</a> · ` +
    `<a href="/exhibitions" style="${LINK}">View Exhibitions</a> · ` +
    `<a href="/contact" style="${LINK}">Contact the Artist</a></p>` +
    `</section>`
  );
}

export function renderExhibitionsHtml(exhibitions: readonly PrerenderExhibition[]): string {
  const byYear = new Map<number, PrerenderExhibition[]>();
  for (const e of exhibitions) {
    const y = e.year || 0;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(e);
  }
  const years = Array.from(byYear.keys()).sort((a, b) => b - a);
  return (
    `<section id="exhibitions-ssr" style="${WRAP}">` +
    `<h1 style="${H1}">Exhibitions</h1>` +
    `<p style="${LEAD}">Ani Muradyan's work has been exhibited internationally and across Armenia — in solo shows and art fairs from Yerevan to Paris, Madrid, and beyond.</p>` +
    (years.length
      ? years.map((y) =>
          `<section><h2>${y ? esc(y) : ''}</h2>` +
          byYear.get(y)!.map((e) =>
            `<article><h3>${esc(e.title)}</h3>` +
            `<p style="${MUTED}">${esc(e.type === 'group' ? 'Group' : 'Solo')}` +
            `${where(e) ? ` · ${esc(where(e))}` : ''}</p>` +
            (e.description ? `<p style="${BODY}">${esc(e.description)}</p>` : '') +
            `</article>`).join('') +
          `</section>`).join('')
      : `<p style="${BODY}">No exhibitions to show yet.</p>`) +
    `<p><a href="/artworks" style="${LINK}">View Originals</a> · ` +
    `<a href="/contact" style="${LINK}">Contact the Artist</a></p>` +
    `</section>`
  );
}

/**
 * The photographs, with the alt text GalleryPage.tsx builds — character for character.
 *
 * `image` arrives already through `refifyImageFieldList('gallery', …, 'image')`, the same
 * helper /api/gallery-photos uses, so the src here is the URL the React page renders. This
 * deliberately does NOT normalise or strip the cache-busting query: image-URL canonicalisation
 * is a separate question with its own evidence, and doing it quietly here would bury it.
 */
export function renderGalleryHtml(photos: readonly PrerenderPhoto[]): string {
  const ordered = [...photos].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return (
    `<section id="gallery-ssr" style="${WRAP}">` +
    `<h1 style="${H1}">Gallery</h1>` +
    `<p style="${LEAD}">Moments from exhibitions, art fairs, and the studio.</p>` +
    (ordered.length
      ? `<ul style="list-style:none;padding:0">` +
        ordered.map((ph) => {
          const alt = ph.title ? `${ph.title} – Ani Muradyan` : 'Exhibition photo – Ani Muradyan contemporary art';
          const caption = [ph.title, ph.exhibitionName, ph.location, ph.year].filter(Boolean).join(' · ');
          return (
            `<li style="margin-bottom:2rem">` +
            `<img src="${esc(ph.image)}" alt="${esc(alt)}" loading="lazy" style="width:100%;height:auto;border-radius:12px" />` +
            (caption ? `<p style="${MUTED}">${esc(caption)}</p>` : '') +
            `</li>`
          );
        }).join('') +
        `</ul>`
      : `<p style="${BODY}">Gallery photos coming soon.</p>`) +
    `<p>Explore the <a href="/artworks" style="${LINK}">collection of original paintings</a>.</p>` +
    `</section>`
  );
}

/** ContactPage.tsx fetches nothing; these are its own constants. */
export function renderContactHtml(): string {
  return (
    `<section id="contact-ssr" style="${WRAP}">` +
    `<h1 style="${H1}">Let's Connect</h1>` +
    `<p style="${LEAD}">For artwork inquiries, commissions, or collaborations — I'd love to hear from you.</p>` +
    `<h2>Reach Out Directly</h2>` +
    `<p style="${BODY}">Email: <a href="mailto:animuradyan.artist@gmail.com" style="${LINK}">animuradyan.artist@gmail.com</a></p>` +
    `<p style="${BODY}">Location: Yerevan, Armenia</p>` +
    `<h2>Follow the Work</h2>` +
    `<ul>` +
    `<li><a href="https://www.instagram.com/animuradyan.art/" style="${LINK}">Instagram · @animuradyan.art</a></li>` +
    `<li><a href="https://www.saatchiart.com/account/profile/1980379" style="${LINK}">Saatchi Art · Shop originals</a></li>` +
    `<li><a href="https://www.singulart.com/en/artist/ani-muradyan-62448" style="${LINK}">Singulart · Verified artist</a></li>` +
    `</ul>` +
    `<p>Browse the <a href="/artworks" style="${LINK}">original paintings</a> ` +
    `or visit the <a href="/gallery" style="${LINK}">exhibition gallery</a>.</p>` +
    `</section>`
  );
}
