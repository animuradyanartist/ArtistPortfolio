import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { BlogPost, Artwork } from "@shared/schema";
import { updateCanonicalUrl, updateMetaDescription } from "@/lib/seo";
import { Eyebrow } from "@/components/editorial";
import { CoverImage, CoverCredit, coverFor } from "@/components/ArticleCover";
import type { FigureArtwork } from "@shared/articleMarkdown";

/**
 * WRITING — the index.
 *
 * The problem this replaces: one published article rendered as a single small row inside a
 * very large empty page, which read as an accident rather than a decision. A portfolio with
 * one essay should look like a portfolio with one essay, not like a blog waiting for
 * content.
 *
 * So the newest piece is presented as a FEATURE — a large work-led composition where the
 * painting carries most of the visual weight — and everything after it falls into a quiet
 * editorial list. That shape is not a special case for having one article: it is the same
 * hierarchy a printed catalogue uses, and it stays correct at two, ten and thirty. Nothing
 * here needs revisiting when the library grows; the feature stays one, the list absorbs the
 * rest, and at four or more the list becomes two columns because the rows would otherwise
 * grow uncomfortably wide.
 *
 * The covers are not uploaded. Each is resolved from the first artwork the article itself
 * names — see shared/articleCover — so a new piece arrives with the right picture already
 * attached, and no article stores an image URL that could go stale.
 */
export default function BlogPage() {
  useEffect(() => {
    document.title = "Writing by Ani Muradyan — Notes on Oil Painting & Process";
    updateCanonicalUrl("/blog");
    updateMetaDescription(
      "Notes on oil painting, process and the work — by Armenian contemporary artist Ani Muradyan.",
    );
  }, []);

  const { data: posts = [], isLoading } = useQuery<BlogPost[]>({ queryKey: ["/api/blog"] });
  const { data: artworks = [] } = useQuery<Artwork[]>({ queryKey: ["/api/artworks"] });
  const works = artworks as unknown as FigureArtwork[];

  const dateOf = (p: BlogPost) => {
    const d = p.publishedAt ?? p.createdAt;
    return d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
  };
  const isoOf = (p: BlogPost) => {
    const d = p.publishedAt ?? p.createdAt;
    return d ? new Date(d).toISOString() : undefined;
  };

  const [featured, ...rest] = posts;

  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      <section className="px-6 pt-20 md:pt-28 pb-14 md:pb-20 text-center">
        <Eyebrow>Writing</Eyebrow>
        <h1 className="font-playfair text-5xl md:text-6xl text-stone-900 mb-5">Notes</h1>
        <p className="mx-auto max-w-2xl text-stone-600 text-lg leading-relaxed">
          On oil painting, process, and the work — written between the studio and the easel.
        </p>
      </section>

      {isLoading ? (
        <p className="px-6 pb-24 text-center text-stone-500">Loading…</p>
      ) : posts.length === 0 ? (
        <p className="px-6 pb-24 text-center text-stone-500">
          Nothing published yet — the first notes are on their way.
        </p>
      ) : (
        <>
          {/* ── THE FEATURE ─────────────────────────────────────────────────
              Two columns on desktop, the picture given the larger share so the
              work leads and the words follow. Stacks on mobile in reading order:
              picture, date, title, excerpt. */}
          <section className="px-6 pb-16 md:pb-24">
            <article className="mx-auto max-w-6xl">
              <Link href={`/blog/${featured!.slug}`}>
                <a className="group block md:grid md:grid-cols-12 md:gap-12 lg:gap-16 md:items-center">
                  <div className="md:col-span-7">
                    <CoverImage
                      cover={coverFor(featured!, works)}
                      aspect="aspect-[4/3]"
                      sizes="(min-width: 768px) 58vw, 100vw"
                      priority
                    />
                  </div>
                  <div className="mt-7 md:mt-0 md:col-span-5">
                    <p className="text-[11px] tracking-[0.28em] uppercase text-stone-500 mb-4">
                      <time dateTime={isoOf(featured!)}>{dateOf(featured!)}</time>
                    </p>
                    <h2 className="font-playfair text-3xl md:text-4xl lg:text-[2.75rem] leading-[1.15] text-stone-900 group-hover:text-stone-700 transition-colors duration-300">
                      {featured!.title}
                    </h2>
                    <p className="mt-5 text-stone-600 text-lg leading-relaxed">{featured!.excerpt}</p>
                    <span className="mt-7 inline-block text-[11px] tracking-[0.2em] uppercase text-stone-700 border-b border-stone-400 pb-1 group-hover:border-stone-800 group-hover:text-stone-900 transition-colors">
                      Read
                    </span>
                  </div>
                </a>
              </Link>
              {/* Outside the link: the painting has its own page, and a link inside a link
                  is not something a keyboard or a screen reader can express. */}
              <div className="md:grid md:grid-cols-12 md:gap-12 lg:gap-16">
                <div className="md:col-span-7">
                  <CoverCredit cover={coverFor(featured!, works)} />
                </div>
              </div>
            </article>
          </section>

          {/* ── THE REST ────────────────────────────────────────────────────
              A quiet list at two or three; two columns from four, where single
              rows would otherwise stretch too wide to scan. */}
          {rest.length > 0 && (
            <section className="px-6 pb-24">
              <div className="mx-auto max-w-6xl">
                <div className="border-t border-stone-300/70 pt-12">
                  <ul className={rest.length >= 4
                    ? "grid gap-x-12 gap-y-14 sm:grid-cols-2 lg:gap-x-16"
                    : "space-y-14 max-w-3xl"}>
                    {rest.map((post) => {
                      const cover = coverFor(post, works);
                      return (
                        <li key={post.id}>
                          <Link href={`/blog/${post.slug}`}>
                            <a className="group block">
                              <CoverImage
                                cover={cover}
                                aspect="aspect-[3/2]"
                                sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
                                className="mb-6"
                              />
                              <p className="text-[11px] tracking-[0.28em] uppercase text-stone-500 mb-3">
                                <time dateTime={isoOf(post)}>{dateOf(post)}</time>
                              </p>
                              <h3 className="font-playfair text-2xl md:text-[1.75rem] leading-snug text-stone-900 group-hover:text-stone-700 transition-colors">
                                {post.title}
                              </h3>
                              <p className="mt-3 text-stone-600 leading-relaxed">{post.excerpt}</p>
                              <span className="mt-5 inline-block text-[11px] tracking-[0.2em] uppercase text-stone-700 border-b border-stone-400 pb-1 group-hover:border-stone-800 transition-colors">
                                Read
                              </span>
                            </a>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
