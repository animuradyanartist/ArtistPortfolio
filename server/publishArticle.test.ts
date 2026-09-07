/**
 * The article publishing pipeline: create, idempotent update, publishedAt handling, dry-run safety.
 *
 * Runs against a fresh MemStorage (no database) so the create/update semantics are proven without a
 * DB — the same storage methods the real DatabaseStorage implements. The CLI (scripts/publish-article.ts)
 * is a thin wrapper that swaps in the real storage singleton and refuses to run without DATABASE_URL.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { MemStorage } from "./storage";
import { publishArticle } from "./publishArticle";

const SRC = (
  over: Partial<{ title: string; slug: string; excerpt: string; body: string; cover: string }> = {},
): string =>
  `---\n` +
  `title: ${over.title ?? "Wall Art Size Guide: A Test"}\n` +
  `slug: ${over.slug ?? "test-article"}\n` +
  `excerpt: ${over.excerpt ?? "A one-line summary for the test."}\n` +
  `coverImage: ${over.cover ?? "/img/print/19/0"}\n` +
  `coverImageAlt: A cover image\n` +
  `---\n\n` +
  (over.body ?? "The opening paragraph.\n\n## A heading\n\n- one\n- two\n\n[a link](/prints).");

describe("publishArticle", () => {
  let storage: MemStorage;
  beforeEach(() => { storage = new MemStorage(); });

  const rows = async () => (await storage.getBlogPosts({ includeDrafts: true })).filter((p) => p.slug === "test-article");

  it("CREATE: makes one published row with publishedAt stamped and the cover set", async () => {
    const r = await publishArticle({ slug: "test-article", source: SRC(), storage });
    expect(r.action).toBe("create");
    expect(r.wrote).toBe(true);
    expect(r.status).toBe("published");
    expect(r.publishedAt).toBeTruthy();

    const row = await storage.getBlogPostBySlug("test-article", { includeDrafts: true });
    expect(row?.status).toBe("published");
    expect(row?.coverImage).toBe("/img/print/19/0");
    expect(row?.origin).toBe("manual");
    expect(await rows()).toHaveLength(1);
  });

  it("is idempotent: publishing twice UPDATES the same row, never duplicates", async () => {
    await publishArticle({ slug: "test-article", source: SRC(), storage });
    const second = await publishArticle({ slug: "test-article", source: SRC({ title: "Wall Art Size Guide: Updated" }), storage });
    expect(second.action).toBe("update");
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]!.title).toBe("Wall Art Size Guide: Updated");
  });

  it("UPDATE preserves the original publishedAt", async () => {
    const first = await publishArticle({ slug: "test-article", source: SRC(), storage });
    await new Promise((r) => setTimeout(r, 5));
    const second = await publishArticle({ slug: "test-article", source: SRC({ excerpt: "A changed summary." }), storage });
    expect(second.action).toBe("update");
    expect(second.publishedAtPreserved).toBe(true);
    expect(second.publishedAt).toBe(first.publishedAt); // unchanged
  });

  it("UPDATE patches only source-owned fields, leaving Career-OS/measurement metadata intact", async () => {
    await publishArticle({ slug: "test-article", source: SRC(), storage });
    const row = await storage.getBlogPostBySlug("test-article", { includeDrafts: true });
    // Simulate measurement metadata written elsewhere (e.g. Career OS).
    await storage.updateBlogPost(row!.id, { decisionRef: "dec-1", expectedOutcome: "traffic", measurementHorizonDays: 28 });

    await publishArticle({ slug: "test-article", source: SRC({ body: "A fresh body paragraph." }), storage });
    const after = await storage.getBlogPostBySlug("test-article", { includeDrafts: true });
    expect(after?.decisionRef).toBe("dec-1");
    expect(after?.expectedOutcome).toBe("traffic");
    expect(after?.measurementHorizonDays).toBe(28);
    expect(after?.origin).toBe("manual");
    expect(after?.body).toContain("A fresh body paragraph.");
  });

  it("--dry-run performs ZERO writes but reports the correct action", async () => {
    const before = (await rows()).length;
    const create = await publishArticle({ slug: "test-article", source: SRC(), storage, dryRun: true });
    expect(create.action).toBe("create");
    expect(create.wrote).toBe(false);
    expect(await rows()).toHaveLength(before); // nothing created

    // With an existing row, a dry run reports UPDATE and still writes nothing.
    await publishArticle({ slug: "test-article", source: SRC(), storage });
    const beforeUpdate = (await storage.getBlogPostBySlug("test-article", { includeDrafts: true }))!.title;
    const dry = await publishArticle({ slug: "test-article", source: SRC({ title: "Should Not Be Written" }), storage, dryRun: true });
    expect(dry.action).toBe("update");
    expect(dry.wrote).toBe(false);
    const afterTitle = (await storage.getBlogPostBySlug("test-article", { includeDrafts: true }))!.title;
    expect(afterTitle).toBe(beforeUpdate); // title unchanged by the dry run
  });

  it("a malformed source fails closed (throws, writes nothing)", async () => {
    await expect(
      publishArticle({ slug: "test-article", source: "garbage — no frontmatter here", storage }),
    ).rejects.toThrow(/frontmatter/i);
    expect(await rows()).toHaveLength(0);
  });

  it("a slug/filename mismatch fails closed (throws, writes nothing)", async () => {
    await expect(
      publishArticle({ slug: "test-article", source: SRC({ slug: "wrong-slug" }), storage }),
    ).rejects.toThrow(/does not match/i);
    expect(await rows()).toHaveLength(0);
  });
});
