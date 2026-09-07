/**
 * THE CANONICAL ARTICLE SOURCE FORMAT — frontmatter + markdown body.
 *
 * `research/articles/<slug>.md` is the editorial source of truth in git. To make it publishable by a
 * repeatable command (see scripts/publish-article.ts) rather than by hand, the publishable fields live
 * in a small `---` frontmatter block at the top of the file, and everything after it is the article
 * body in the SAME markdown subset the live site renders (shared/articleMarkdown.ts):
 *
 *   ---
 *   title: ...
 *   slug: ...
 *   excerpt: ...
 *   coverImage: ...        (optional)
 *   coverImageAlt: ...     (optional)
 *   ---
 *
 *   <body markdown>
 *
 * This module ONLY parses and validates; it never touches a database. It is pure and shared so the
 * same rules can be unit-tested and reused by the CLI. Historical articles authored in the older
 * comment-header format are already live in the database and are NOT reprocessed by this.
 */
import { toSlug } from "./canonical";
import { parseArticle, type Block } from "./articleMarkdown";

export interface ParsedArticleSource {
  meta: Record<string, string>;
  body: string;
}

/** The fields a valid, publishable article carries once validated. */
export interface ValidatedArticle {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  /** Present ONLY when the source supplies it — so an update never blanks an existing cover. */
  coverImage: string | null;
  coverImageAlt: string | null;
}

export interface ArticleValidation {
  ok: boolean;
  errors: string[];
  article?: ValidatedArticle;
}

/**
 * Split a canonical source into its frontmatter map and its markdown body.
 *
 * Frontmatter is single-line `key: value` pairs (the value is everything after the FIRST colon, so a
 * title or excerpt may itself contain a colon). Throws on a missing or unterminated `---` block, so a
 * malformed file fails loudly rather than publishing something half-read.
 */
export function parseArticleSource(raw: string): ParsedArticleSource {
  const text = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n([\s\S]*))?$/.exec(text);
  if (!m) {
    throw new Error(
      "Missing or unterminated frontmatter: the file must begin with a '---' block closed by a '---' line.",
    );
  }
  const meta: Record<string, string> = {};
  for (const line of m[1]!.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue; // blank or comment line
    const i = line.indexOf(":");
    if (i === -1) {
      throw new Error(`Malformed frontmatter line (expected 'key: value'): "${line}"`);
    }
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: (m[2] ?? "").trim() };
}

/** A cover value is acceptable when it is an internal path ("/img/...", "/uploads/...") or an
 *  http(s) URL — the same two forms the blog SSR already absolutizes for og:image. */
export function isAcceptableCoverImage(value: string): boolean {
  return /^\/[^\s]+$/.test(value) || /^https?:\/\/[^\s]+$/i.test(value);
}

/**
 * Validate a parsed source against the slug expected from the filename / CLI argument.
 *
 * Reuses the site's OWN slug rule (`toSlug`) and markdown parser (`parseArticle`), so a file that
 * validates here is one the live blog can render and address. Returns every problem at once rather
 * than failing on the first, and never throws for a merely-invalid file (only `parseArticleSource`
 * throws, for a structurally unreadable one).
 */
export function validateArticleSource(parsed: ParsedArticleSource, expectedSlug: string): ArticleValidation {
  const errors: string[] = [];
  const { meta, body } = parsed;
  const title = (meta.title ?? "").trim();
  const slug = (meta.slug ?? "").trim();
  const excerpt = (meta.excerpt ?? "").trim();
  const coverImage = (meta.coverImage ?? "").trim() || null;
  const coverImageAlt = (meta.coverImageAlt ?? "").trim() || null;

  if (!title) errors.push("title is required");
  if (!excerpt) errors.push("excerpt is required");
  if (!body) errors.push("body is required (there is no content after the frontmatter)");

  if (!slug) {
    errors.push("slug is required");
  } else {
    if (slug !== expectedSlug) {
      errors.push(`slug "${slug}" does not match the expected slug "${expectedSlug}" (from the filename)`);
    }
    if (toSlug(slug) !== slug) {
      errors.push(`slug "${slug}" is not URL-clean (expected "${toSlug(slug)}")`);
    }
  }

  if (coverImage && !isAcceptableCoverImage(coverImage)) {
    errors.push(`coverImage "${coverImage}" must be an internal path ("/...") or an http(s) URL`);
  }

  // Catastrophic formatting: the site's markdown has NO tables, so a raw "|" row would render as
  // literal text on the live page. Catch it here rather than shipping a broken article.
  if (body) {
    const blocks: Block[] = parseArticle(body);
    if (blocks.length === 0) {
      errors.push("body has no renderable content");
    }
    const flat = blocks
      .map((b) =>
        b.kind === "list" ? b.items.join(" ") : b.kind === "quote" ? b.paragraphs.join(" ") : (b as { text?: string }).text ?? "",
      )
      .join("\n");
    if (/\|/.test(flat)) {
      errors.push("body contains a markdown table ('|'), which the site does not render — convert it to a list");
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], article: { title, slug, excerpt, body, coverImage, coverImageAlt } };
}
