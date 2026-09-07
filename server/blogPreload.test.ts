/**
 * /blog/:slug SSR must inline the post as window.__PRELOADED_POST__ so the client renders the full
 * article on its FIRST render (React Query initialData), instead of clearing the server-rendered body
 * and waiting on the /api/blog/:slug XHR — the empty "Loading…" window that Google's smartphone
 * renderer captured and filed as a Soft 404.
 *
 * Runs against the PRODUCTION SSR (registerRoutes + the built index.html), seeding two published posts
 * into the shared storage. Mirrors server/artworksPage.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import { registerRoutes } from "./routes";
import { storage } from "./storage";
import type { InsertBlogPost } from "@shared/schema";

let server: Server;
let origin: string;

const SLUG_A = "preload-test-a";
const SLUG_B = "preload-test-b";
const TITLE_A = "Preload Test A: The First";
// A body that would break a naïvely-embedded <script> if it were not escaped.
const BODY_A = "Intro paragraph.\n\nA tricky line with </script><script>alert(1)</script> and a <b>tag</b>.";

async function seedPublished(slug: string, title: string, body: string) {
  const input: InsertBlogPost = {
    slug, title, excerpt: `Excerpt for ${slug}.`, body, status: "draft", origin: "manual",
  };
  const draft = await storage.createBlogPost(input);
  await storage.updateBlogPost(draft.id, { status: "published" });
}

beforeAll(async () => {
  const built = path.resolve(process.cwd(), "dist/public/index.html");
  if (!fs.existsSync(built)) throw new Error("run `npm run build` first — this tests the production SSR output");
  process.env.NODE_ENV = "production";
  await seedPublished(SLUG_A, TITLE_A, BODY_A);
  await seedPublished(SLUG_B, "Preload Test B: The Second", "A different body for B.");
  const app = express();
  server = await registerRoutes(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const a = server.address();
  if (!a || typeof a === "string") throw new Error("no port");
  origin = `http://127.0.0.1:${a.port}`;
}, 30_000);

afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

const fetchHtml = async (slug: string) => (await fetch(`${origin}/blog/${slug}`)).text();

/** The raw JS between `window.__PRELOADED_POST__=` and the terminating `;</script>`. Unambiguous
 *  because every `<` in the payload is escaped to <, so no `</script>` can appear inside it. */
function preloadPayload(html: string): string | null {
  const m = html.match(/window\.__PRELOADED_POST__=(.*?);<\/script>/s);
  return m ? m[1]! : null;
}
function parsePreload(html: string): Record<string, unknown> | null {
  const raw = preloadPayload(html);
  return raw ? JSON.parse(raw) : null; // < is valid JSON, so this parses as the browser would
}

describe("/blog/:slug SSR inlines window.__PRELOADED_POST__", () => {
  it("includes the full post payload for a published article", async () => {
    const post = parsePreload(await fetchHtml(SLUG_A));
    expect(post).toBeTruthy();
    expect(post!.slug).toBe(SLUG_A);
    expect(post!.title).toBe(TITLE_A);
    expect(post!.status).toBe("published");
    expect(String(post!.body)).toContain("</script>"); // the real body round-trips intact
  });

  it("is script-safe: no raw </script> or <script> can break out of the inline <script>", async () => {
    const raw = preloadPayload(await fetchHtml(SLUG_A))!;
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("</script>");
    expect(raw).not.toContain("<script>");
    expect(raw).toContain("\\u003c"); // the body's `<` characters were escaped
  });

  it("carries the post for THIS slug — a preload for slug A is never reused for slug B", async () => {
    const a = parsePreload(await fetchHtml(SLUG_A))!;
    const b = parsePreload(await fetchHtml(SLUG_B))!;
    expect(a.slug).toBe(SLUG_A);
    expect(b.slug).toBe(SLUG_B);
    expect(b.slug).not.toBe(a.slug);
  });

  it("leaves the existing SSR title, meta description, canonical and Article JSON-LD unchanged", async () => {
    const html = await fetchHtml(SLUG_A);
    expect(html).toContain(`<title>${TITLE_A} — Ani Muradyan</title>`);
    expect(html).toContain(`content="Excerpt for ${SLUG_A}."`);
    expect(html).toContain(`<link rel="canonical" href="https://animuradyan.com/blog/${SLUG_A}">`);
    const article = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
      .map((m) => JSON.parse(m[1]!.replace(/\\u003c/g, "<")))
      .find((b) => b["@type"] === "Article");
    expect(article).toBeTruthy();
    expect(article.headline).toBe(TITLE_A);
    expect(article.mainEntityOfPage).toBe(`https://animuradyan.com/blog/${SLUG_A}`);
  });
});
