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
  // They are intentionally absent from shared/schema.ts. Without this filter,
  // `drizzle-kit push` treats them as "extra" and proposes to DROP them on every
  // deploy — which would delete /path config and, via app_migrations, re-run the
  // one-time dimension fix and overwrite admin-edited artwork sizes. Excluding
  // them here makes the diff empty so deploys require ZERO migrations.
  // NOTE: tablesFilter only affects drizzle-kit (push/introspect); drizzle-ORM
  // runtime queries against these tables are unaffected.
  tablesFilter: ["!session", "!path_settings", "!app_migrations"],
});
