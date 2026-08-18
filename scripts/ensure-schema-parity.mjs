/**
 * ADDITIVE-ONLY. Brings the WORKSPACE (development) database up to the schema production
 * already has, so Replit's Publish stops proposing to DROP columns that hold real data.
 *
 *   node scripts/ensure-schema-parity.mjs           report only — writes NOTHING
 *   node scripts/ensure-schema-parity.mjs --apply   add the missing columns
 *
 * WHY THIS EXISTS. Replit's Publish compares THIS workspace database's schema against
 * production and proposes to drop anything production has that the workspace lacks. The
 * app's boot self-heal (server/index.ts) already creates every column below with
 * ADD COLUMN IF NOT EXISTS — but only when the app actually STARTS against a database.
 * Production runs it on every deploy; the workspace only runs it when someone presses Run.
 * So a column added since the last workspace start exists in production and nowhere else,
 * and the dev→prod sync reads that as "delete it".
 *
 * On 18 August 2026 that was source_description, source_description_provider and
 * derived_categories — 36 descriptions she wrote and 31 categories derived from them.
 *
 * WHY NOT JUST PRESS RUN. Because it is not guaranteed to fix the right database. If
 * DEV_DATABASE_URL is set in Replit Secrets, the workspace app connects THERE
 * (server/db.ts), while Publish still diffs the database DATABASE_URL points at — so Run
 * would self-heal a database nobody is comparing, and the DROP would survive. This script
 * always targets DATABASE_URL, which is the one Publish reads.
 *
 * SAFETY. Every statement is ADD COLUMN IF NOT EXISTS. There is no DROP, no UPDATE, no
 * DELETE and no data movement anywhere in this file. Running it against production would
 * be a no-op, because production already has these columns. It prints host and database
 * NAME only — never a password, token or connection string.
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const APPLY = process.argv.includes("--apply");

/**
 * Mirrors the boot self-heal in server/index.ts. Keep the two in step: anything added
 * there must be added here, or it becomes the next column production has alone.
 */
const COLUMNS = [
  { table: "artworks", column: "category", type: "text" },
  { table: "artworks", column: "seo_slug", type: "text" },
  { table: "artworks", column: "detail_images_checked", type: "boolean DEFAULT false" },
  { table: "artworks", column: "source_description", type: "text" },
  { table: "artworks", column: "source_description_provider", type: "text" },
  { table: "artworks", column: "derived_categories", type: "text[]" },
  { table: "homepage_settings", column: "room_items", type: "text" },
];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set in this shell. Run this from the Replit workspace Shell.");
  process.exit(2);
}

// Identify the target WITHOUT revealing credentials.
let label = "(unparseable)";
try {
  const u = new URL(url);
  label = `${u.hostname}${u.pathname}`;
} catch {
  /* keep the placeholder */
}

console.log(`Target database : ${label}`);
console.log(`DEV_DATABASE_URL: ${process.env.DEV_DATABASE_URL ? "SET (the app boots against this instead — see header)" : "not set"}`);
console.log(`Mode            : ${APPLY ? "APPLY (additive)" : "REPORT ONLY (nothing will be written)"}\n`);

const pool = new Pool({ connectionString: url });

try {
  const { rows } = await pool.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [[...new Set(COLUMNS.map((c) => c.table))]],
  );
  const present = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
  const missing = COLUMNS.filter((c) => !present.has(`${c.table}.${c.column}`));

  for (const c of COLUMNS) {
    const ok = present.has(`${c.table}.${c.column}`);
    console.log(`  ${ok ? "present" : "MISSING"}  ${c.table}.${c.column}`);
  }

  if (missing.length === 0) {
    console.log("\nParity OK — this database has every column the boot self-heal maintains.");
    console.log("Publish should propose no DROP for them.");
  } else if (!APPLY) {
    console.log(`\n${missing.length} column(s) missing. Production has them and this database does not,`);
    console.log("which is exactly what makes Publish propose a DROP.");
    console.log("Re-run with --apply to add them. Nothing was written.");
  } else {
    console.log("");
    for (const c of missing) {
      const sql = `ALTER TABLE ${c.table} ADD COLUMN IF NOT EXISTS ${c.column} ${c.type}`;
      await pool.query(sql);
      console.log(`  added  ${c.table}.${c.column}`);
    }
    const after = await pool.query(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [[...new Set(COLUMNS.map((c) => c.table))]],
    );
    const now = new Set(after.rows.map((r) => `${r.table_name}.${r.column_name}`));
    const stillMissing = COLUMNS.filter((c) => !now.has(`${c.table}.${c.column}`));
    console.log(
      stillMissing.length === 0
        ? "\nParity OK. Publish should now propose no DROP for these columns."
        : `\nSTILL MISSING: ${stillMissing.map((c) => `${c.table}.${c.column}`).join(", ")}`,
    );
    if (stillMissing.length) process.exitCode = 1;
  }
} catch (err) {
  console.error(`\nFailed: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
