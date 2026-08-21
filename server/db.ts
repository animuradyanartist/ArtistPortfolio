// REQUIRES @neondatabase/serverless >= 1.0.0. NOT a routine version bump.
//
// Production crashed repeatedly with
//   TypeError: Cannot set property message of #<ErrorEvent> which has only a getter
//   command finished with error [npm run start]: exit status 1
// and restarted, over and over.
//
// On a connection timeout, 0.10.4's Pool rewrote the failure in place:
//   s && (o.message = "Connection terminated due to connection timeout")
// Under the WebSocket driver that failure is a `ws` ErrorEvent, whose `message` is a
// getter with no setter (ws/lib/event-target.js). Assigning to it inside the driver's
// strict-mode bundle throws — inside the pool's own connect callback, where nothing catches
// it — so a slow connection did not fail a query, it terminated the server.
//
// 1.1.0 constructs instead of mutating:
//   s && (o = new Error("Connection terminated due to connection timeout", { cause: o }))
// which is the actual fix. The version floor is load-bearing; do not relax it.
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
      // WAS 2000, AND 2000 IS WHAT PULLED THE TRIGGER.
      //
      // This is a serverless Postgres reached over a WebSocket: a cold endpoint routinely
      // takes longer than two seconds to accept a connection, so the pool's timeout path was
      // not an exceptional case here, it was a daily one. Every trip down it crashed the
      // process (see below). Ten seconds is still a bound — a genuinely unreachable database
      // fails a request rather than hanging it — but it stops treating a normal cold start as
      // a failure.
      connectionTimeoutMillis: 10000,
    })
  : (null as unknown as Pool);

/**
 * A DATABASE HICCUP MUST NOT BE ABLE TO KILL THE SERVER.
 *
 * `pg`-style pools emit `error` on IDLE clients — a Neon endpoint scaling to zero, a socket
 * closed by the network. An `error` event with no listener is, by Node's rule, rethrown as an
 * uncaught exception, and this pool had no listener. So a dropped idle connection took the
 * whole process down, every in-flight request with it.
 *
 * This is deliberately only a log. There is nothing to repair — the pool discards the broken
 * client and makes a new one on the next query — and the point is precisely that the process
 * survives to serve that next query.
 */
if (hasDb) {
  pool.on("error", (err: unknown) => {
    console.error("[DB] idle client error (pool will recover):", err instanceof Error ? err.message : err);
  });
}

export const db = hasDb ? drizzle({ client: pool, schema }) : (null as unknown as ReturnType<typeof drizzle>);

export const hasDatabase = hasDb;
