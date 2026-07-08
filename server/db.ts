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
 * Returns the correct database connection string based on the environment.
 *
 * - production  (NODE_ENV === 'production'): DATABASE_URL — the live Neon database
 *   that powers anymoore.am. Untouched by dev work.
 *
 * - development (NODE_ENV === 'development'): prefers DEV_DATABASE_URL when
 *   explicitly set in secrets/env. Falls back to deriving a sibling database
 *   from DATABASE_URL by appending "_dev" to the database name
 *   (e.g. neondb → neondb_dev). The sibling DB must exist and have the schema
 *   pushed to it (`DATABASE_URL=<dev_url> npm run db:push`).
 *
 * To explicitly pin the dev database without relying on URL derivation, add
 *   DEV_DATABASE_URL=<your-connection-string>
 * to Replit Secrets (development scope).
 */
function getConnectionString(): string {
  if (process.env.NODE_ENV === 'production') {
    return process.env.DATABASE_URL!;
  }

  if (process.env.DEV_DATABASE_URL) {
    return process.env.DEV_DATABASE_URL;
  }

  const url = new URL(process.env.DATABASE_URL!);
  const dbName = url.pathname.slice(1);
  url.pathname = `/${dbName}_dev`;
  return url.toString();
}

const connectionString = hasDb ? getConnectionString() : null;

if (hasDb) {
  if (process.env.NODE_ENV === 'development') {
    const url = new URL(connectionString!);
    const source = process.env.DEV_DATABASE_URL ? 'DEV_DATABASE_URL' : 'auto-derived';
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
