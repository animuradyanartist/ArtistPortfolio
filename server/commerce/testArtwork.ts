/**
 * PRODUCTION FULL-JOURNEY TEST — a real, purchasable $1 artwork, isolated and removable.
 *
 * WHY THIS EXISTS. The $1 payment harness (testCheckout.ts) verifies Stripe → webhook → order,
 * but with `artwork_id: null` it deliberately skips inventory, reservation, "Sold", the tracking
 * page and Admin fulfilment. To test the WHOLE collector journey we need a REAL artwork that
 * flows through the genuine Buy-Now → reserve → checkout → webhook → markSold pipeline. There is
 * no way to create that row without DB/admin access, so this harness creates ONE — through the
 * SAME `storage.createArtwork` path Admin uses — and nothing else about the purchase is special.
 *
 * SAFETY — the same posture as testCheckout.ts:
 *   • FAILS CLOSED. Every route 404s unless the test harness is armed (`ENABLE_TEST_CHECKOUT=1`
 *     AND `TEST_CHECKOUT_TOKEN` set) and the token matches — the identical secrets and the same
 *     constant-time check the $1 harness already uses. No new secret.
 *   • ISOLATED BY `source="production-test"`. `storage.getAllArtworks()` excludes that source, so
 *     the item never appears in the gallery, sitemap, SSR pages or search — only at its own
 *     `/artworks/:id` URL, which is what makes Buy-Now reachable. The purchase path reads by id.
 *   • FREE, EXACT $1.00. `pricing.ts` ships a `production-test` item for $0 (see the note there),
 *     so the total is exactly $1.00 USD with no shipping and no tax.
 *   • REMOVABLE. The cleanup route deletes the row (no FK cascade, so the paid ORDER — the
 *     evidence — is preserved). Remove this file + the two marked branches to retire the harness.
 */
import type { Express, Request, Response } from "express";
import type { InsertArtwork } from "@shared/schema";
import { storage } from "../storage";
import { pool } from "../db";
import { testCheckoutEnabled, verifyToken } from "./testCheckout";

/** The one marker the rest of the system keys on. Real catalogue rows never use it. */
export const TEST_ARTWORK_SOURCE = "production-test";
const TEST_ARTWORK_TITLE = "TEST — Production Journey · please do not buy";
/** An external https image; the /img/:kind/:id/:idx route 302-redirects to it (not base64). */
const TEST_ARTWORK_IMAGE = "https://picsum.photos/seed/pspjourney/1200/1500";

function testArtworkValues(): InsertArtwork {
  return {
    title: TEST_ARTWORK_TITLE,
    description:
      "Automated production test item — not a real artwork. Priced at $1.00 with free shipping, " +
      "it exists only to verify the end-to-end purchase journey and is safe to remove.",
    medium: "Production test",
    dimensions: "30 × 40 cm",
    year: 2026,
    price: 1, // legacy marketplace integer; unused for direct sale
    images: [TEST_ARTWORK_IMAGE],
    type: "oil",
    size: "small",
    availability: "available",
    source: TEST_ARTWORK_SOURCE,
    directSaleEnabled: true,
    websitePriceMinor: 100, // $1.00
    websiteCurrency: "USD",
    shippingEnabled: true, // required to be purchasable; shipping is zeroed in pricing.ts for this source
    featured: false,
  } as InsertArtwork;
}

async function findTestArtworkIds(): Promise<number[]> {
  const { rows } = await pool.query(
    `SELECT id FROM artworks WHERE source = $1 ORDER BY id DESC`, [TEST_ARTWORK_SOURCE],
  );
  return rows.map((r) => r.id as number);
}

export function registerTestArtworkRoutes(app: Express): void {
  // Create a fresh, available $1 test artwork and return its public URL. (Re-runnable: each call
  // makes a new one; cleanup removes them all. They are invisible to the public regardless.)
  app.post("/api/commerce/test-artwork", async (req: Request, res: Response) => {
    if (!testCheckoutEnabled() || !verifyToken(req.body?.t)) return res.status(404).json({ message: "Not found" });
    try {
      const art = await storage.createArtwork(testArtworkValues());
      return res.json({ ok: true, artworkId: art.id, url: `/artworks/${art.id}` });
    } catch (e) {
      return res.status(500).json({
        message: "Could not create the test artwork.",
        detail: e instanceof Error ? e.message.slice(0, 200) : undefined,
      });
    }
  });

  // Read-only status of the test artwork(s) — for verifying Sold / reservation state post-payment.
  app.get("/api/commerce/test-artwork", async (req: Request, res: Response) => {
    if (!testCheckoutEnabled() || !verifyToken(req.query.t)) return res.status(404).json({ message: "Not found" });
    const ids = await findTestArtworkIds();
    const items = await Promise.all(ids.map(async (id) => {
      const a = await storage.getArtwork(id);
      return a
        ? { artworkId: id, url: `/artworks/${id}`, availability: a.availability,
            directSaleEnabled: a.directSaleEnabled ?? false,
            reservedUntil: a.reservedUntil ?? null, reservedByOrderId: a.reservedByOrderId ?? null }
        : { artworkId: id, url: `/artworks/${id}`, availability: null };
    }));
    return res.json({ count: items.length, items });
  });

  // Remove all test artworks from the database. The paid ORDER is NOT touched (no FK cascade),
  // so the payment/email evidence is preserved.
  app.post("/api/commerce/test-artwork/cleanup", async (req: Request, res: Response) => {
    if (!testCheckoutEnabled() || !verifyToken(req.body?.t)) return res.status(404).json({ message: "Not found" });
    try {
      const ids = await findTestArtworkIds();
      let removed = 0;
      for (const id of ids) if (await storage.deleteArtwork(id)) removed += 1;
      return res.json({ ok: true, removed, ids });
    } catch (e) {
      return res.status(500).json({
        message: "Could not remove the test artwork.",
        detail: e instanceof Error ? e.message.slice(0, 200) : undefined,
      });
    }
  });
}
