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
 *
 * ONE GRID, AND THE PAINTINGS DO NOT GET A VOTE IN IT.
 *
 * Her works are 79x71, 89x79, 119x99 — every one a different shape. A card that takes its
 * proportions from its picture therefore produces a different card every time, and a page of
 * them reads as an accident. So the frame is fixed and the painting is cropped into it:
 *
 *   COVER      3:2, everywhere, feature included. The feature leads by the WIDTH of its
 *              column, never by a different shape — two ratios on one page is the thing that
 *              made this look assembled rather than composed.
 *   DATE       uppercase, tracked, directly above the title. Same position in every entry.
 *   TITLE      clamped to two lines in the list, three in the feature, in a reserved box, so
 *              a seven-word title and a two-word title leave the excerpt at the same height.
 *   EXCERPT    clamped to three lines in a reserved box, for the same reason.
 *   READ       lands at one height per row because everything above it is a fixed height.
 *
 * The reserved boxes are what make the rows align. Clamping alone equalises the MAXIMUM;
 * `min-h` equalises the minimum too, so a one-line excerpt holds the same space as a three-
 * line one and the row stays level. Empty space under a short entry is the grid working, not
 * a gap to close — the same reservation a printed catalogue makes.
 *
 * The list is two columns from `sm` at every length. It used to become two columns only at
 * four articles, which meant publishing a fourth piece silently resized the previous three.
 */
export default function BlogPage() {
  useEffect(() => {
    document.title = "Writing by Ani Muradyan — Notes on Oil Painting & Process";
    updateCanonicalUrl("/blog");
    updateMetaDescription(
      "Notes on oil painting, process and the work — by Armenian contemporary artist Ani Muradyan.",
    );
  }, []);

  const { data: posts = [], isLoading, status } = useQuery<BlogPost[]>({ queryKey: ["/api/blog"] });
  const { data: artworks = [] } = useQuery<Artwork[]>({ queryKey: ["/api/artworks"] });
  const works = artworks as unknown as FigureArtwork[];

  // KEEP THE PRERENDERED BLOCK UNTIL THIS LIST IS POPULATED, THEN REMOVE IT — the same rule
  // ArtworksPage applies to `#artworks-ssr`, which this page never got.
  //
  // The server injects `#blog-ssr` before `#root` so a first-wave crawler sees real articles
  // without running JavaScript. It was never taken down again, so in production the finished
  // page carried 462px of unstyled system-font links above the design, and TWO <h1>s —
  // "Writing by Ani Muradyan" from the fallback and "Notes" from this component.
  //
  // Removed rather than hidden, for the reason ArtworksPage gives: `display:none` would leave
  // the second heading in the DOM for anything reading the rendered page. Removing it means
  // there is exactly one <h1> either way — the prerendered one before hydration, this one
  // after. Nothing a crawler sees is taken away; it is handed over.
  useEffect(() => {
    const ssr = document.getElementById("blog-ssr");
    if (!ssr) return;
    if (status === "success" && posts.length > 0) ssr.remove();
    else ssr.style.display = "";
  }, [status, posts.length]);

  const dateOf = (p: BlogPost) => {
    const d = p.publishedAt ?? p.createdAt;
    return d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
  };
  const isoOf = (p: BlogPost) => {
    const d = p.publishedAt ?? p.createdAt;
    return d ? new Date(d).toISOString() : undefined;
  };

  const [featured, ...rest] = posts;

  // ONE RHYTHM, TWO SIZES. The feature is the larger of the two, and larger by one step at
  // each interval rather than by an arbitrary amount — so the two blocks read as the same
  // system at different scales instead of as two different designs.
  //
  // The `min-h` values are the clamp expressed as space: 2 lines of `leading-snug` (1.375)
  // is 2.75em, 3 lines of `leading-relaxed` (1.625) is 4.875em. Keep them in step with the
  // leading if either changes, or the reservation stops matching what it reserves for.
  const TITLE_BOX = "line-clamp-2 min-h-[2.75em]";
  const EXCERPT_BOX = "line-clamp-3 min-h-[4.875em]";

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
                      aspect="aspect-[3/2]"
                      sizes="(min-width: 768px) 58vw, 100vw"
                      priority
                    />
                  </div>
                  <div className="mt-6 md:mt-0 md:col-span-5">
                    <p className="text-[11px] tracking-[0.28em] uppercase text-stone-500 mb-4">
                      <time dateTime={isoOf(featured!)}>{dateOf(featured!)}</time>
                    </p>
                    {/* Three lines, not seven. In a five-column well a long title ran to seven
                        lines and pushed the excerpt off the picture entirely. */}
                    <h2 className="font-playfair text-3xl md:text-4xl lg:text-[2.75rem] leading-[1.15] text-stone-900 group-hover:text-stone-700 transition-colors duration-300 line-clamp-3">
                      {featured!.title}
                    </h2>
                    <p className={`mt-4 text-stone-600 text-lg leading-relaxed ${EXCERPT_BOX}`}>{featured!.excerpt}</p>
                    <span className="mt-6 inline-block text-[11px] tracking-[0.2em] uppercase text-stone-700 border-b border-stone-400 pb-1 group-hover:border-stone-800 group-hover:text-stone-900 transition-colors">
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
                  {/* Two columns from `sm`, at two articles and at twenty. The old rule
                      switched to two columns only at four, so publishing a fourth piece
                      resized the three already on the page. */}
                  <ul className="grid gap-x-12 gap-y-14 sm:grid-cols-2 lg:gap-x-16">
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
                              <h3 className={`font-playfair text-2xl md:text-[1.75rem] leading-snug text-stone-900 group-hover:text-stone-700 transition-colors ${TITLE_BOX}`}>
                                {post.title}
                              </h3>
                              <p className={`mt-3 text-stone-600 leading-relaxed ${EXCERPT_BOX}`}>{post.excerpt}</p>
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
