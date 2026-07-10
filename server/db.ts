import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Without DATABASE_URL the app falls back to in-memory sample data
// (MemStorage) — a local preview mode. Production on Replit always has
// the secret set, so this only changes behavior on machines without it.
const hasDb = !!process.env.DATABASE_URL;
if (!hasDb) {
  console.log("[DB] no DATABASE_URL — local preview mode with in-memory sample data");
}

/**
 * Returns the database connection string.
 *
 * There is ONE database everywhere by default — the live Neon database in
 * DATABASE_URL that powers the published site. The workspace preview
 * (`npm run dev`) and the published site (`npm run start`) both use it, so
 * admin edits made in either place persist and show up on the live site, and
 * republishing (a code-only deploy) never "resets" content.
 *
 * Opt-in isolation: set DEV_DATABASE_URL in Replit Secrets (development scope)
 * to point the workspace preview at a SEPARATE database. Only do this if you
 * deliberately want dev work isolated from live content.
 *
 * NOTE: this used to auto-derive a "<db>_dev" sibling database in development.
 * That silently split content in two — admin changes made in the workspace
 * never reached the live site — so the auto-derivation was removed.
 */
function getConnectionString(): string {
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_DATABASE_URL) {
    return process.env.DEV_DATABASE_URL;
  }

  return process.env.DATABASE_URL!;
}

const connectionString = hasDb ? getConnectionString() : null;

if (hasDb) {
  if (process.env.NODE_ENV === 'development') {
    const url = new URL(connectionString!);
    const source = process.env.DEV_DATABASE_URL
      ? 'DEV_DATABASE_URL (isolated dev DB)'
      : 'shared DATABASE_URL (same DB as the live site)';
    console.log(`[DB] development → ${url.pathname.slice(1)} @ ${url.hostname} (${source})`);
  } else {
    console.log(`[DB] production → DATABASE_URL`);
  }
}

// Both are null in local preview mode — consumers must check hasDatabase
// (storage.ts picks MemStorage, index.ts skips the PG session store).
export const pool = hasDb
  ? new Pool({
      connectionString: connectionString!,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
  : (null as unknown as Pool);

export const db = hasDb ? drizzle({ client: pool, schema }) : (null as unknown as ReturnType<typeof drizzle>);

export const hasDatabase = hasDb;
