/**
 * /artworks — the transactional landing surface.
 *
 * Every assertion here encodes something that was live and wrong on 2026-08-18: 53 internal
 * links pointing at URLs the artwork pages disown, an ItemList declaring 35 offers whose
 * prices appeared nowhere a reader could see them, and two <h1>s of which the visible one
 * said only "Originals".
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import { registerRoutes } from "./routes";
import { storage } from "./storage";
import { artworkCanonicalUrl, artworkCanonicalPath } from "@shared/canonical";
import { ARTWORKS_TITLE } from "@shared/pageMeta";
import { ARTWORK_PRICE_CURRENCY, artworkImageUrl, isPurchasable } from "@shared/artworkSsr";

const BASE = "https://animuradyan.com";
let server: Server;
let origin: string;

beforeAll(async () => {
  // The prerender + ItemList injection lives behind NODE_ENV==="production" and reads the
  // built index.html, so these assertions only mean anything against a real build. Testing
  // the dev path would prove nothing about what production serves.
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

const itemList = async () => {
  const html = await (await fetch(`${origin}/artworks`)).text();
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
    .map((m) => JSON.parse(m[1].replace(/\\u003c/g, "<")));
  return blocks.find((b) => b["@type"] === "ItemList");
};

describe("internal links point at the canonical artwork URL", () => {
  it("every prerendered artwork link is canonical", async () => {
    const html = await (await fetch(`${origin}/artworks`)).text();
    const ssr = /<section id="artworks-ssr"[\s\S]*?<\/section>/.exec(html)![0];
    const hrefs = [...ssr.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
    const artworks = await storage.getAllArtworks();
    const canonical = new Set(artworks.map((a) => artworkCanonicalPath(a)));

    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) expect(canonical).toContain(h);
  });

  it("no marketplace-slug link survives", async () => {
    const html = await (await fetch(`${origin}/artworks`)).text();
    expect(html).not.toMatch(/href="\/artworks\/ani-muradyan-[a-z0-9-]*-\d{6,}"/);
  });
});

describe("the page states what it is, once", () => {
  it("serves the shared title, so the client cannot render a different one", async () => {
    const html = await (await fetch(`${origin}/artworks`)).text();
    expect(/<title>([^<]*)<\/title>/.exec(html)![1]).toBe(ARTWORKS_TITLE);
    expect(ARTWORKS_TITLE).toBe("Original Oil Paintings for Sale — Ani Muradyan");
  });

  it("carries exactly one h1, and it names the work rather than the section", async () => {
    const html = await (await fetch(`${origin}/artworks`)).text();
    expect(html.match(/<h1/g) ?? []).toHaveLength(1);
    expect(html).toContain(">Original Oil Paintings</h1>");
  });
});

describe("what the page says about buying agrees with what it tells Google", () => {
  it("prices in the visible copy match the ItemList offers exactly", async () => {
    const html = await (await fetch(`${origin}/artworks`)).text();
    const list = await itemList();
    const offers = list.itemListElement.filter((i: any) => i.item.offers);
    expect(offers.length).toBeGreaterThan(0);
    for (const { item } of offers) {
      expect(item.offers.priceCurrency).toBe(ARTWORK_PRICE_CURRENCY);
      const shown = `${ARTWORK_PRICE_CURRENCY} ${Number(item.offers.price).toLocaleString("en-US")}`;
      expect(html).toContain(shown);
    }
  });

  it("a sold work gets no Offer and is not advertised as available", async () => {
    const list = await itemList();
    const artworks = await storage.getAllArtworks();
    const sold = new Set(artworks.filter((a) => !isPurchasable(a)).map((a) => a.title));
    for (const { item } of list.itemListElement) {
      if (sold.has(item.name)) expect(item.offers).toBeUndefined();
    }
    const html = await (await fetch(`${origin}/artworks`)).text();
    expect(html).toContain("in a private collection");
  });

  it("offer count equals the number of genuinely purchasable works", async () => {
    const list = await itemList();
    const artworks = await storage.getAllArtworks();
    const purchasable = artworks.filter(isPurchasable).length;
    expect(list.itemListElement.filter((i: any) => i.item.offers)).toHaveLength(purchasable);
  });
});

describe("the ItemList describes the paintings", () => {
  it("every item carries its own primary image", async () => {
    const list = await itemList();
    const artworks = await storage.getAllArtworks();
    const byTitle = new Map(artworks.map((a) => [a.title, a]));
    for (const { item } of list.itemListElement) {
      expect(item.image).toBeTruthy();
      const a = byTitle.get(item.name);
      if (a) expect(item.image).toBe(artworkImageUrl(a, BASE));
    }
  });

  it("every item url is the canonical one", async () => {
    const list = await itemList();
    const artworks = await storage.getAllArtworks();
    const canonical = new Set(artworks.map((a) => artworkCanonicalUrl(BASE, a)));
    for (const { item } of list.itemListElement) expect(canonical).toContain(item.url);
  });

  it("every item's artist resolves to the ONE canonical #person entity", async () => {
    const list = await itemList();
    expect(list.itemListElement.length).toBeGreaterThan(0);
    for (const { item } of list.itemListElement) {
      expect(item.artist).toMatchObject({ "@type": "Person", "@id": `${BASE}/#person`, name: "Ani Muradyan" });
    }
  });
});
