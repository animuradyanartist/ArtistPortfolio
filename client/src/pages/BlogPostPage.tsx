import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import type { BlogPost, Artwork } from "@shared/schema";
import { updateCanonicalUrl, updateMetaDescription } from "@/lib/seo";
import { ArticleBody } from "@/components/ArticleBody";
import { CoverImage, CoverCredit, coverFor } from "@/components/ArticleCover";
import type { FigureArtwork } from "@shared/articleMarkdown";

/**
 * ONE ARTICLE.
 *
 * The reading column is deliberately narrow — around 68 characters at the body size, which
 * is where the eye stops losing its place returning to the left margin. The cover, and the
 * artwork figures inside the body, are allowed to break wider than the text, because a
 * painting constrained to a text measure looks like an illustration of the writing rather
 * than the subject of it.
 *
 * The body still renders through ArticleBody, over blocks parsed by shared/articleMarkdown.
 * That is the whole point of the shared renderer: this page changes how an article LOOKS and
 * cannot change what it SAYS, so the admin preview, this page and the crawlable server shell
 * continue to agree.
 *
 * The cover is resolved, not stored: the first artwork the article names, through the same
 * resolver the index uses.
 */
export default function BlogPostPage() {
  const [, params] = useRoute("/blog/:slug");
  const slug = params?.slug ?? "";

  const { data: post, isLoading, isError } = useQuery<BlogPost>({
    queryKey: [`/api/blog/${slug}`],
    enabled: Boolean(slug),
  });
  const { data: artworks = [] } = useQuery<Artwork[]>({ queryKey: ["/api/artworks"] });
  const works = artworks as unknown as FigureArtwork[];

  useEffect(() => {
    if (!post) return;
    document.title = `${post.title} — Ani Muradyan`;
    updateCanonicalUrl(`/blog/${post.slug}`);
    updateMetaDescription(post.excerpt);
  }, [post]);

  const published = post?.publishedAt ?? post?.createdAt;
  const cover = post ? coverFor(post, works) : { kind: "none" as const };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f5f1ea]">
        <p className="px-6 pt-28 text-center text-stone-500">Loading…</p>
      </div>
    );
  }

  if (isError || !post) {
    return (
      <div className="min-h-screen bg-[#f5f1ea]">
        <div className="px-6 pt-28 pb-24 max-w-2xl mx-auto">
          <h1 className="font-playfair text-3xl text-stone-900 mb-4">Not found</h1>
          <p className="text-stone-600">
            That article isn&apos;t here.{" "}
            <Link href="/blog"><a className="underline underline-offset-4">See all writing</a></Link>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      <article className="pb-24">
        {/* ── TITLE BLOCK ────────────────────────────────────────────────
            Centred and given room. The date sits above the title as a quiet
            tracked line rather than below it as metadata debris. */}
        <header className="px-6 pt-20 md:pt-28 pb-10 md:pb-14 max-w-3xl mx-auto text-center">
          {published && (
            <p className="text-[11px] tracking-[0.28em] uppercase text-stone-500 mb-6">
              <time dateTime={new Date(published).toISOString()}>
                {new Date(published).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </time>
              <span className="mx-2 text-stone-400">·</span>
              Ani Muradyan
            </p>
          )}
          <h1 className="font-playfair text-4xl md:text-5xl lg:text-[3.25rem] leading-[1.1] text-stone-900">
            {post.title}
          </h1>
        </header>

        {/* ── COVER ──────────────────────────────────────────────────────
            Wider than the reading column, narrower than the page. Absent
            entirely when no named work resolves — never a placeholder. */}
        {cover.kind !== "none" && (
          <figure className="px-6 mb-14 md:mb-20">
            <div className="mx-auto max-w-5xl">
              <CoverImage cover={cover} aspect="aspect-[16/9]" sizes="(min-width: 1024px) 64rem, 100vw" priority />
              <figcaption className="mx-auto max-w-5xl">
                <CoverCredit cover={cover} />
              </figcaption>
            </div>
          </figure>
        )}

        {/* ── STANDFIRST ─────────────────────────────────────────────────
            The excerpt, set larger than the body and separated by a rule, so
            it reads as an introduction rather than as a first paragraph that
            happens to repeat the meta description. */}
        <div className="px-6">
          <div className="mx-auto max-w-[38rem]">
            <p className="font-playfair text-xl md:text-[1.4rem] leading-[1.6] text-stone-700">
              {post.excerpt}
            </p>
            <hr className="my-10 md:my-12 border-0 border-t border-stone-300/70" />

            {/* The shared renderer. Styling differs from the admin preview; meaning cannot. */}
            <ArticleBody body={post.body} artworks={works} variant="reader" />
          </div>
        </div>

        {/* ── FOOT ───────────────────────────────────────────────────────
            Two quiet ways onward, in the site's own link idiom. */}
        <nav className="px-6 mt-20">
          <div className="mx-auto max-w-[38rem] border-t border-stone-300/70 pt-8 flex flex-wrap gap-x-8 gap-y-3">
            <Link href="/blog">
              <a className="text-[11px] tracking-[0.2em] uppercase text-stone-700 border-b border-stone-400 pb-1 hover:border-stone-800 hover:text-stone-900 transition-colors">
                All writing
              </a>
            </Link>
            <Link href="/artworks">
              <a className="text-[11px] tracking-[0.2em] uppercase text-stone-700 border-b border-stone-400 pb-1 hover:border-stone-800 hover:text-stone-900 transition-colors">
                See the paintings
              </a>
            </Link>
          </div>
        </nav>
      </article>
    </div>
  );
}
