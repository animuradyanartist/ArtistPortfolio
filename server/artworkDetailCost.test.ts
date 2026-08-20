/**
 * WHAT AN ARTWORK PAGE IS ALLOWED TO COST.
 *
 * On 2026-08-20 the live page for one painting took 3.5-4.1s to answer, and the API call
 * behind it another 2.3-3.4s. Neither was doing anything complicated: resolving the slug
 * "road-to-tuscany-69" read every row in the artworks table — base64 images and all — three
 * separate times, in the redirect, in the API and in the prerender, to compare four strings.
 *
 * The proof was in production itself. /artworks/69 skips the redirect because a bare id needs
 * no canonicalising, and answered the same 9,615 bytes in 0.85-1.88s. The entire difference
 * was full-catalogue reads.
 *
 * These tests pin the shape of the fix rather than a timing, because a timing would be flaky
 * and would not say WHY it got slow again. A full-catalogue read on this path is the defect;
 * counting them catches it on the day it comes back.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import { registerRoutes } from "./routes";
import { storage } from "./storage";
import { artworkCanonicalPath } from "@shared/canonical";

let server: Server;
let origin: string;

beforeAll(async () => {
  const built = path.resolve(process.cwd(), "dist/public/index.html");
  if (!fs.existsSync(built)) throw new Error("run `npm run build` first — these test the production output");
  process.env.NODE_ENV = "production";
  const app = express();
  server = await registerRoutes(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const a = server.address();
  if (!a || typeof a === "string") throw new Error("no port");
  origin = `http://127.0.0.1:${a.port}`;
}, 30_000);

afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

/** A work addressed the way visitors and Google address it: "<title>-<id>". */
const aWork = async () => {
  const all = await storage.getAllArtworks();
  const work = all.find((a) => a.title && !a.seoSlug);
  if (!work) throw new Error("no sample artwork to address");
  return work;
};

/**
 * Runs `fn` with a counter on the one call that used to dominate this page.
 * The memo is warmed first, exactly as a live server's would be, so this measures the steady
 * state a visitor actually meets rather than the very first request after a deploy.
 */
async function fullCatalogueReadsDuring(warm: string, fn: () => Promise<unknown>): Promise<number> {
  await fetch(`${origin}${warm}`);
  const spy = vi.spyOn(storage, "getAllArtworks");
  try {
    await fn();
    return spy.mock.calls.length;
  } finally {
    spy.mockRestore();
  }
}

describe("resolving one painting does not read the whole catalogue", () => {
  it("the detail page HTML reads no full catalogue", async () => {
    const work = await aWork();
    const url = artworkCanonicalPath(work);
    const reads = await fullCatalogueReadsDuring(url, () => fetch(`${origin}${url}`));
    expect(reads).toBe(0);
  });

  it("the detail API reads no full catalogue", async () => {
    const work = await aWork();
    const slug = artworkCanonicalPath(work).replace("/artworks/", "");
    const url = `/api/artworks/${slug}`;
    const reads = await fullCatalogueReadsDuring(url, () => fetch(`${origin}${url}`));
    expect(reads).toBe(0);
  });

  it("still resolves the slug to the right painting", async () => {
    const work = await aWork();
    const slug = artworkCanonicalPath(work).replace("/artworks/", "");
    const got = await (await fetch(`${origin}/api/artworks/${slug}`)).json();
    expect(got.id).toBe(work.id);
    expect(got.title).toBe(work.title);
  });

  it("still 404s a PAGE whose trailing id does not belong to its slug", async () => {
    const work = await aWork();
    // The strict address rule lives in the prerender resolver, and it is the thing that
    // stopped an unbounded family of near-duplicate URLs being served as real pages. Moving
    // that resolver onto the address index must not have loosened it.
    const res = await fetch(`${origin}/artworks/total-nonsense-${work.id}`);
    expect(res.status).toBe(404);
  });
});

describe("the painting travels with the page that renders it", () => {
  it("the HTML carries the artwork React needs, so nothing waits on an API for it", async () => {
    const work = await aWork();
    const html = await (await fetch(`${origin}${artworkCanonicalPath(work)}`)).text();
    const m = html.match(/window\.__PRELOADED_ARTWORK__=(\{.*?\});<\/script>/s);
    expect(m, "no preloaded artwork in the document").toBeTruthy();
    const preloaded = JSON.parse(m![1].replace(/\\u003c/g, "<"));
    expect(preloaded.id).toBe(work.id);
    expect(preloaded.title).toBe(work.title);
  });

  it("the preload never inlines base64 images", async () => {
    const work = await aWork();
    const html = await (await fetch(`${origin}${artworkCanonicalPath(work)}`)).text();
    const m = html.match(/window\.__PRELOADED_ARTWORK__=(\{.*?\});<\/script>/s);
    const preloaded = JSON.parse(m![1].replace(/\\u003c/g, "<"));
    for (const img of preloaded.images ?? []) {
      expect(String(img).startsWith("data:"), `preload inlined a base64 image: ${String(img).slice(0, 32)}`).toBe(false);
    }
  });
});

describe("a page that wants a few works can ask for a few", () => {
  it("?limit=N returns at most N", async () => {
    const all = await (await fetch(`${origin}/api/artworks`)).json();
    const few = await (await fetch(`${origin}/api/artworks?limit=4`)).json();
    expect(few.length).toBe(Math.min(4, all.length));
  });

  it("no limit still returns the whole collection", async () => {
    const all = await (await fetch(`${origin}/api/artworks`)).json();
    expect(all.length).toBe((await storage.getAllArtworks()).length);
  });
});
