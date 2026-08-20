#!/usr/bin/env node
/**
 * BRING THE DEVELOPMENT DATABASE UP TO DATE — the thing that stops Replit deleting production.
 *
 *   npm run db:sync
 *
 * WHY THIS EXISTS. Replit Publishing does not compare shared/schema.ts with production. It
 * syncs the DEVELOPMENT database's schema ONTO production, so anything present in production
 * and absent from development is scheduled for DELETION.
 *
 * The commerce schema reached production because the deployed app booted and ran the self-heal
 * DDL. It never reached development, because the workspace app was not started after the pull
 * and the [postMerge] hook that runs `db:push` is capped at 20 seconds — less than an
 * `npm install` on this project takes. Development stayed behind, and the publish preview
 * offered to drop every commerce column and table.
 *
 * So this applies the SAME list the app applies at boot, directly, in about a second, with no
 * build, no app start, and no npm install needing to finish first.
 *
 * IT ONLY EVER ADDS. Every statement is ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS /
 * CREATE INDEX IF NOT EXISTS. It cannot drop a column, drop a table, or alter existing data —
 * on any database it is pointed at.
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Read the statements out of the TypeScript module without needing a build step. */
function statements() {
  const src = readFileSync(path.join(root, "server/selfHealDdl.ts"), "utf8");
  const body = src.slice(src.indexOf("export const SELF_HEAL_DDL"));
  return [...body.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()).filter(Boolean);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run this inside the Replit workspace, where it points\n" +
                "at the DEVELOPMENT database — the one Replit syncs onto production.");
  process.exit(2);
}

const list = statements();
console.log(`Applying ${list.length} idempotent statements to the development database…`);

const pool = new pg.Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 10_000 });
let applied = 0;
try {
  for (const s of list) {
    await pool.query(s);
    applied++;
  }
  // Report what matters, so the operator sees the thing that was missing.
  const { rows } = await pool.query(`
    SELECT
      (SELECT count(*) FROM information_schema.columns
        WHERE table_name='artworks' AND column_name IN
        ('direct_sale_enabled','website_price_minor','website_currency','shipping_enabled',
         'shipping_override_minor','shipping_destination_overrides','packed_depth_cm',
         'packing_margin_cm','fulfilment_notes','reserved_until','reserved_by_order_id',
         'has_commitment','commitment_type','commitment_details','commitment_until'))::int AS commerce_cols,
      (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename IN ('orders','stripe_events'))::int AS commerce_tables,
      (SELECT count(*) FROM pg_indexes WHERE indexname='artworks_reserved_until_idx')::int AS sweeper_index`);
  const r = rows[0];
  console.log(`  ${applied}/${list.length} applied`);
  console.log(`  commerce columns on artworks : ${r.commerce_cols}/15`);
  console.log(`  commerce tables              : ${r.commerce_tables}/2  (orders, stripe_events)`);
  console.log(`  sweeper index                : ${r.sweeper_index}/1`);
  const ok = r.commerce_cols === 15 && r.commerce_tables === 2 && r.sweeper_index === 1;
  console.log(ok
    ? "\nDevelopment now matches what production has. A publish preview should propose no drops."
    : "\nSTILL INCOMPLETE — do not publish. Something above is short; report the numbers.");
  process.exitCode = ok ? 0 : 1;
} catch (e) {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
