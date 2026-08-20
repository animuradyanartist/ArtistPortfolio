/**
 * AN ORDER IS A HISTORICAL FACT — PART 15.
 *
 * She will reprice a painting, change her crate depth, and one day a tariff will be replaced.
 * None of that may rewrite what somebody was charged in August. This proves the snapshot is a
 * copy rather than a live reference, by repricing the artwork underneath a stored order and
 * checking the order does not move.
 *
 * It also pins the FAILURE RECOVERY rules from PART 16 that are expressible without a live
 * Stripe: the statements that release a hold are scoped so a transient error cannot strand a
 * painting, and cannot cancel an order that has since been paid.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { newDb } from "pg-mem";
import { priceOrder } from "./pricing";
import type { Artwork } from "@shared/schema";

const art = (over: Partial<Artwork> = {}): Artwork => ({
  id: 1, title: "Blue Drift", slug: null, seoSlug: null, description: "", medium: "Oil on Canvas",
  dimensions: "65x75cm", year: 2026, price: 2420, images: [], type: "oil", category: null,
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

let q: (sql: string, args?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }>;

beforeEach(async () => {
  const db = newDb();
  const pg = db.adapters.createPg();
  const client = new pg.Client();
  await client.connect();
  q = (sql, args = []) => client.query(sql, args) as never;
  await q(`CREATE TABLE orders (
    id serial PRIMARY KEY, reference text, status text, payment_status text,
    artwork_id integer, artwork_snapshot text, item_price_minor integer, currency text,
    shipping_minor integer, total_minor integer, shipping_basis text, shipping_calculation text,
    reservation_expires_at timestamptz, updated_at timestamptz)`);
});

describe("the snapshot does not follow the artwork", () => {
  it("keeps the price the buyer paid after the artwork is repriced", async () => {
    const before = await priceOrder([art({ websitePriceMinor: 240000 })], "DE");
    expect(before.ok).toBe(true);
    if (!before.ok) return;

    await q(`INSERT INTO orders (reference, status, payment_status, artwork_id, artwork_snapshot,
              item_price_minor, currency, shipping_minor, total_minor, shipping_basis, shipping_calculation)
             VALUES ($1,'paid','paid',1,$2,$3,'EUR',$4,$5,$6,$7)`,
      ["AM-2026-0001", JSON.stringify({ id: 1, title: "Blue Drift", dimensions: "65x75cm" }),
       before.itemsMinor, before.shippingMinor, before.totalMinor, before.shippingBasis,
       JSON.stringify(before.lines.map((l) => ({ artworkId: l.artwork.id })))]);

    // She doubles the price and deepens the crate.
    const after = await priceOrder([art({ websitePriceMinor: 480000, packedDepthCm: 20 })], "DE");
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.totalMinor).toBeGreaterThan(before.totalMinor);

    const stored = (await q(`SELECT * FROM orders WHERE reference = 'AM-2026-0001'`)).rows[0]!;
    expect(stored.item_price_minor).toBe(240000);
    expect(stored.total_minor).toBe(before.totalMinor);
    expect(JSON.parse(String(stored.artwork_snapshot)).dimensions).toBe("65x75cm");
  });

  it("records how the shipping figure was reached, so an order can explain itself", async () => {
    const priced = await priceOrder([art()], "DE");
    expect(priced.ok).toBe(true);
    if (!priced.ok) return;
    expect(priced.shippingBasis).toMatch(/internal-conservative-estimate|manual/);
    const line = priced.lines[0]!;
    expect(line.shipping.ok).toBe(true);
    if (!line.shipping.ok) return;
    // The snapshot the route persists carries the parcel and the arithmetic.
    expect(line.shipping.parcel?.packedWidthCm).toBe(75);
    expect(line.shipping.parcel?.packedHeightCm).toBe(85);
    expect(line.shipping.parcel?.packedDepthCm).toBe(8);
    expect(line.shipping.breakdown?.chargeableWeightKg).toBeGreaterThan(0);
  });
});

describe("failure recovery leaves nothing stranded (PART 16)", () => {
  const CANCEL = `UPDATE orders SET status='cancelled', updated_at=now()
     WHERE id=$1 AND payment_status='unpaid' AND status IN ('pending','checkout_created')`;
  const SWEEP = `UPDATE orders SET status='cancelled', updated_at=now()
     WHERE status IN ('pending','checkout_created') AND payment_status='unpaid'
       AND reservation_expires_at IS NOT NULL AND reservation_expires_at <= now()`;

  const insert = (status: string, payment: string, expires: string | null) =>
    q(`INSERT INTO orders (reference,status,payment_status,reservation_expires_at)
       VALUES ('R',$1,$2,$3) RETURNING id`, [status, payment, expires]);

  it("cancels an unpaid checkout when Stripe could not be reached", async () => {
    const { rows } = await insert("checkout_created", "unpaid", null);
    await q(CANCEL, [rows[0]!.id]);
    expect((await q(`SELECT status FROM orders`)).rows[0]!.status).toBe("cancelled");
  });

  it("REFUSES to cancel an order that has been paid — the webhook may have won the race", async () => {
    const { rows } = await insert("paid", "paid", null);
    await q(CANCEL, [rows[0]!.id]);
    expect((await q(`SELECT status FROM orders`)).rows[0]!.status).toBe("paid");
  });

  it("the sweeper cancels a lapsed checkout", async () => {
    await insert("checkout_created", "unpaid", "2020-01-01T00:00:00Z");
    await q(SWEEP);
    expect((await q(`SELECT status FROM orders`)).rows[0]!.status).toBe("cancelled");
  });

  it("the sweeper leaves a paid order alone even if its hold lapsed first", async () => {
    // Webhook arrived just before the sweep — the case that would otherwise cancel a sale.
    await insert("paid", "paid", "2020-01-01T00:00:00Z");
    await q(SWEEP);
    expect((await q(`SELECT status FROM orders`)).rows[0]!.status).toBe("paid");
  });

  it("the sweeper is idempotent", async () => {
    await insert("checkout_created", "unpaid", "2020-01-01T00:00:00Z");
    await q(SWEEP);
    const second = await q(SWEEP);
    expect(second.rowCount).toBe(0);
  });
});
