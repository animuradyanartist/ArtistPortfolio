/**
 * The Soft-404 fix on the client: the article must render on the FIRST render from preloaded data,
 * never depending on the /api/blog/:slug XHR (which Google's smartphone renderer could not get in
 * time, so it captured the empty "Loading…" state and filed the page as a Soft 404).
 *
 * Two guarantees are pinned here:
 *   1. `pickPreloadedPost` only returns the preload when its slug matches THIS route — a preload for
 *      one article is never reused for another during client-side navigation.
 *   2. Given the post as data on the first render (which the server's window.__PRELOADED_POST__
 *      supplies as React Query initialData), the page renders the full article synchronously — no
 *      "Loading…", no "Not found" — without any network call (renderToStaticMarkup runs no effects).
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import type { BlogPost } from "@shared/schema";
import BlogPostPage, { pickPreloadedPost } from "./BlogPostPage";

const post = (over: Partial<BlogPost> = {}): BlogPost =>
  ({
    id: 9,
    slug: "wall-art-size-guide",
    title: "Wall Art Size Guide: How to Choose the Right Size for Your Space",
    excerpt: "A practical wall art size guide.",
    body: "The distinctive opening line about two-thirds proportions.\n\n## A heading\n\n- one\n- two",
    status: "published",
    sourceNote: null,
    evidence: null,
    coverImage: null,
    coverImageAlt: null,
    publishedAt: "2026-09-07T07:42:23.000Z" as unknown as Date,
    origin: "manual",
    decisionRef: null,
    expectedOutcome: null,
    measurementHorizonDays: null,
    createdAt: "2026-09-07T07:42:23.000Z" as unknown as Date,
    updatedAt: "2026-09-07T07:43:36.000Z" as unknown as Date,
    ...over,
  }) as BlogPost;

describe("pickPreloadedPost — a preload is used only for its own slug", () => {
  it("returns the preload when the slug matches the route", () => {
    const p = post();
    expect(pickPreloadedPost(p, "wall-art-size-guide")).toBe(p);
  });

  it("does NOT reuse a preload for slug A on slug B", () => {
    const p = post({ slug: "article-a" });
    expect(pickPreloadedPost(p, "article-b")).toBeUndefined();
  });

  it("returns undefined when there is no preload", () => {
    expect(pickPreloadedPost(undefined, "wall-art-size-guide")).toBeUndefined();
  });
});

describe("BlogPostPage renders the article from data on the first render (no API wait)", () => {
  const renderAt = (slug: string, data: BlogPost | undefined) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Stand in for what window.__PRELOADED_POST__ supplies as initialData: the post is present in
    // the cache on the first render. No queryFn is configured, and renderToStaticMarkup runs no
    // effects, so nothing is fetched.
    if (data) qc.setQueryData([`/api/blog/${slug}`], data);
    qc.setQueryData(["/api/artworks"], []);
    return renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <Router ssrPath={`/blog/${slug}`}>
          <BlogPostPage />
        </Router>
      </QueryClientProvider>,
    );
  };

  it("shows the title and body, and NOT the loading/not-found states", () => {
    const html = renderAt("wall-art-size-guide", post());
    expect(html).toContain("Wall Art Size Guide: How to Choose the Right Size for Your Space");
    expect(html).toContain("two-thirds proportions");
    expect(html).not.toContain("Loading…");
    expect(html).not.toContain("Not found");
  });

  it("without data it would fall to the loading/not-found path (proving the fix is what avoids it)", () => {
    const html = renderAt("wall-art-size-guide", undefined);
    // No cached post and no fetch → the page is NOT the article. This is exactly the empty state the
    // preload prevents. (Either the loading or the not-found branch; both lack the body.)
    expect(html).not.toContain("two-thirds proportions");
  });
});
