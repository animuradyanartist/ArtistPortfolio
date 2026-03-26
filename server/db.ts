import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
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

const connectionString = getConnectionString();

if (process.env.NODE_ENV === 'development') {
  const url = new URL(connectionString);
  const source = process.env.DEV_DATABASE_URL ? 'DEV_DATABASE_URL' : 'auto-derived';
  console.log(`[DB] development → ${url.pathname.slice(1)} @ ${url.hostname} (${source})`);
} else {
  console.log(`[DB] production → DATABASE_URL`);
}

export const pool = new Pool({ 
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const db = drizzle({ client: pool, schema });
