/**
 * An article's cover, resolved from the work it already names.
 *
 * Shared by the index and the article page so a cover cannot mean two different things in
 * two places, and so the "no resolvable artwork" branch is written once.
 */
import { Link } from "wouter";
import { artworkCanonicalPath } from "@shared/canonical";
import { resolveArticleCover, type ArticleLike, type ArticleCover as Cover } from "@shared/articleCover";
import type { FigureArtwork } from "@shared/articleMarkdown";

/** Matches the server's resolution: the stored absolute URL, else this site's image route. */
export function imageUrlFor(a: FigureArtwork): string {
  const first = Array.isArray(a.images) ? a.images.find((i) => typeof i === "string" && i.trim()) : null;
  return first && /^https?:\/\//i.test(first) ? first : `/img/artwork/${a.id}/0`;
}

export function coverFor(article: ArticleLike, artworks: FigureArtwork[]): Cover {
  return resolveArticleCover(article, artworks, {
    canonicalPath: (a) => artworkCanonicalPath({ id: a.id, title: a.title, seoSlug: a.seoSlug ?? null }),
    imageUrl: imageUrlFor,
  });
}

/**
 * The picture itself.
 *
 * `aspect` is fixed by the caller rather than the image, so a row of covers keeps its
 * rhythm whatever shape the paintings are — and, more importantly, so the space is reserved
 * before the image loads and the text below never jumps.
 *
 * `object-cover` is a deliberate compromise on a portfolio: it can crop a painting. The
 * aspects chosen here are wide-but-not-extreme (4:3 and 3:2) precisely so a landscape work
 * loses very little, and the full, uncropped painting is always one click away on its own
 * page. A `contain` fit would letterbox instead, which reads as a broken layout rather than
 * as respect for the work.
 */
export function CoverImage({
  cover, aspect, className = "", sizes, priority = false,
}: {
  cover: Cover;
  aspect: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  if (cover.kind === "none") return null;
  return (
    <div className={`${aspect} overflow-hidden bg-stone-200/60 ${className}`}>
      <img
        src={cover.imageUrl}
        alt={cover.alt}
        sizes={sizes}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        // A slow, small scale on hover: the work moves, the layout does not.
        className="h-full w-full object-cover transition-transform duration-[1200ms] motion-reduce:transition-none ease-out group-hover:scale-[1.03]"
      />
    </div>
  );
}

/** The line under a cover that names the painting — only when the cover IS a painting. */
export function CoverCredit({ cover }: { cover: Cover }) {
  if (cover.kind !== "artwork") return null;
  return (
    <p className="mt-3 text-[11px] tracking-[0.14em] uppercase text-stone-500">
      <Link href={cover.href}>
        <a className="border-b border-stone-300 pb-0.5 hover:border-stone-700 hover:text-stone-700 transition-colors">
          {cover.title}
        </a>
      </Link>
      {cover.status ? <span className="ml-2 normal-case tracking-normal text-stone-400">{cover.status}</span> : null}
    </p>
  );
}
