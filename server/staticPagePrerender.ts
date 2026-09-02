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

/**
 * TRUST & POLICY PAGES — Shipping, Returns, Privacy.
 *
 * Every claim here is grounded in how the site actually behaves: prints are made to order and
 * printed by fulfilment partners; shipping is a real per-destination quote shown at checkout;
 * payments go through Stripe (the site never sees card numbers); analytics is Google Analytics +
 * Microsoft Clarity (both declared in index.html); orders can be refunded/cancelled (the order
 * lifecycle has those phases). NOTHING here invents a company registration, tax number, phone, or
 * legal guarantee. These render server-side so a crawler (and Google Merchant Center's site check)
 * reads real policy text, and the same wording should be kept consistent with Merchant Center.
 */
const CONTACT_EMAIL = "animuradyan.artist@gmail.com";
const mailto = `<a href="mailto:${CONTACT_EMAIL}" style="${LINK}">${CONTACT_EMAIL}</a>`;

export function renderShippingHtml(): string {
  return (
    `<section id="shipping-ssr" style="${WRAP}">` +
    `<h1 style="${H1}">Shipping</h1>` +
    `<p style="${LEAD}">Fine-art prints and original paintings by Ani Muradyan ship worldwide.</p>` +
    `<h2>Fine-art prints</h2>` +
    `<p style="${BODY}">Every print is <strong>made to order</strong> — produced individually for you on archival Hahnemühle fine-art paper or stretched canvas with archival pigment inks. Nothing is held in stock.</p>` +
    `<p style="${BODY}">Prints are usually produced within a few business days and then shipped with tracked delivery. Total delivery time depends on your destination.</p>` +
    `<p style="${BODY}">Shipping is <strong>calculated at checkout</strong> for your specific destination, so the exact cost is shown before you pay.</p>` +
    `<h2>Original paintings</h2>` +
    `<p style="${BODY}">Original works ship from the artist's studio in Yerevan, Armenia, carefully packed. For an original, please <a href="/contact" style="${LINK}">contact the artist</a> to arrange shipping to your country.</p>` +
    `<h2>Questions about an order</h2>` +
    `<p style="${BODY}">Email ${mailto} with your order number and we'll help.</p>` +
    `<p><a href="/prints" style="${LINK}">Browse fine-art prints</a> · <a href="/returns" style="${LINK}">Returns &amp; refunds</a></p>` +
    `</section>`
  );
}

export function renderReturnsHtml(): string {
  return (
    `<section id="returns-ssr" style="${WRAP}">` +
    `<h1 style="${H1}">Returns &amp; Refunds</h1>` +
    `<p style="${LEAD}">Because each print is made to order specifically for you, please choose carefully. We stand behind the quality of every piece.</p>` +
    `<h2>Damaged, defective, or not as described</h2>` +
    `<p style="${BODY}">If your print arrives damaged, defective, or materially different from what was ordered, we will make it right with a <strong>free replacement or a full refund</strong>. Email ${mailto} within 14 days of delivery with your order number and a photo of the issue.</p>` +
    `<h2>Change-of-mind returns</h2>` +
    `<p style="${BODY}">Prints are produced individually to order and are not held in stock, so we are generally unable to accept change-of-mind returns or exchanges once production has begun. If you need to change or cancel an order, contact us as soon as possible and we will do our best before it goes to production.</p>` +
    `<h2>Original paintings</h2>` +
    `<p style="${BODY}">Original artworks are unique, one-of-a-kind pieces. Please <a href="/contact" style="${LINK}">contact the artist</a> before purchase with any questions about a specific work.</p>` +
    `<h2>How refunds are issued</h2>` +
    `<p style="${BODY}">Approved refunds are returned to your original payment method.</p>` +
    `<p><a href="/shipping" style="${LINK}">Shipping</a> · <a href="/contact" style="${LINK}">Contact</a></p>` +
    `</section>`
  );
}

export function renderPrivacyHtml(): string {
  return (
    `<section id="privacy-ssr" style="${WRAP}">` +
    `<h1 style="${H1}">Privacy</h1>` +
    `<p style="${LEAD}">This site collects the minimum needed to fulfil your order and answer your messages, and never sells your personal information.</p>` +
    `<h2>What we collect</h2>` +
    `<p style="${BODY}">When you place an order: your name, email address, shipping address, and the items ordered. When you use the contact form: your name, email address, and message.</p>` +
    `<h2>Payments</h2>` +
    `<p style="${BODY}">Payments are processed securely by <strong>Stripe</strong>. Your full card details are entered on Stripe's systems and are never seen or stored by this site.</p>` +
    `<h2>Fulfilment</h2>` +
    `<p style="${BODY}">To make and deliver a print, your name and shipping address are shared with the printing and shipping partners who produce and post your order. They use this information only to fulfil your order.</p>` +
    `<h2>Analytics</h2>` +
    `<p style="${BODY}">This site uses Google Analytics and Microsoft Clarity to understand how the site is used and to improve it. These services may set cookies in your browser.</p>` +
    `<h2>Your choices</h2>` +
    `<p style="${BODY}">To ask what personal data we hold, or to have it corrected or deleted, email ${mailto}.</p>` +
    `<h2>Contact</h2>` +
    `<p style="${BODY}">Ani Muradyan · Yerevan, Armenia · ${mailto}</p>` +
    `</section>`
  );
}
