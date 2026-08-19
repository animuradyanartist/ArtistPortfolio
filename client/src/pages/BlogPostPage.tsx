import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import type { BlogPost } from "@shared/schema";
import { updateCanonicalUrl, updateMetaDescription } from "@/lib/seo";
import { ArticleBody } from "@/components/ArticleBody";
import type { Artwork } from "@shared/schema";

/**
 * A single article.
 *
 * The body is Markdown, rendered here with the same small subset the server renders into
 * the crawlable shell — headings, paragraphs, lists, bold, links — so what a person reads
 * and what a crawler indexes are the same article rather than two versions of it.
 */

export default function BlogPostPage() {
  const [, params] = useRoute("/blog/:slug");
  const slug = params?.slug ?? "";

  const { data: post, isLoading, isError } = useQuery<BlogPost>({
    queryKey: [`/api/blog/${slug}`],
    enabled: Boolean(slug),
  });
  const { data: artworks = [] } = useQuery<Artwork[]>({ queryKey: ["/api/artworks"] });

  useEffect(() => {
    if (!post) return;
    document.title = `${post.title} — Ani Muradyan`;
    updateCanonicalUrl(`/blog/${post.slug}`);
    updateMetaDescription(post.excerpt);
  }, [post]);

  const published = post?.publishedAt ?? post?.createdAt;

  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      <article className="px-6 pt-20 md:pt-28 pb-24 max-w-2xl mx-auto">
        {isLoading ? (
          <p className="text-stone-500">Loading…</p>
        ) : isError || !post ? (
          <>
            <h1 className="font-playfair text-3xl text-stone-900 mb-4">Not found</h1>
            <p className="text-stone-600">That article isn&apos;t here. <Link href="/blog"><a className="underline underline-offset-4">See all writing</a></Link>.</p>
          </>
        ) : (
          <>
            {post.coverImage && (
              /* alt is left EMPTY when she wrote none — an empty alt tells a screen reader
                 to skip a decorative image; a title repeated as alt just wastes its time. */
              <img
                src={post.coverImage}
                alt={post.coverImageAlt ?? ""}
                className="w-full rounded-lg mb-8"
              />
            )}
            <h1 className="font-playfair text-4xl md:text-5xl text-stone-900 mb-3">{post.title}</h1>
            {published && (
              <p className="text-stone-500 text-sm mb-8">
                <time dateTime={new Date(published).toISOString()}>
                  {new Date(published).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                </time>{" "}· Ani Muradyan
              </p>
            )}
            <p className="text-stone-600 text-lg leading-relaxed mb-10">{post.excerpt}</p>
            {<ArticleBody body={post.body} artworks={artworks} variant="reader" />}
            <p className="mt-14 text-sm">
              <Link href="/blog"><a className="underline underline-offset-4 text-stone-700">← All writing</a></Link>
              {" · "}
              <Link href="/artworks"><a className="underline underline-offset-4 text-stone-700">See the paintings</a></Link>
            </p>
          </>
        )}
      </article>
    </div>
  );
}
