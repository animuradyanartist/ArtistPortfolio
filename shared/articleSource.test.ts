/**
 * The canonical article source format: what a valid file is, and how it fails.
 *
 * These pin the parser + validator that the publish pipeline (server/publishArticle.ts, the
 * `article:publish` CLI) depends on — a file that validates here is one the live blog can render.
 */
import { describe, it, expect } from "vitest";
import { parseArticleSource, validateArticleSource, isAcceptableCoverImage } from "./articleSource";

/** A well-formed source, with knobs to break one thing at a time. */
const SRC = (
  over: Partial<{ title: string; slug: string; excerpt: string; cover: string | null; coverAlt: string; body: string }> = {},
): string => {
  const coverLine = over.cover === null ? "" : `coverImage: ${over.cover ?? "/img/print/19/0"}\n`;
  return (
    `---\n` +
    `title: ${over.title ?? "Test Title: A Guide"}\n` +
    `slug: ${over.slug ?? "test-article"}\n` +
    `excerpt: ${over.excerpt ?? "A one-line summary of the test article: it explains things."}\n` +
    coverLine +
    `coverImageAlt: ${over.coverAlt ?? "A cover image"}\n` +
    `---\n\n` +
    (over.body ??
      "Here is the opening paragraph.\n\n## A heading\n\n- one\n- two\n\n**bold** and [a link](/prints).")
  );
};

describe("parseArticleSource", () => {
  it("reads frontmatter and body, preserving colons inside values", () => {
    const { meta, body } = parseArticleSource(SRC());
    expect(meta.title).toBe("Test Title: A Guide");
    expect(meta.slug).toBe("test-article");
    expect(meta.excerpt).toBe("A one-line summary of the test article: it explains things.");
    expect(meta.coverImage).toBe("/img/print/19/0");
    expect(body.startsWith("Here is the opening paragraph.")).toBe(true);
    expect(body.includes("[a link](/prints)")).toBe(true);
  });

  it("throws on a file with no frontmatter block", () => {
    expect(() => parseArticleSource("no frontmatter, just prose")).toThrow(/frontmatter/i);
  });

  it("throws on an unterminated frontmatter block", () => {
    expect(() => parseArticleSource("---\ntitle: X\n\nbody with no closing fence")).toThrow(/frontmatter/i);
  });
});

describe("validateArticleSource", () => {
  const valid = (src: string, slug = "test-article") => validateArticleSource(parseArticleSource(src), slug);

  it("accepts a well-formed source and returns the clean article", () => {
    const v = valid(SRC());
    expect(v.ok).toBe(true);
    expect(v.article).toMatchObject({ title: "Test Title: A Guide", slug: "test-article", coverImage: "/img/print/19/0" });
  });

  it("fails when a required field is missing", () => {
    expect(valid(SRC({ excerpt: "" })).errors.join()).toMatch(/excerpt is required/);
    expect(valid(SRC({ body: "" })).errors.join()).toMatch(/body is required/);
  });

  it("fails when the slug does not match the expected (filename) slug", () => {
    const v = valid(SRC({ slug: "some-other-slug" }));
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toMatch(/does not match the expected slug/);
  });

  it("fails on a non-URL-clean slug", () => {
    const v = valid(SRC({ slug: "Not A Slug" }), "Not A Slug");
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toMatch(/not URL-clean/);
  });

  it("fails on a markdown table (the site does not render tables)", () => {
    const v = valid(SRC({ body: "Intro paragraph.\n\n| a | b |\n| --- | --- |\n| 1 | 2 |" }));
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toMatch(/table/i);
  });

  it("rejects a nonsense coverImage but accepts a path or http(s) URL", () => {
    expect(valid(SRC({ cover: "not a path" })).ok).toBe(false);
    expect(valid(SRC({ cover: "/uploads/x.webp" })).ok).toBe(true);
    expect(valid(SRC({ cover: "https://cdn.example.com/x.jpg" })).ok).toBe(true);
    expect(valid(SRC({ cover: null })).ok).toBe(true); // cover is optional
  });

  it("isAcceptableCoverImage guards the two supported forms", () => {
    expect(isAcceptableCoverImage("/img/print/19/0")).toBe(true);
    expect(isAcceptableCoverImage("https://x.com/a.png")).toBe(true);
    expect(isAcceptableCoverImage("img/print/19/0")).toBe(false);
    expect(isAcceptableCoverImage("javascript:alert(1)")).toBe(false);
  });
});
