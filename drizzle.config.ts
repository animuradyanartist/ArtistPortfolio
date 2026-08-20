import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // These tables are created and owned at RUNTIME, not by Drizzle:
  //   - session         → connect-pg-simple (createTableIfMissing) — server/index.ts
  //   - path_settings   → boot DDL (PATH_SETTINGS_DDL)            — shared/pathSchema.ts
  //   - app_migrations  → boot DDL, guards one-time migrations    — server/index.ts
  //   - blog_posts      → boot DDL (CREATE + ADD COLUMN IF NOT EXISTS) — server/index.ts
  // They are intentionally absent from shared/schema.ts. Without this filter,
  // `drizzle-kit push` treats them as "extra" and proposes to DROP them on every
  // deploy — which would delete /path config and, via app_migrations, re-run the
  // one-time dimension fix and overwrite admin-edited artwork sizes. Excluding
  // them here makes the diff empty so deploys require ZERO migrations.
  // NOTE: tablesFilter only affects drizzle-kit (push/introspect); drizzle-ORM
  // runtime queries against these tables are unaffected.
  // `blog_posts` WAS in this list, and being in it is what nearly destroyed the commerce
  // schema on 2026-08-20.
  //
  // It was added on 2026-08-17 after a production article draft vanished across a republish,
  // on the reasoning that taking drizzle-kit off the table entirely was the safe move. It was
  // the opposite, because the table stayed DECLARED in shared/schema.ts. A table that is
  // filtered out of the database side but still present on the schema side looks, to
  // drizzle-kit, like a table that has not been created yet — so every deploy asked:
  //
  //     Is blog_posts table created or renamed from another table?
  //       + blog_posts                  create table
  //       ~ orders › blog_posts         rename table
  //       ~ stripe_events › blog_posts  rename table
  //
  // It offers every REAL table it cannot account for as a rename candidate. Decline the
  // renames and `orders` and `stripe_events` become "extra" tables, which is a DROP TABLE
  // CASCADE — and the commerce columns on `artworks` go the same way. That is the destructive
  // migration that was cancelled.
  //
  // The fix is to stop contradicting ourselves: blog_posts is declared in shared/schema.ts and
  // created identically by the boot DDL, so drizzle-kit sees the same table on both sides and
  // the diff is empty. Verified against a database built the way production was — schema
  // pushed, then boot DDL applied — with rows in blog_posts, orders, stripe_events:
  // "No changes detected", every row intact.
  //
  // The three below remain filtered because they are genuinely NOT declared in
  // shared/schema.ts. That is the rule this file now follows: a table is either declared and
  // unfiltered, or filtered and undeclared. Never both.
  tablesFilter: ["!session", "!path_settings", "!app_migrations"],
});
