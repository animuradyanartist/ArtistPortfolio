/**
 * THE SITEMAP MUST AGREE WITH THE PAGE.
 *
 * On 18 August 2026 it did not, for every one of the 53 artworks. Three different live
 * URLs existed for each painting and the two sitemaps between them declared the two the
 * page disowns:
 *
 *   sitemap.xml        /artworks/ani-muradyan-path-to-tranquility-2096103   (the `slug` column)
 *   image-sitemap.xml  /artworks/78                                          (the bare id)
 *   <link rel=canonical>/artworks/path-to-tranquility-78                     (the real one)
 *
 * Every URL answers 200 — this SPA answers 200 for anything — so nothing looked broken.
 * What Google actually received was an invitation to crawl a page that then told it the
 * real address was somewhere else, and that real address was in no sitemap at all. No
 * artwork page has ever recorded an impression.
 *
 * These boot the REAL routes over in-memory sample data and read the XML the server
 * actually emits, because the defect was never in the URL helper — it was that the
 * sitemaps did not call it. A test of the helper alone would have passed throughout.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { registerRoutes } from "./routes";
import { storage } from "./storage";
import { artworkCanonicalUrl } from "@shared/canonical";

const BASE = "https://animuradyan.com";
let server: Server;
let origin: string;

beforeAll(async () => {
  const app = express();
  server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  origin = `http://127.0.0.1:${addr.port}`;
}, 30_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const locs = (xml: string): string[] =>
  [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

describe("sitemap.xml", () => {
  it("declares every artwork at the URL the page calls canonical", async () => {
    const xml = await (await fetch(`${origin}/sitemap.xml`)).text();
    const artworks = await storage.getAllArtworks();
    const declared = new Set(locs(xml));

    const listable = artworks.filter(
      (a) => a.title?.trim() && a.title.trim().toLowerCase() !== "untitled",
    );
    expect(listable.length).toBeGreaterThan(0);

    for (const a of listable) {
      // The exact string the page's <link rel="canonical"> and og:url carry.
      expect(declared).toContain(artworkCanonicalUrl(BASE, a));
    }
  });

  it("declares no artwork URL that is not canonical", async () => {
    const xml = await (await fetch(`${origin}/sitemap.xml`)).text();
    const artworks = await storage.getAllArtworks();
    const canonical = new Set(artworks.map((a) => artworkCanonicalUrl(BASE, a)));

    for (const loc of locs(xml).filter((l) => l.includes("/artworks/"))) {
      expect(canonical).toContain(loc);
    }
  });

  it("includes the pages that were earning without help", async () => {
    // /about was the second strongest page on the site (90 impressions, position 10.8)
    // and had never been submitted; /path carries her own writing.
    const declared = locs(await (await fetch(`${origin}/sitemap.xml`)).text());
    expect(declared).toContain(`${BASE}/about`);
    expect(declared).toContain(`${BASE}/path`);
  });

  it("is well-formed and lists each URL exactly once", async () => {
    const xml = await (await fetch(`${origin}/sitemap.xml`)).text();
    expect(xml.startsWith("<?xml")).toBe(true);
    const all = locs(xml);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("image-sitemap.xml", () => {
  it("hangs images off the canonical page URL, not the bare id", async () => {
    const xml = await (await fetch(`${origin}/image-sitemap.xml`)).text();
    const artworks = await storage.getAllArtworks();
    const canonical = new Set(artworks.map((a) => artworkCanonicalUrl(BASE, a)));

    const artworkLocs = locs(xml).filter((l) => !l.endsWith("/gallery"));
    expect(artworkLocs.length).toBeGreaterThan(0);
    for (const loc of artworkLocs) {
      expect(loc).not.toMatch(/\/artworks\/\d+$/); // the old bare-id form
      expect(canonical).toContain(loc);
    }
  });

  it("does not claim every painting is a portrait", async () => {
    // The caption asserted "abstract realism portrait painting" on all 154 images,
    // landscapes included. A caption is a claim, and that one was false.
    //
    // CHECKED ON THE GENERATED TITLE, NOT THE WHOLE DOCUMENT. The captions carry HER
    // descriptions, and one of them — "Rebirth" — correctly calls itself a contemporary
    // portrait painting, because it is one. Scanning the entire XML made a true sentence
    // of hers fail a test about a templated falsehood of ours, and it only ever passed
    // because the fixture happened to omit that work.
    const xml = await (await fetch(`${origin}/image-sitemap.xml`)).text();
    const titles = [...xml.matchAll(/<image:title>([\s\S]*?)<\/image:title>/g)].map((m) => m[1]!);
    expect(titles.length).toBeGreaterThan(0);
    for (const t of titles) expect(t).not.toMatch(/portrait painting/i);
  });

  it("escapes text so one ampersand cannot invalidate the document", async () => {
    const created = await storage.createArtwork({
      title: 'Sea & Sky <test>',
      description: "A & B",
      medium: "Oil on canvas",
      dimensions: "10x10cm",
      year: 2026,
      price: 100,
      images: ["https://cdn.example.com/a.jpg?a=1&b=2"],
      type: "oil",
      size: "small",
      availability: "available",
    } as never);
    try {
      const xml = await (await fetch(`${origin}/image-sitemap.xml`)).text();
      expect(xml).toContain("Sea &amp; Sky");
      expect(xml).not.toContain("Sea & Sky");
      expect(xml).toContain("a=1&amp;b=2");
    } finally {
      await storage.deleteArtwork((created as { id: number }).id);
    }
  });
});
