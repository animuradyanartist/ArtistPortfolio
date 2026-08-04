// READ-ONLY. Identifies the database that the current shell's DATABASE_URL
// points at, and reports whether it is the "development / source" database
// Replit Deploy diffs against production.
//
// Background: Replit's built-in PostgreSQL injects a DIFFERENT DATABASE_URL into
// the WORKSPACE (development) than into the DEPLOYMENT (production). So the dev
// database is not DEV_DATABASE_URL — it is whatever DATABASE_URL resolves to
// here in the Shell. Replit's Publish step compares this workspace DB's schema
// to the production DB and proposes to drop anything prod has that this one
// lacks.
//
// This script writes NOTHING. It prints only host + db name (never the
// password/token) and the NAMES of DB-related env vars (never their values).
//
// Run in the Replit Shell:  node scripts/db-diff.mjs
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

// The three tables Replit Deploy proposed to DROP from production. They exist in
// prod (created at runtime) and the deploy drops them because the source DB
// lacks them. So: a DB MISSING any of these is the dev/source DB, never prod.
const RUNTIME_TABLES = ["session", "path_settings", "app_migrations"];

// 1) Which DB-related env vars exist? (names only — no values printed)
const dbEnvNames = Object.keys(process.env)
  .filter((k) => /(DATABASE|POSTGRES|^PG|NEON|REPLIT)/i.test(k))
  .sort();
console.log("DB-related env var NAMES present in this shell (values hidden):");
console.log(dbEnvNames.length ? dbEnvNames.map((n) => "   " + n).join("\n") : "   (none)");
console.log("");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set in this shell — cannot inspect. Stop here and tell me.");
  process.exit(1);
}

function identify(u) {
  try {
    const p = new URL(u);
    return { host: p.hostname, db: p.pathname.slice(1) || "(unknown)" };
  } catch {
    return { host: "(unparseable)", db: "(unparseable)" };
  }
}
const id = identify(url);

const pool = new Pool({ connectionString: url });
try {
  const { rows: tRows } = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' ORDER BY table_name`
  );
  const tables = new Set(tRows.map((r) => r.table_name));
  const { rows: iRows } = await pool.query(
    `SELECT indexname FROM pg_indexes
     WHERE schemaname='public' AND tablename='artworks' ORDER BY indexname`
  );
  const { rows: cRows } = await pool.query(`SELECT count(*)::int AS n FROM artworks`).catch(() => [{ n: "?" }]);

  console.log("DATABASE_URL points at:");
  console.log(`   host : ${id.host}`);
  console.log(`   db   : ${id.db}`);
  console.log(`   artworks rows: ${cRows[0].n}`);
  console.log("");
  console.log("Runtime tables (the ones the deploy wants to DROP from prod):");
  for (const t of RUNTIME_TABLES) {
    console.log(`   ${tables.has(t) ? "✓ present" : "✗ MISSING"}  ${t}`);
  }
  console.log("");
  console.log("artworks indexes:");
  console.log("   " + (iRows.map((r) => r.indexname).join(", ") || "(none)"));
  console.log("");

  const missing = RUNTIME_TABLES.filter((t) => !tables.has(t));
  const line = "─".repeat(64);
  console.log(line);
  if (missing.length > 0) {
    console.log(
      `VERDICT: this is the DEVELOPMENT / source database (missing ${missing.join(", ")}).`
    );
    console.log("It is SAFE to align — production has these tables and is a different DB.");
    console.log("Next: node scripts/align-dev-schema.mjs");
  } else {
    console.log("VERDICT: this DB already has all runtime tables.");
    console.log("It is EITHER production OR an already-aligned dev DB. Do NOT align it.");
    console.log("If the deploy still shows drops, the source DB is elsewhere — send me this output.");
  }
  console.log(line);
} finally {
  await pool.end();
}
