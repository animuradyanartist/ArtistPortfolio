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

function getConnectionString(): string {
  const isDev = process.env.NODE_ENV !== 'production';

  if (!isDev) {
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
const isDevelopment = process.env.NODE_ENV !== 'production';

if (isDevelopment) {
  const url = new URL(connectionString);
  console.log(`[DB] Using development database: ${url.pathname.slice(1)} @ ${url.hostname}`);
} else {
  console.log(`[DB] Using production database.`);
}

export const pool = new Pool({ 
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const db = drizzle({ client: pool, schema });
