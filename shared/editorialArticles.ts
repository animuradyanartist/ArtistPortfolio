/**
 * FIRST-PARTY EDITORIAL ARTICLES — authored in code, read through the blog like any other post.
 *
 * The journal's articles live in the database and are written through the admin. This one was
 * written to answer a specific buyer's question — "how do I choose an original painting for my
 * home?" — and is shipped as code so it deploys with the site and can reference the real
 * catalogue by title. It is merged into the blog read path (getBlogPosts / getBlogPostBySlug)
 * so it renders through the exact same SSR, Article structured data, artwork figures, listing
 * and sitemap as a database post — one article surface, not a second bespoke one.
 *
 * The body uses the article-markdown subset (see shared/articleMarkdown.ts): `##`/`###`
 * headings, `>` quotes, `-` lists, `**bold**`, `[text](/path)` links, and `:artwork[Title]`
 * to place a real work from the catalogue inline (image + caption + link to its page). Every
 * `:artwork[…]` names a painting that actually exists and is available, so the figures — and
 * the path to purchase — are real, not illustrative.
 *
 * Nothing here fabricates sales, collectors, press, exhibitions, credentials or market claims.
 * It is a painter's practical guidance, useful to a reader whether or not they ever buy.
 */
import type { BlogPost } from "./schema";

/** High id range so a code article can never collide with a database post's id. */
const EDITORIAL_ID_BASE = 900_000;

type EditorialInput = {
  slug: string;
  title: string;
  excerpt: string;
  coverImage: string;
  coverImageAlt: string;
  publishedAt: string;
  body: string;
};

function editorial(i: EditorialInput, idx: number): BlogPost {
  const at = new Date(i.publishedAt);
  return {
    id: EDITORIAL_ID_BASE + idx,
    slug: i.slug,
    title: i.title,
    excerpt: i.excerpt,
    body: i.body,
    status: "published",
    sourceNote: null,
    evidence: null,
    coverImage: i.coverImage,
    coverImageAlt: i.coverImageAlt,
    publishedAt: at,
    origin: "editorial",
    decisionRef: null,
    expectedOutcome: null,
    measurementHorizonDays: null,
    createdAt: at,
    updatedAt: at,
  } as BlogPost;
}

/**
 * "How to Choose an Original Painting for Your Space".
 *
 * A collector- and interior-facing guide, in the artist's voice. It answers a genuine buying
 * question with a painter's expertise — scale, light, colour, the difference an original makes,
 * where to begin, and commissioning — and each principle is anchored to a real available work.
 * It complements, and does not repeat, the two style essays already published (blue abstract
 * landscapes; minimalist landscape painting) and the landscape collection shop page.
 */
