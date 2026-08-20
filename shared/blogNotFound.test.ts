/**
 * A MISSING ARTICLE SAYS 404 — and nothing else does.
 *
 * The sibling of artworkNotFound.test.ts, for the surface that fix never reached. Verified
 * against production on 2026-08-20: /artworks/definitely-not-a-real-slug answered 404 while
 * /blog/definitely-not-a-real-slug answered 200, and two different invented blog slugs
 * returned responses differing in exactly one thing — their self-canonical hrefs.
 *
 * The risk in fixing it is over-reach — 404ing something real — so these pin both edges, and
 * in particular that the collection and the one published article are untouched.
 */
import { describe, it, expect } from "vitest";
import { isMissingBlogPath } from "./blogNotFound";

describe("what must 404", () => {
  it("a slug that maps to no published article", () => {
    expect(isMissingBlogPath("/blog/definitely-not-a-real-slug", false)).toBe(true);
  });

  it("a draft's slug, which is not public until it is published", () => {
    // getBlogPostBySlug excludes drafts, so this arrives unresolved — and should, because the
    // article does not exist publicly yet. It becomes 200 on publication with no change here.
    expect(isMissingBlogPath("/blog/ani-muradyan-blue-abstract-landscapes", false)).toBe(true);
  });

  it("still 404s when the path carries a query or fragment", () => {
    expect(isMissingBlogPath("/blog/nope?utm_source=x", false)).toBe(true);
    expect(isMissingBlogPath("/blog/nope#top", false)).toBe(true);
  });
});

describe("what must NOT 404", () => {
  it("the one published article — Experiment #1 is untouched", () => {
    expect(isMissingBlogPath("/blog/minimalist-landscape-painting", true)).toBe(false);
  });

  it("the collection page itself, with or without a trailing slash", () => {
    expect(isMissingBlogPath("/blog", false)).toBe(false);
    expect(isMissingBlogPath("/blog/", false)).toBe(false);
  });

  it("every non-blog route, which belongs to the client router", () => {
    for (const p of ["/", "/about", "/path", "/contact", "/gallery", "/exhibitions", "/prints", "/admin", "/artworks"]) {
      expect(isMissingBlogPath(p, false)).toBe(false);
    }
  });

  it("artwork routes — the sibling rule owns those", () => {
    expect(isMissingBlogPath("/artworks/9999", false)).toBe(false);
  });

  it("a path that only looks like the blog prefix", () => {
    expect(isMissingBlogPath("/blogsomething", false)).toBe(false);
    expect(isMissingBlogPath("/blogs/x", false)).toBe(false);
  });
});

describe("resolution wins over the 404 rule, always", () => {
  it("never 404s a resolved path, whatever it looks like", () => {
    for (const p of ["/blog/anything-at-all", "/blog/x", "/blog/9999"]) {
      expect(isMissingBlogPath(p, true)).toBe(false);
    }
  });
});
