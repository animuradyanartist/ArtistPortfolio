/**
 * THE COVER AN ARTICLE ALREADY IMPLIES.
 *
 * Every article names the works it discusses, as `:artwork[Title]` directives the renderer
 * resolves against live artwork rows. So an article that needs a cover image almost always
 * already contains the answer, and asking the owner to attach one by hand is asking her to
 * restate something the body has said — which is exactly the manual step Career OS is meant
 * to remove.
 *
 * The rule is deliberately dull:
 *
 *   1. An explicit `coverImage` wins. Intent beats inference, always.
 *   2. Otherwise the FIRST named work that actually resolves becomes the cover.
 *   3. Otherwise there is no cover, and the layout says so by omitting it.
 *
 * "Actually resolves" is doing real work in step 2. A title the writer invented, or one for
 * a work that has since been removed, returns nothing — and nothing is the correct answer.
 * A placeholder standing in for a painting would be a fabricated image on an artist's
 * portfolio, which is worse than a text-only card by a wide margin.
 *
 * NOTHING IS DUPLICATED INTO THE ARTICLE. The image URL, canonical link, alt text and
 * caption are all resolved at render time from the artwork row, through the same
 * `artworkFigure` the inline figures use. Re-photograph a painting or correct its
 * dimensions and every cover that shows it is correct on the next request, with no article
 * edited.
 *
 * PURE. No DOM, no server APIs — importable from the reader, the SSR shell and the admin.
 */

import { artworkFigure, artworkFigureById, artworkIdFromImageUrl, citedArtworkTitles, type ArtworkFigure, type FigureArtwork } from "./articleMarkdown";

export interface CoverResolvers {
  canonicalPath: (a: FigureArtwork) => string;
  imageUrl: (a: FigureArtwork) => string;
}

export interface ArticleLike {
  body?: string | null;
  coverImage?: string | null;
  coverImageAlt?: string | null;
}

export type ArticleCover =
  | {
      kind: "explicit";
      imageUrl: string;
      /** Empty when the owner wrote none — an empty alt tells a screen reader to skip it. */
      alt: string;
      /** An explicitly-set image is not known to be a work, so it links nowhere. */
      href: null;
      caption: null;
      status: null;
    }
  | ({ kind: "artwork" } & ArtworkFigure)
  | { kind: "none" };

/**
 * Resolve the cover for one article.
 *
 * Returns `{ kind: "none" }` rather than throwing or guessing. Callers render the text-only
 * form for that case; every layout here has one, because an article whose works were all
 * removed must still be readable.
 */
export function resolveArticleCover(
  article: ArticleLike,
  artworks: FigureArtwork[],
  resolve: CoverResolvers,
): ArticleCover {
  const explicit = article.coverImage?.trim();
  if (explicit) {
    // AN EXPLICIT COVER THAT IS ONE OF OUR OWN PAINTINGS IS STILL A PAINTING.
    //
    // "Explicit wins" was written when the only way a cover got set was the owner pasting a
    // URL, where there is nothing to credit and nowhere to link. Career OS then began sending
    // `coverImage` with every draft it writes — always `/img/artwork/:id/:idx`, always one of
    // her works — and each of those articles silently lost its credit line, its link to the
    // painting and, on a sold work, the "In a private collection" note that stops the caption
    // reading as an offer.
    //
    // Found on draft 4: the cover rendered as a bare image while the three figures below it,
    // resolved from the same rows, each carried a title, a link and a status.
    //
    // Resolved BY ID, never by title: seven of her works exist twice, once migrated and once
    // not, so a title lookup can hand back the other row and quietly change which painting
    // the cover credits.
    //
    // Intent still beats inference — this does not choose a different cover, it only says
    // what the chosen one is. A genuinely external URL still resolves to "explicit" below.
    const ownId = artworkIdFromImageUrl(explicit);
    if (ownId !== null) {
      const fig = artworkFigureById(ownId, artworks, resolve);
      if (fig) return { kind: "artwork", ...fig };
    }

    return {
      kind: "explicit",
      imageUrl: explicit,
      alt: article.coverImageAlt?.trim() ?? "",
      href: null,
      caption: null,
      status: null,
    };
  }

  for (const title of citedArtworkTitles(article.body ?? "")) {
    const fig = artworkFigure(title, artworks, resolve);
    // Skip a named work that is not hers or no longer exists, and try the next one — the
    // first RESOLVABLE work, not merely the first named.
    if (fig) return { kind: "artwork", ...fig };
  }

  return { kind: "none" };
}

/** Convenience for the common "is there a picture to show?" branch. */
export function hasCoverImage(cover: ArticleCover): cover is Exclude<ArticleCover, { kind: "none" }> {
  return cover.kind !== "none";
}
