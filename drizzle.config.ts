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
  // `blog_posts` was added here on 2026-08-17 after a production article draft VANISHED
  // across a republish — the row was gone and the id sequence had restarted at 1, which
  // only happens on DROP+CREATE or TRUNCATE RESTART IDENTITY. The table is declared in
  // shared/schema.ts AND created by the boot DDL, so a `db:push` that decides the two have
  // drifted can recreate it and take every published article with it.
  //
  // Losing a draft during a test is cheap. Losing Ani's published writing is not, and the
  // failure would be silent — the site would simply serve an empty /blog. The boot DDL
  // already creates the table and adds every column idempotently, so nothing is lost by
  // taking drizzle-kit off it entirely.
  tablesFilter: ["!session", "!path_settings", "!app_migrations", "!blog_posts"],
});