const CHOOSING_ORIGINAL: EditorialInput = {
  slug: "how-to-choose-an-original-painting-for-your-space",
  title: "How to Choose an Original Painting for Your Space",
  excerpt:
    "A painter's guide to choosing an original oil painting for a home or interior — scale, light, colour and where to begin — with examples from the studio.",
  coverImage: "/img/artwork/79/0",
  coverImageAlt: "No Measure for Distance — a large original oil landscape by Ani Muradyan",
  publishedAt: "2026-08-25T09:00:00.000Z",
  body: [
    "A painting is the one thing in a room that keeps changing after you have stopped arranging everything else. Furniture settles into its use; a good painting does not. It answers the morning differently from the evening, and it goes on doing that for as long as you live with it. So choosing one is less like buying an object and more like choosing something to have a long conversation with.",
    "I am a painter, not a salesperson, and this is the advice I give people who write to me before they have decided anything. It is meant to be useful whether you buy a painting from me, from someone else, or simply look for a while longer.",
    "## Start with the wall, then the feeling",
    "The most common mistake is choosing a painting the size of the space you noticed, rather than the space the painting needs. A work wants a little silence around it — wall it can breathe into. As a rough guide, a single painting reads best when it fills roughly two-thirds of the open wall above a sofa, a console or a bed, hung so its centre sits near eye level, not floating up by the ceiling.",
    "Large does not mean loud. An open landscape can make a wall feel further away rather than fuller, because the eye travels into it.",
    ":artwork[No Measure for Distance]",
    "A work on this scale sets the temperature of a room. If you have one wide, quiet wall — the kind that usually gets a mirror by default — that is where a painting like this belongs.",
    "## Let the light do half the work",
    "Oil paint holds light in a way a print cannot. The surface is not flat: it catches the low sun in the morning and goes deep and still under a lamp at night, so the painting you hang is really several paintings across a day. This is the single best reason to choose an original, and the reason it matters where you put it.",
    "Hang a painting on the wall that faces your main window and it will be lit, softly and for free, for most of the day. Avoid hanging directly opposite harsh afternoon glare, which flattens everything, and never in permanent shadow, which wastes the very thing you paid for.",
    ":artwork[Before Leaving]",
    "A quiet, atmospheric work like this asks for that changing daylight. It is built out of weather and hour; give it a wall where the light actually moves.",
    "## Colour is atmosphere, not decoration",
    "You do not need a painting to match your room, and the ones that match too neatly tend to disappear into it within a month. What you want is a painting whose colour changes how the room *feels* — warmer, calmer, more open — rather than one that repeats a cushion.",
    "A useful test: look at the painting's quietest colour, not its loudest. That undertone is what you will actually live with. A landscape carried by soft greens and greys will settle a busy room; one with a warm note running through it will lift a cool north-facing space.",
    ":artwork[Road to Tuscany]",
    "If your space can take a little more warmth and movement, a work with real colour in it earns its place — not by shouting, but by giving the room somewhere to go.",
    "## Original, not printed — what you are actually choosing",
    "It is worth being clear about the difference, because it is the whole point. A print is an image of a painting. An original is the painting: the surface the brush actually moved across, the one that exists nowhere else, thick where the hand pressed and thin where it lifted. When you stand close, that is what you see, and no reproduction carries it.",
    "Every painting on this site is an original, one of a kind, in oil. There is a real advantage in that beyond the pleasure of it — an original holds its meaning, and often its value, in a way an edition of five hundred cannot.",
    "## You do not need a large wall to begin",
    "Collecting original art does not start with a statement piece over the fireplace. Some of the most-loved works in a home are small — a painting by a reading chair, on a shelf, in the narrow wall of a hallway you pass a dozen times a day. A smaller original is not a lesser one; it is often where the long conversation actually begins.",
    ":artwork[Red Barn]",
    "An intimate work like this is a real place to start — the same paint, the same hand, a size that fits a life already full of furniture.",
    "## If nothing is quite right, there is the commission",
    "Sometimes the wall, the light and the feeling are clear but the exact painting is not on the site yet. That is what a commission is for — not a bespoke product to a brief, but a conversation about what a space needs and whether it is something I would genuinely paint. If you are working on an interior or a project and want to talk it through, [that is the best way to begin](/contact).",
    "## Where to look next",
    "If you would like to keep looking, the landscapes are the clearest place to start — they are the heart of the work and the pieces most often chosen for a home or an interior. You can see the available [contemporary landscape paintings](/collections/landscape-paintings), browse [every original](/artworks), or [write to me](/contact) about a particular wall, a project, or a commission. There is no rush in it. A painting you choose slowly is one you keep.",
  ].join("\n\n"),
};

export const EDITORIAL_ARTICLES: readonly BlogPost[] = [editorial(CHOOSING_ORIGINAL, 0)];

/** Slugs owned by editorial code — so the merge never lets a DB row shadow one, or vice versa. */
export const EDITORIAL_SLUGS: ReadonlySet<string> = new Set(EDITORIAL_ARTICLES.map((a) => a.slug));

/** Merge code articles into a database list, newest first, without duplicating a slug. */
export function withEditorialArticles(dbPosts: readonly BlogPost[], includeDrafts = false): BlogPost[] {
  void includeDrafts; // editorial articles are always published; kept for signature parity
  const dbSlugs = new Set(dbPosts.map((p) => p.slug));
  const extra = EDITORIAL_ARTICLES.filter((a) => !dbSlugs.has(a.slug));
  return [...dbPosts, ...extra].sort((a, b) => {
    const at = (a.publishedAt ?? a.createdAt)?.getTime() ?? 0;
    const bt = (b.publishedAt ?? b.createdAt)?.getTime() ?? 0;
    return bt - at;
  });
}

/** Look up a code article by slug (used to answer getBlogPostBySlug without a DB row). */
export function editorialArticleBySlug(slug: string): BlogPost | undefined {
  return EDITORIAL_ARTICLES.find((a) => a.slug === slug);
}
