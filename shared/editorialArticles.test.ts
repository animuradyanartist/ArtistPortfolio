/**
 * THE EDITORIAL ARTICLE IS REAL, GROUNDED, AND MERGES WITHOUT SHADOWING A DATABASE POST.
 *
 * A code-authored article renders through the blog machinery, so it must obey the same rules a
 * database post does: a stable unique slug, a published date, a body that references only works
 * that exist, and a merge that never lets it duplicate or hide a real row. These pin that.
 */
import { describe, it, expect } from "vitest";
import {
  EDITORIAL_ARTICLES,
  EDITORIAL_SLUGS,
  withEditorialArticles,
  editorialArticleBySlug,
} from "./editorialArticles";
import { citedArtworkTitles } from "./articleMarkdown";
import type { BlogPost } from "./schema";

const post = (over: Partial<BlogPost> = {}): BlogPost =>
  ({ id: 1, slug: "db-post", title: "DB", excerpt: "", body: "", status: "published",
     coverImage: null, coverImageAlt: null, publishedAt: new Date("2026-08-01"),
     createdAt: new Date("2026-08-01"), updatedAt: new Date("2026-08-01"), ...over } as BlogPost);

describe("the article is well-formed", () => {
  const a = EDITORIAL_ARTICLES[0]!;
  it("has a clean slug, a title, an excerpt and a cover", () => {
    expect(a.slug).toBe("how-to-choose-an-original-painting-for-your-space");
    expect(a.title).toMatch(/Choose an Original Painting/);
    expect(a.excerpt.length).toBeGreaterThan(40);
    expect(a.coverImage).toMatch(/^\/img\/artwork\/\d+\/0$/);
    expect(a.status).toBe("published");
    expect(a.publishedAt).toBeInstanceOf(Date);
  });

  it("does not reuse either existing article's slug", () => {
    expect(a.slug).not.toBe("minimalist-landscape-painting");
    expect(a.slug).not.toBe("ani-muradyan-blue-abstract-landscapes");
  });

  it("references only real, named works — every :artwork[] resolves to a title we ship", () => {
    // The renderer resolves these against the live catalogue; a typo would drop the figure.
    const cited = citedArtworkTitles(a.body);
    expect(cited).toEqual(
      expect.arrayContaining(["No Measure for Distance", "Before Leaving", "Road to Tuscany", "Red Barn"]),
    );
    expect(cited.length).toBeGreaterThanOrEqual(4);
  });

  it("leads a qualified reader onward — to the collection, the catalogue and contact", () => {
    expect(a.body).toContain("/collections/landscape-paintings");
    expect(a.body).toContain("/artworks");
    expect(a.body).toContain("/contact");
  });
});

describe("the merge is additive and cannot shadow a database row", () => {
  it("appends the editorial article to a database list", () => {
    const merged = withEditorialArticles([post()]);
    expect(merged.map((p) => p.slug)).toContain("db-post");
    expect(merged.map((p) => p.slug)).toContain("how-to-choose-an-original-painting-for-your-space");
  });

  it("yields to a database row that has claimed the same slug (no duplicate)", () => {
    const dbTook = post({ slug: "how-to-choose-an-original-painting-for-your-space", title: "DB wins" });
    const merged = withEditorialArticles([dbTook]);
    const matches = merged.filter((p) => p.slug === dbTook.slug);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.title).toBe("DB wins");
  });

  it("sorts newest-first with the rest", () => {
    const older = post({ slug: "old", publishedAt: new Date("2020-01-01") });
    const merged = withEditorialArticles([older]);
    expect(merged[0]!.slug).toBe("how-to-choose-an-original-painting-for-your-space");
  });

  it("resolves by slug, and only for a real editorial slug", () => {
    expect(editorialArticleBySlug("how-to-choose-an-original-painting-for-your-space")).toBeDefined();
    expect(editorialArticleBySlug("not-a-real-article")).toBeUndefined();
    expect(EDITORIAL_SLUGS.has("how-to-choose-an-original-painting-for-your-space")).toBe(true);
  });
});
