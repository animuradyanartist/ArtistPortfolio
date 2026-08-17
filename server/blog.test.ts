/**
 * The blog's safety invariants — the ones an autonomous writer makes load-bearing.
 *
 * Once an agent can create posts, "a draft cannot become public by accident" stops being
 * a nicety and becomes the boundary between a review queue and an unsupervised publisher.
 * These pin that boundary at the storage layer, where every route ultimately reads.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { MemStorage } from "./storage";

const draft = (over: Record<string, unknown> = {}) => ({
  slug: "a-note-on-oil", title: "A note on oil", excerpt: "Why oil.",
  body: "## Heading\n\nSome text.", status: "draft" as const,
  sourceNote: null, evidence: null, coverImage: null, publishedAt: null,
  ...over,
});

describe("drafts cannot leak", () => {
  let storage: MemStorage;
  beforeEach(() => { storage = new MemStorage(); });

  it("a draft is invisible to the public list and the public lookup", async () => {
    await storage.createBlogPost(draft());
    expect(await storage.getBlogPosts()).toHaveLength(0);
    expect(await storage.getBlogPostBySlug("a-note-on-oil")).toBeUndefined();
  });

  it("only an explicit includeDrafts returns it", async () => {
    await storage.createBlogPost(draft());
    expect(await storage.getBlogPosts({ includeDrafts: true })).toHaveLength(1);
    expect(await storage.getBlogPostBySlug("a-note-on-oil", { includeDrafts: true })).toBeDefined();
  });

  it("publishing makes it public and stamps the moment exactly once", async () => {
    const post = await storage.createBlogPost(draft());
    const published = await storage.updateBlogPost(post.id, { status: "published" });
    expect(published!.publishedAt).toBeInstanceOf(Date);
    const first = published!.publishedAt!.getTime();

    expect(await storage.getBlogPosts()).toHaveLength(1);

    // Re-saving a live post must not move its publication date — that timestamp is the
    // baseline every measurement is taken from.
    const edited = await storage.updateBlogPost(post.id, { status: "published", title: "Edited" });
    expect(edited!.publishedAt!.getTime()).toBe(first);
  });

  it("newest first, by publication date rather than creation", async () => {
    const older = await storage.createBlogPost(draft({ slug: "older", title: "Older" }));
    const newer = await storage.createBlogPost(draft({ slug: "newer", title: "Newer" }));
    await storage.updateBlogPost(newer.id, { status: "published", publishedAt: new Date("2026-08-01") });
    await storage.updateBlogPost(older.id, { status: "published", publishedAt: new Date("2026-08-10") });
    const list = await storage.getBlogPosts();
    expect(list.map((p) => p.slug)).toEqual(["older", "newer"]);
  });

  /**
   * THE WRITE BOUNDARY, not just the read boundary.
   *
   * Every test above proves a draft cannot be READ by the public. None of them proved a
   * draft could not be PUBLISHED by whoever is holding the pen — and the content route
   * accepted `status`, so one PATCH took a post live. Forcing drafts on create is
   * worthless if the next call can flip the same row public.
   *
   * These pin the seam: editing content and going live are different verbs, so a
   * credential can one day be granted the first and refused the second.
   */
  it("editing content leaves publication state alone", async () => {
    const post = await storage.createBlogPost(draft({ slug: "seam", title: "Seam" }));
    const edited = await storage.updateBlogPost(post.id, { title: "Edited" });
    expect(edited!.title).toBe("Edited");
    expect(edited!.status).toBe("draft");
    expect(await storage.getBlogPosts()).toHaveLength(0);
  });

  it("publishing is what makes it public, and unpublishing takes it back", async () => {
    const post = await storage.createBlogPost(draft({ slug: "toggle", title: "Toggle" }));
    await storage.updateBlogPost(post.id, { status: "published" });
    expect(await storage.getBlogPosts()).toHaveLength(1);

    await storage.updateBlogPost(post.id, { status: "draft" });
    expect(await storage.getBlogPosts()).toHaveLength(0);
    expect(await storage.getBlogPostBySlug("toggle")).toBeUndefined();
  });

  it("a re-published post keeps its original publication moment", async () => {
    const post = await storage.createBlogPost(draft({ slug: "again", title: "Again" }));
    const first = (await storage.updateBlogPost(post.id, { status: "published" }))!.publishedAt!.getTime();
    await storage.updateBlogPost(post.id, { status: "draft" });
    const back = await storage.updateBlogPost(post.id, { status: "published" });
    // Measurement depends on this: a moving publication date silently moves the window
    // every "did it work?" question is asked over.
    expect(back!.publishedAt!.getTime()).toBe(first);
  });
});
