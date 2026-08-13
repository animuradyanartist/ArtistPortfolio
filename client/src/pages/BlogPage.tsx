import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { BlogPost } from "@shared/schema";
import { updateCanonicalUrl, updateMetaDescription } from "@/lib/seo";
import { Eyebrow } from "@/components/editorial";

/**
 * The blog index. The server already injects a crawlable version of this list into the
 * HTML shell (see the /blog branch in server/routes.ts) — this is the same content for a
 * human, with the site's typography.
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

  const dateOf = (p: BlogPost) => {
    const d = p.publishedAt ?? p.createdAt;
    return d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
  };

  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      <section className="px-6 pt-20 md:pt-28 pb-8 text-center">
        <Eyebrow>Writing</Eyebrow>
        <h1 className="font-playfair text-5xl md:text-6xl text-stone-900 mb-5">Notes</h1>
        <p className="mx-auto max-w-2xl text-stone-600 text-lg">
          On oil painting, process, and the work — written between the studio and the easel.
        </p>
      </section>

      <section className="px-6 pb-24 max-w-3xl mx-auto">
        {isLoading ? (
          <p className="text-center text-stone-500">Loading…</p>
        ) : posts.length === 0 ? (
          <p className="text-center text-stone-500">Nothing published yet — the first notes are on their way.</p>
        ) : (
          <ul className="space-y-10">
            {posts.map((post) => (
              <li key={post.id} className="border-b border-stone-300/60 pb-8 last:border-0">
                <Link href={`/blog/${post.slug}`}>
                  <a className="block group">
                    <p className="text-stone-500 text-sm mb-2">{dateOf(post)}</p>
                    <h2 className="font-playfair text-2xl md:text-3xl text-stone-900 mb-2 group-hover:text-stone-600 transition-colors">
                      {post.title}
                    </h2>
                    <p className="text-stone-600 leading-relaxed">{post.excerpt}</p>
                    <span className="inline-block mt-3 text-sm text-stone-700 underline underline-offset-4">Read</span>
                  </a>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
