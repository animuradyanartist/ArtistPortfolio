// Make the DEVELOPMENT database (neondb_dev) schema-match PRODUCTION for the
// objects Replit Deploy currently wants to DROP from prod.
//
// WHY: Replit Deploy diffs DEV → PROD and drops anything prod has that dev
// lacks. Dev is missing `session`, `path_settings`, `app_migrations` (never
// copied when the dev DB was created) and the `artworks_seo_slug_unique` index.
// Adding them to DEV makes the deploy diff empty — so NO destructive migration
// is generated. Nothing here is destructive: every statement is additive /
// IF-NOT-EXISTS. The only DROP is of a constraint we ourselves introduced,
// immediately replaced by the equivalent index prod already has.
//
// SAFETY: this script connects to DEV_DATABASE_URL ONLY. It never opens
// DATABASE_URL, and it refuses to run if the two are the same. Production is
// physically untouched.
//
// Run in the Replit Shell:  node scripts/align-dev-schema.mjs
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const DEV = process.env.DEV_DATABASE_URL;
const PROD = process.env.DATABASE_URL;

if (!DEV) {
  console.error(
    "DEV_DATABASE_URL is not set — refusing to run. This script only ever\n" +
      "touches the development database; it must never run against production."
  );
  process.exit(1);
}
if (DEV === PROD) {
  console.error(
    "DEV_DATABASE_URL === DATABASE_URL — that is the production DB. Refusing to run."
  );
  process.exit(1);
}

// connect-pg-simple's canonical session table (identical to what
// createTableIfMissing built in production).
const SESSION_DDL = `
  CREATE TABLE IF NOT EXISTS "session" (
    "sid" varchar NOT NULL COLLATE "default",
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL
  );
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey'
    ) THEN
      ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid");
    END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
`;

// Matches shared/pathSchema.ts PATH_SETTINGS_DDL exactly.
const PATH_SETTINGS_DDL = `
  CREATE TABLE IF NOT EXISTS path_settings (
    id serial PRIMARY KEY,
    hero_artwork_id text,
    chapter_one_artwork_id text,
    chapter_one_detail_artwork_id text,
    chapter_two_artwork_id text,
    chapter_two_detail_artwork_id text,
    chapter_three_artwork_id text
  );
`;

// Matches server/index.ts app_migrations DDL exactly.
const APP_MIGRATIONS_DDL = `
  CREATE TABLE IF NOT EXISTS app_migrations (
    key text PRIMARY KEY,
    applied_at timestamp NOT NULL DEFAULT now()
  );
`;

// Prod has artworks_seo_slug_unique as a plain UNIQUE INDEX. If dev currently
// has it as a CONSTRAINT (introduced by an earlier drizzle-kit push), drop that
// first, then create the matching index so the two databases agree.
const SEO_INDEX_DDL = `
  ALTER TABLE artworks DROP CONSTRAINT IF EXISTS artworks_seo_slug_unique;
  CREATE UNIQUE INDEX IF NOT EXISTS artworks_seo_slug_unique ON artworks (seo_slug);
`;

const pool = new Pool({ connectionString: DEV });
const devName = new URL(DEV).pathname.slice(1);

try {
  console.log(`Aligning DEV database "${devName}" to production schema…\n`);

  await pool.query(SESSION_DDL);
  console.log("  ✓ session table ensured");

  await pool.query(PATH_SETTINGS_DDL);
  console.log("  ✓ path_settings table ensured");

  await pool.query(APP_MIGRATIONS_DDL);
  console.log("  ✓ app_migrations table ensured");

  await pool.query(SEO_INDEX_DDL);
  console.log("  ✓ artworks_seo_slug_unique index ensured (constraint→index)");

  console.log(
    "\nDone. DEV now has the same tables + seo index as PROD.\n" +
      "Re-open the Publish screen — the generated migration list should be empty.\n" +
      "Production (DATABASE_URL) was never opened by this script."
  );
} catch (err) {
  console.error("\nAlignment failed:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
