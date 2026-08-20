/**
 * FOUR PRICES, FOUR MEANINGS, NO LEAKAGE.
 *
 * She has (or will have) four different numbers attached to one painting:
 *
 *   marketplace price   `artworks.price`          — the Singulart listing, this DB
 *   website sale price  `artworks.websitePriceMinor` — what this site charges, this DB
 *   artist price        `artistPrice`             — private floor, ani-muradyan-portfolio
 *   retail price        `retailPrice`             — private reference, ani-muradyan-portfolio
 *
 * The last two live in a SEPARATE project with its own store, so this file cannot import them.
 * What it can prove — and does — is that this system never reads, writes or derives from any
 * price other than `websitePriceMinor`, which is what makes the other two safe by construction.
 */
import { describe, it, expect } from "vitest";
import { priceOrder } from "./pricing";
import { insertArtworkSchema } from "@shared/schema";
import fs from "node:fs";
import path from "node:path";
import type { Artwork } from "@shared/schema";

const base = (over: Partial<Artwork> = {}): Artwork => ({
  id: 1, title: "W", slug: null, seoSlug: null, description: "", medium: "Oil on Canvas",
  dimensions: "65x75cm", year: 2026, price: 9999, images: [], type: "oil", category: null,
  size: "medium", availability: "available", saatchiUrl: null, buyLink: null, featured: false,
  position: 0, availableForPrint: false, printSizes: null, preferredPrintMaterial: null,
  singulartId: null, source: "manual", detailImagesChecked: false, sourceDescription: null,
  sourceDescriptionProvider: null, derivedCategories: null,
  directSaleEnabled: true, websitePriceMinor: 240000, websiteCurrency: "EUR",
  shippingEnabled: true, shippingOverrideMinor: null, shippingDestinationOverrides: null,
  packedDepthCm: null, packingMarginCm: null, fulfilmentNotes: null,
  reservedUntil: null, reservedByOrderId: null,
  hasCommitment: false, commitmentType: null, commitmentDetails: null, commitmentUntil: null,
  ...over,
} as Artwork);

describe("the website price and the marketplace price are independent", () => {
  it("charges the website price and ignores the marketplace price entirely", async () => {
    const r = await priceOrder([base({ price: 9999, websitePriceMinor: 240000 })], "DE");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.itemsMinor).toBe(240000);
  });

  it("moving the marketplace price does not move what is charged", async () => {
    const a = await priceOrder([base({ price: 1 })], "DE");
    const b = await priceOrder([base({ price: 500000 })], "DE");
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.totalMinor).toBe(b.totalMinor);
  });

  it("moving the website price does not require or touch the marketplace price", async () => {
    const row = base({ price: 2420, websitePriceMinor: 300000 });
    const r = await priceOrder([row], "DE");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.itemsMinor).toBe(300000);
    // The row object is not mutated by pricing — an order reads, it does not write back.
    expect(row.price).toBe(2420);
  });

  it("refuses to sell on a marketplace price alone — the leak that must never happen", async () => {
    const r = await priceOrder([base({ price: 2420, websitePriceMinor: null })], "DE");
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.kind === "not-purchasable") {
      expect(r.error.reasons).toContain("no-website-price");
    }
  });
});

describe("the other project's private prices are not modelled here", () => {
  /**
   * `artistPrice` and `retailPrice` belong to ani-muradyan-portfolio's own commercial
   * workflow, where they are in PRIVATE_ARTWORK_FIELDS and never published. Adding them to
   * this schema would create a second, competing definition of the same number. This test
   * fails if anybody ever does.
   */
  it("has no artistPrice or retailPrice column", () => {
    const shape = Object.keys(insertArtworkSchema.shape);
    expect(shape).not.toContain("artistPrice");
    expect(shape).not.toContain("retailPrice");
  });

  it("names no other price anywhere in the commerce source", () => {
    const dir = path.resolve(__dirname, "..", "..");
    const files = [
      "server/commerce/pricing.ts", "server/commerce/routes.ts", "server/commerce/orders.ts",
      "shared/commerce/purchasable.ts", "shared/commerce/shipping.ts",
    ];
    for (const f of files) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      // Comments explaining the separation are fine; code that reads them is not.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code).not.toMatch(/\bartistPrice\b/);
      expect(code).not.toMatch(/\bretailPrice\b/);
      // `.price` is the marketplace column; commerce must never read it.
      expect(code).not.toMatch(/artwork\.price\b/);
      expect(code).not.toMatch(/a\.price\b/);
    }
  });
});

describe("commitments block a sale (PART 7)", () => {
  it("an open-ended commitment blocks", async () => {
    const r = await priceOrder([base({ hasCommitment: true, commitmentUntil: null })], "DE");
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.kind === "not-purchasable") expect(r.error.reasons).toContain("committed");
  });

  it("an active dated commitment blocks", async () => {
    const future = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
    const r = await priceOrder([base({ hasCommitment: true, commitmentUntil: future })], "DE");
    expect(r.ok).toBe(false);
  });

  it("an EXPIRED commitment does not block", async () => {
    const past = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const r = await priceOrder([base({ hasCommitment: true, commitmentUntil: past })], "DE");
    expect(r.ok).toBe(true);
  });

  it("an unreadable date blocks rather than releasing the work", async () => {
    const r = await priceOrder([base({ hasCommitment: true, commitmentUntil: "soon" })], "DE");
    expect(r.ok).toBe(false);
  });

  it("a cleared flag does not block, whatever the date says", async () => {
    const r = await priceOrder([base({ hasCommitment: false, commitmentUntil: "2099-01-01" })], "DE");
    expect(r.ok).toBe(true);
  });
});
