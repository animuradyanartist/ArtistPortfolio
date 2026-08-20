/**
 * THE AUTHORITATIVE SCHEMA MUST KNOW ABOUT COMMERCE — permanently.
 *
 * On 2026-08-20 a Replit publish proposed DROP TABLE orders CASCADE, DROP TABLE stripe_events
 * CASCADE, and the removal of every commerce column from artworks. The publish was cancelled.
 *
 * Two things made that possible, and both are pinned here:
 *
 *   1. `blog_posts` was excluded by `tablesFilter` while still being DECLARED in this schema.
 *      drizzle-kit hides a filtered table when reading the database, sees it declared, and
 *      concludes it has not been created — then offers every real table it cannot account for
 *      as a rename candidate ("orders › blog_posts"). Decline, and those tables are "extra",
 *      which is a DROP. The rule that prevents it: a table is either DECLARED and UNFILTERED,
 *      or FILTERED and UNDECLARED. Never both.
 *
 *   2. The commerce model existed in the database (via boot DDL) but not in the schema
 *      drizzle-kit read. Anything the schema does not declare is, to drizzle-kit, something to
 *      remove. Boot DDL is a safety net for un-migrated databases; it is not a source of truth.
 *
 * These assertions are cheap and they fail loudly. They cannot catch a STALE WORKSPACE — a
 * checkout that predates this file — but they guarantee that whatever tree contains this test
 * declares the full commerce model.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { artworks, orders, stripeEvents } from "./schema";

const ROOT = path.resolve(__dirname, "..");
const columnNames = (t: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(t).columns.map((c) => c.name);

describe("the commerce model is declared in the authoritative schema", () => {
  const REQUIRED_ARTWORK_COLUMNS = [
    "direct_sale_enabled", "website_price_minor", "website_currency",
    "shipping_enabled", "shipping_override_minor", "shipping_destination_overrides",
    "packed_depth_cm", "packing_margin_cm", "fulfilment_notes",
    "reserved_until", "reserved_by_order_id",
    "has_commitment", "commitment_type", "commitment_details", "commitment_until",
  ];

  it("declares every commerce and reservation column on artworks", () => {
    const have = columnNames(artworks);
    for (const c of REQUIRED_ARTWORK_COLUMNS) expect(have).toContain(c);
  });

  it("still declares the pre-existing artwork columns, including the marketplace price", () => {
    const have = columnNames(artworks);
    for (const c of ["id", "title", "price", "availability", "images", "slug", "seo_slug"]) {
      expect(have).toContain(c);
    }
  });

  it("declares the orders table with every column an order snapshot needs", () => {
    const have = columnNames(orders);
    for (const c of [
      "id", "reference", "status", "payment_status",
      "buyer_name", "buyer_email", "buyer_phone",
      "ship_country", "ship_address1", "ship_city", "ship_postal_code",
      "item_type", "artwork_id", "artwork_snapshot",
      "item_price_minor", "currency", "shipping_minor", "total_minor",
      "shipping_basis", "shipping_calculation",
      "stripe_checkout_session_id", "stripe_payment_intent_id",
      "reserved_at", "reservation_expires_at", "paid_at",
      "shipping_carrier", "tracking_number", "attribution",
    ]) expect(have).toContain(c);
  });

  it("declares the stripe_events idempotency ledger", () => {
    expect(columnNames(stripeEvents)).toEqual(expect.arrayContaining(["event_id", "type"]));
  });

  it("declares the indexes the reservation and order code depend on", () => {
    const artworkIdx = getTableConfig(artworks).indexes.map((i) => i.config.name);
    // Dropped silently by every `drizzle-kit push` while it lived only in the boot DDL.
    expect(artworkIdx).toContain("artworks_reserved_until_idx");

    const orderIdx = getTableConfig(orders).indexes.map((i) => i.config.name);
    expect(orderIdx).toContain("orders_reference_unique");
    expect(orderIdx).toContain("orders_stripe_session_unique");
  });
});

describe("drizzle.config and the schema must not contradict each other", () => {
  const config = fs.readFileSync(path.join(ROOT, "drizzle.config.ts"), "utf8");
  const schema = fs.readFileSync(path.join(ROOT, "shared/schema.ts"), "utf8");

  /** Table names excluded via `!name` entries in tablesFilter. */
  const filtered = (): string[] => {
    const m = /tablesFilter:\s*\[([^\]]*)\]/.exec(config);
    if (!m) return [];
    return [...m[1]!.matchAll(/"!([a-z_]+)"/g)].map((x) => x[1]!);
  };

  it("never filters a table that this schema declares", () => {
    // The exact contradiction that produced the destructive migration.
    const declaredTables = [...schema.matchAll(/pgTable\("([a-z_]+)"/g)].map((m) => m[1]!);
    for (const f of filtered()) {
      expect(declaredTables, `"${f}" is filtered out of drizzle-kit AND declared in shared/schema.ts — that combination makes drizzle-kit offer to rename or drop real tables`).not.toContain(f);
    }
  });

  it("does not filter the commerce tables", () => {
    expect(filtered()).not.toContain("orders");
    expect(filtered()).not.toContain("stripe_events");
    expect(filtered()).not.toContain("artworks");
  });

  it("keeps blog_posts unfiltered, so it is diffed rather than guessed at", () => {
    expect(filtered()).not.toContain("blog_posts");
  });
});

describe("the boot DDL stays a safety net, not the only source of truth", () => {
  const boot = fs.readFileSync(path.join(ROOT, "server/index.ts"), "utf8");

  it("still creates the commerce schema for an un-migrated database", () => {
    for (const frag of [
      "ADD COLUMN IF NOT EXISTS direct_sale_enabled",
      "ADD COLUMN IF NOT EXISTS website_price_minor",
      "ADD COLUMN IF NOT EXISTS reserved_until",
      "ADD COLUMN IF NOT EXISTS has_commitment",
      "CREATE TABLE IF NOT EXISTS orders",
      "CREATE TABLE IF NOT EXISTS stripe_events",
      "artworks_reserved_until_idx",
    ]) expect(boot).toContain(frag);
  });

  it("every column the boot DDL adds to artworks is also declared in the schema", () => {
    const added = [...boot.matchAll(/ALTER TABLE artworks ADD COLUMN IF NOT EXISTS ([a-z_]+)/g)].map((m) => m[1]!);
    const declared = columnNames(artworks);
    for (const c of added) {
      expect(declared, `boot DDL creates artworks.${c} but shared/schema.ts does not declare it — drizzle-kit will propose dropping it`).toContain(c);
    }
  });
});
