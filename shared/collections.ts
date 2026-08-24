/**
 * BUYER-INTENT COLLECTION PAGES — the commercial surfaces the site did not have.
 *
 * Search Console shows the property appears for exactly one thing: the artist's own name.
 * There is no non-brand demand reaching the site, and there is no PAGE for a buyer searching
 * the way buyers actually search — by what they want to hang, not by whose name it is.
 * "contemporary landscape paintings", "original oil landscape for sale", "large original
 * painting". /artworks classifies works into landscape/figurative, but only in the browser:
 * the tabs are React state with no URL, so a search engine sees one page, never a collection.
 *
 * A collection is a REAL, INDEXABLE URL for a slice of the catalogue a buyer with intent would
 * search for. It is backed by actual inventory — it renders the available works it describes —
 * so it is a shop surface, not a doorway. It is the host page those artworks' images need to
 * enter Google Images, and it is a factual, structured inventory an AI assistant can cite.
 *
 * PURE and shared, so the server prerender, the React page, the sitemap and the tests agree on
 * exactly which works belong to a collection and what the page claims — the same discipline as
 * artworkAddress.ts and publicRoutes.ts.
 */

export interface CollectionArtwork {
  title: string;
  description?: string | null;
  medium?: string | null;
  size?: string | null;
  availability?: string | null;
}

export interface CollectionDef {
  /** URL segment: /collections/<slug>. Chosen to read as the buyer's own words. */
  slug: string;
  /** <h1> and the primary keyword the page targets. */
  heading: string;
  /** <title>. Commercial-intent, honest, no stuffing. */
  title: string;
  metaDescription: string;
  /** The buyer this page is for, in one sentence of real copy (rendered as the lead). */
  intro: string;
  /** Which works belong. PURE — reads only stable fields, never mutates. */
  predicate: (a: CollectionArtwork) => boolean;
}

const norm = (a: CollectionArtwork) =>
  `${a.title ?? ""} ${a.description ?? ""}`.toLowerCase();

/**
 * Landscape cues, mirroring client/src/lib/artworkCategory.ts so this page and the /artworks
 * "Landscape" tab describe the same body of work. collections.test.ts asserts the two agree on
 * the real catalogue, so they cannot silently drift.
 */
export const LANDSCAPE_WORDS: readonly string[] = [
  "landscape", "horizon", "valley", "field", "meadow", "hill", "mountain", "barn", "road",
  "path", "pathway", "drift", "voyage", "gold", "dawn", "dusk", "evening", "morning",
  "afternoon", "winter", "autumn", "summer", "spring", "sky", "sea", "coast", "shore",
  "village", "homeward", "sunset", "sunrise", "pastel voyage",
];

export function isLandscape(a: CollectionArtwork): boolean {
  const t = norm(a);
  return LANDSCAPE_WORDS.some((w) => t.includes(w));
}

export const COLLECTIONS: readonly CollectionDef[] = [
  {
    slug: "landscape-paintings",
    heading: "Contemporary Landscape Paintings",
    title: "Contemporary Landscape Paintings for Sale — Original Oils by Ani Muradyan",
    metaDescription:
      "Original contemporary landscape paintings by Armenian artist Ani Muradyan — atmospheric oils on canvas, available to collectors and shipped worldwide.",
    intro:
      "Original, atmospheric landscape paintings in oil — quiet horizons, roads and open distance, made to hold a room rather than decorate it. Each is a one-of-a-kind work, available to collectors and shipped worldwide from the artist's studio.",
    predicate: isLandscape,
  },
];

export function collectionBySlug(slug: string): CollectionDef | undefined {
  return COLLECTIONS.find((c) => c.slug === slug);
}

/** The works a collection page renders: its members, available first, sold shown as collected. */
export function collectionMembers<T extends CollectionArtwork>(def: CollectionDef, all: readonly T[]): T[] {
  const members = all.filter((a) => def.predicate(a));
  const rank = (a: T) => (a.availability === "available" ? 0 : 1);
  return [...members].sort((a, b) => rank(a) - rank(b));
}
