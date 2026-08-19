/**
 * THE ONE PLACE AN ARTICLE BODY BECOMES ELEMENTS.
 *
 * The public reader and the admin preview each had their own copy of the Markdown subset,
 * and the preview's was the poorer of the two — no links, no bold, no quotations — so a
 * Career OS draft reached the owner showing "[Title](/artworks/…)" as literal text. The
 * screen she approves from was the least faithful in the system.
 *
 * Both surfaces now render this component, over blocks parsed by shared/articleMarkdown.
 * They may style differently; they cannot disagree about what the article SAYS.
 */
import { Link } from "wouter";
import { artworkCanonicalPath } from "@shared/canonical";
import { artworkFigure, parseArticle, parseInline, type FigureArtwork } from "@shared/articleMarkdown";

/** Matches the server's resolution: the stored absolute URL, else this site's image route. */
function imageUrlFor(a: FigureArtwork): string {
  const first = Array.isArray(a.images) ? a.images.find((i) => typeof i === "string" && i.trim()) : null;
  return first && /^https?:\/\//i.test(first) ? first : `/img/artwork/${a.id}/0`;
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((n, i) => {
        if (n.kind === "strong") return <strong key={i}>{n.text}</strong>;
        if (n.kind === "link") {
          return n.href.startsWith("/") ? (
            <Link key={i} href={n.href} className="underline underline-offset-4 text-stone-800 hover:text-stone-950">
              {n.text}
            </Link>
          ) : (
            <a key={i} href={n.href} rel="noopener noreferrer" className="underline underline-offset-4 text-stone-800">
              {n.text}
            </a>
          );
        }
        return <span key={i}>{n.text}</span>;
      })}
    </>
  );
}

export interface ArticleBodyProps {
  body: string;
  /** Live artwork rows. A named work resolves against these at render time. */
  artworks?: FigureArtwork[];
  /** Admin preview uses tighter type; the reader uses the site's editorial scale. */
  variant?: "reader" | "preview";
}

export function ArticleBody({ body, artworks = [], variant = "reader" }: ArticleBodyProps) {
  const reader = variant === "reader";
  const h2 = reader ? "font-playfair text-2xl md:text-3xl mt-12 mb-3 text-stone-900" : "text-2xl font-bold text-slate-900 mt-8 mb-3";
  const h3 = reader ? "font-playfair text-xl mt-8 mb-2 text-stone-900" : "text-xl font-bold text-slate-900 mt-8 mb-3";
  const p = reader ? "text-stone-700 leading-relaxed mb-6 text-[1.05rem]" : "text-slate-700 leading-relaxed mb-4";
  const ul = reader ? "list-disc pl-6 space-y-2 mb-6 text-stone-700 leading-relaxed" : "list-disc pl-6 text-slate-700 mb-4";

  return (
    <>
      {parseArticle(body).map((b, i) => {
        if (b.kind === "heading") {
          const Tag = b.level === 2 ? "h2" : "h3";
          return <Tag key={i} className={b.level === 2 ? h2 : h3}><Inline text={b.text} /></Tag>;
        }
        if (b.kind === "list") {
          return (
            <ul key={i} className={ul}>
              {b.items.map((item, j) => <li key={j}><Inline text={item} /></li>)}
            </ul>
          );
        }
        if (b.kind === "quote") {
          // Her words, set apart. Previously these rendered as a paragraph beginning ">".
          return (
            <blockquote key={i} className="border-l-2 border-stone-400 pl-5 my-8 italic text-stone-700">
              {b.paragraphs.map((q, j) => (
                <p key={j} className={j === b.paragraphs.length - 1 ? "" : "mb-4"}><Inline text={q} /></p>
              ))}
            </blockquote>
          );
        }
        if (b.kind === "artwork") {
          const fig = artworkFigure(b.title, artworks, {
            canonicalPath: (a) => artworkCanonicalPath({ id: a.id, title: a.title, seoSlug: a.seoSlug ?? null }),
            imageUrl: imageUrlFor,
          });
          // Unknown title: render nothing. Never invent an image or a URL.
          if (!fig) return null;
          return (
            <figure key={i} className="my-10">
              <Link href={fig.href} className="block">
                <img
                  src={fig.imageUrl}
                  alt={fig.alt}
                  loading="lazy"
                  className="w-full h-auto rounded-lg border border-stone-200"
                />
              </Link>
              <figcaption className="mt-3 text-sm text-stone-500">
                <Link href={fig.href} className="underline underline-offset-4 text-stone-700 hover:text-stone-900">
                  {fig.title}
                </Link>
                {fig.caption.slice(fig.title.length) /* " · medium · dims · year" */}
                {fig.status ? <span className="block mt-0.5 text-stone-400">{fig.status}</span> : null}
              </figcaption>
            </figure>
          );
        }
        return <p key={i} className={p}><Inline text={b.text} /></p>;
      })}
    </>
  );
}

export default ArticleBody;
