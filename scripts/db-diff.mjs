// Read-only schema comparison of the DEV vs PROD databases.
//
// Replit Deploy generates its "apply to production" migration by diffing the
// DEVELOPMENT database (DEV_DATABASE_URL, neondb_dev) against PRODUCTION
// (DATABASE_URL, neondb). Any table that exists in prod but NOT in dev is
// proposed for DROP. This script shows that divergence so we can confirm the
// cause before changing anything. It only runs SELECTs — it writes nothing.
//
// Run in the Replit Shell:  node scripts/db-diff.mjs
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const PROD = process.env.DATABASE_URL;
const DEV = process.env.DEV_DATABASE_URL;

if (!PROD) {
  console.error("DATABASE_URL is not set — cannot read production.");
  process.exit(1);
}
if (!DEV) {
  console.error(
    "DEV_DATABASE_URL is not set. That means the workspace shares one DB with prod\n" +
      "and Replit Deploy should NOT be diffing two databases. Re-check the deploy screen."
  );
  process.exit(1);
}
if (DEV === PROD) {
  console.error("DEV_DATABASE_URL === DATABASE_URL — they are the same DB; no diff expected.");
  process.exit(1);
}

async function inspect(label, connectionString) {
  const pool = new Pool({ connectionString });
  try {
    const { rows: tables } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`
    );
    const { rows: idx } = await pool.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'artworks' ORDER BY indexname`
    );
    const dbName = new URL(connectionString).pathname.slice(1);
    return {
      label,
      dbName,
      tables: tables.map((r) => r.table_name),
      artworksIndexes: idx.map((r) => r.indexname),
    };
  } finally {
    await pool.end();
  }
}

const prod = await inspect("PROD", PROD);
const dev = await inspect("DEV ", DEV);

const line = "─".repeat(64);
console.log(line);
console.log(`PROD database: ${prod.dbName}`);
console.log(`DEV  database: ${dev.dbName}`);
console.log(line);

const prodSet = new Set(prod.tables);
const devSet = new Set(dev.tables);

const prodOnly = prod.tables.filter((t) => !devSet.has(t));
const devOnly = dev.tables.filter((t) => !prodSet.has(t));

console.log("\nTables in PROD but MISSING from DEV  → Replit Deploy will DROP these from prod:");
console.log(prodOnly.length ? prodOnly.map((t) => "   ✗ " + t).join("\n") : "   (none)");

console.log("\nTables in DEV but missing from PROD (would be CREATE-d on prod):");
console.log(devOnly.length ? devOnly.map((t) => "   + " + t).join("\n") : "   (none)");

console.log("\nartworks indexes:");
console.log("   PROD:", prod.artworksIndexes.join(", ") || "(none)");
console.log("   DEV :", dev.artworksIndexes.join(", ") || "(none)");

const seo = "artworks_seo_slug_unique";
const prodHasSeo = prod.artworksIndexes.includes(seo);
const devHasSeo = dev.artworksIndexes.includes(seo);
if (prodHasSeo !== devHasSeo) {
  console.log(
    `\n   ⚠ '${seo}' exists on ${prodHasSeo ? "PROD" : "DEV"} but not ${prodHasSeo ? "DEV" : "PROD"} → index migration.`
  );
}

console.log("\n" + line);
console.log(
  prodOnly.length === 0 && prodHasSeo === devHasSeo
    ? "✅ No prod-only tables and seo index matches — deploy diff should be empty."
    : "→ Run  node scripts/align-dev-schema.mjs  to add the missing objects to DEV (prod untouched)."
);
console.log(line);
