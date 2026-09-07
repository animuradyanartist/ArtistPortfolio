/**
 * THE ONE ARTICLE PUBLISHING PIPELINE — create/update a blog_posts row from a canonical source file.
 *
 * The live site is DB-driven: /blog, /blog/:slug, the sitemap, canonical, meta and Article JSON-LD all
 * come from the blog_posts row (nothing per-article is registered in code). This function turns a
 * canonical `research/articles/<slug>.md` source into exactly that row, idempotently, REUSING the
 * site's own storage methods and publish semantics — it invents no parallel behaviour:
 *
 *   - it keys on the SLUG (getBlogPostBySlug), so publishing twice updates one row and never duplicates;
 *   - CREATE mirrors the admin flow (createBlogPost as a draft → updateBlogPost to "published"), which is
 *     what stamps `publishedAt` exactly once;
 *   - UPDATE patches only the fields the source owns (title, excerpt, body, and cover when supplied) and
 *     re-asserts "published" — leaving `origin`, `publishedAt` and any Career-OS measurement metadata
 *     untouched (updateBlogPost preserves an existing `publishedAt`).
 *
 * `storage` is injected: the CLI passes the real DatabaseStorage singleton; tests pass a MemStorage.
 * Parsing/validation live in shared/articleSource.ts (pure); this module only decides create-vs-update
 * and drives the writes.
 */
import type { IStorage } from "./storage";
import type { InsertBlogPost } from "@shared/schema";
import { parseArticleSource, validateArticleSource } from "@shared/articleSource";

export interface PublishOptions {
  /** The slug expected from the filename / CLI argument — the source's own slug must match it. */
  slug: string;
  /** Raw contents of research/articles/<slug>.md. */
  source: string;
  storage: IStorage;
  /** When true, validate + decide create-vs-update but perform NO writes. */
  dryRun?: boolean;
}

export interface PublishResult {
  action: "create" | "update";
  /** false for a dry run (or if nothing was written). */
  wrote: boolean;
  id: number | null;
  slug: string;
  title: string;
  status: string;
  publishedAt: string | null;
  /** true when an already-published row kept its original publishedAt. */
  publishedAtPreserved: boolean;
}

export async function publishArticle(opts: PublishOptions): Promise<PublishResult> {
  // Throws on a structurally unreadable file; returns typed errors for a merely-invalid one.
  const parsed = parseArticleSource(opts.source);
  const v = validateArticleSource(parsed, opts.slug);
  if (!v.ok) {
    throw new Error("Invalid article source:\n  - " + v.errors.join("\n  - "));
  }
  const a = v.article!;

  const existing = await opts.storage.getBlogPostBySlug(a.slug, { includeDrafts: true });

  if (opts.dryRun) {
    const alreadyLive = existing?.status === "published";
    return {
      action: existing ? "update" : "create",
      wrote: false,
      id: existing?.id ?? null,
      slug: a.slug,
      title: a.title,
      status: alreadyLive ? "published" : "published (would be set)",
      publishedAt: existing?.publishedAt ? existing.publishedAt.toISOString() : null,
      publishedAtPreserved: !!existing?.publishedAt,
    };
  }

  if (!existing) {
    // Same two verbs the admin UI uses: create as a DRAFT, then publish. Publishing is what stamps
    // publishedAt (updateBlogPost), so a first publish records its real moment exactly once.
    const draftInput: InsertBlogPost = {
      title: a.title,
      slug: a.slug,
      excerpt: a.excerpt,
      body: a.body,
      coverImage: a.coverImage,
      coverImageAlt: a.coverImageAlt,
      status: "draft",
      origin: "manual",
    };
    const draft = await opts.storage.createBlogPost(draftInput);
    const live = await opts.storage.updateBlogPost(draft.id, { status: "published" });
    return {
      action: "create",
      wrote: true,
      id: live!.id,
      slug: live!.slug,
      title: live!.title,
      status: live!.status,
      publishedAt: live!.publishedAt ? live!.publishedAt.toISOString() : null,
      publishedAtPreserved: false,
    };
  }

  // UPDATE — patch ONLY what the source owns. Cover fields are patched only when supplied, so an
  // update never blanks an existing cover; origin / decisionRef / expectedOutcome / measurement
  // horizon are never touched here. updateBlogPost keeps an existing publishedAt in place.
  const hadPublishedAt = !!existing.publishedAt;
  const patch: Partial<InsertBlogPost> = {
    title: a.title,
    excerpt: a.excerpt,
    body: a.body,
    status: "published",
  };
  if (a.coverImage !== null) patch.coverImage = a.coverImage;
  if (a.coverImageAlt !== null) patch.coverImageAlt = a.coverImageAlt;

  const updated = await opts.storage.updateBlogPost(existing.id, patch);
  return {
    action: "update",
    wrote: true,
    id: updated!.id,
    slug: updated!.slug,
    title: updated!.title,
    status: updated!.status,
    publishedAt: updated!.publishedAt ? updated!.publishedAt.toISOString() : null,
    publishedAtPreserved: hadPublishedAt,
  };
}
