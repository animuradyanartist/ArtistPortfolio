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

import { artworkFigure, citedArtworkTitles, type ArtworkFigure, type FigureArtwork } from "./articleMarkdown";

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
