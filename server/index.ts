import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import pgSession from "connect-pg-simple";
import compression from "compression";
import path from "path";
import { randomBytes } from "node:crypto";
import fs from "fs";
import { SELF_HEAL_DDL } from "./selfHealDdl";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { pool, hasDatabase } from "./db";
import { PATH_SETTINGS_DDL } from "@shared/pathSchema";

const app = express();

// Enable gzip compression for all responses
app.use(compression());

// Stripe signs the RAW bytes, so a webhook cannot verify against a parsed object. Capturing
// the buffer here — rather than mounting express.raw ahead of this line — keeps the middleware
// order untouched for every other route, which all still receive ordinary parsed JSON.
app.use(express.json({
  limit: '100mb',
  verify: (req, _res, buf) => { (req as unknown as { rawBody?: Buffer }).rawBody = buf; },
}));
app.use(express.urlencoded({ extended: false, limit: '100mb' }));

// PostgreSQL session store for production compatibility
const PgStore = pgSession(session);

/**
 * THE SESSION SECRET, WHICH USED TO BE PUBLISHED.
 *
 * This fell back to a placeholder string written in the source, in a public repository. A
 * literal fallback is not a default, it is a shipped secret: it survives every deploy that
 * forgets to set the real one, silently, which is exactly when it matters.
 *
 * Unset now means a RANDOM secret for the lifetime of this process. Cookies signed by an
 * older process stop verifying, so sessions do not survive a restart — visibly inconvenient
 * rather than invisibly insecure. Setting SESSION_SECRET restores persistence across restarts.
 */
function sessionSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured) return configured;
  console.warn(
    "[auth] SESSION_SECRET is not set — using a random per-process secret. " +
    "Admin sessions will not survive a restart. Set SESSION_SECRET to keep them.",
  );
  return randomBytes(32).toString("hex");
}

// Session configuration for admin authentication.
// Without a database (local preview mode) fall back to the default
// in-memory session store.
// Express must be told a proxy sits in front of it, or req.ip is the platform edge's address
// and the login rate limiter puts every visitor on earth in one bucket. express-session reads
// its own `proxy: true` below, so this does not change cookie-secure behaviour.
app.set('trust proxy', 1);

app.use(session({
  store: hasDatabase ? new PgStore({
    pool: pool,
    tableName: 'session',
    createTableIfMissing: true,
  }) : undefined,
  secret: sessionSecret(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  },
  proxy: true,
}));

// The migrate-images-to-webp script converted some originals to .webp while
// the database may still reference the old extension — redirect to the .webp
// twin when the original file is gone.
app.use('/uploads', (req, res, next) => {
  const m = req.path.match(/^(.+)\.(png|jpe?g|tiff|bmp)$/i);
  if (!m) return next();
  const original = path.join(process.cwd(), 'public/uploads', req.path);
  if (fs.existsSync(original)) return next();
  const webp = path.join(process.cwd(), 'public/uploads', `${m[1]}.webp`);
  if (fs.existsSync(webp)) return res.redirect(302, `/uploads${m[1]}.webp`);
  next();
});

// Serve uploaded files. Filenames are timestamped/content-hashed and never
// rewritten in place, so the browser can cache them forever.
app.use('/uploads', express.static('public/uploads', { maxAge: '365d', immutable: true }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // NOTE: deliberately no response-body capture here — the old version
      // JSON.stringify'd every response (megabytes when images were inlined)
      // just to print an 80-char log line.
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  // Ensure the /path page settings table exists on the production database,
  // the same way the session store auto-creates its table. This means the
  // feature works on the live Neon DB with no manual migration step —
  // it can't "miss" on production even if db:push is never run.
  if (hasDatabase) {
    try {
      await pool.query(PATH_SETTINGS_DDL);
    } catch (err) {
      console.error("[boot] Failed to ensure path_settings table:", err);
    }
    // Ensure the session table exists eagerly. connect-pg-simple only creates it
    // lazily on the first session write (admin login), so on a freshly-provisioned
    // database it can be absent — which makes Replit's dev→prod deploy diff want to
    // DROP it from production. Creating it here with connect-pg-simple's exact
    // structure keeps the dev and production schemas identical. Idempotent: a no-op
    // wherever it already exists (e.g. production).
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL
      )`);
      await pool.query(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey') THEN
          ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid");
        END IF;
      END $$;`);
      await pool.query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")`);
    } catch (err) {
      console.error("[boot] Failed to ensure session table:", err);
    }
    // DEV-ONLY: normalize seo_slug uniqueness to a plain UNIQUE INDEX. An earlier
    // drizzle push created it as a CONSTRAINT in the development database, while
    // production has a plain index — that mismatch makes Replit's dev→prod deploy
    // diff propose DROP INDEX + ADD CONSTRAINT. Converting dev to a plain index
    // makes the two schemas identical so the deploy generates no seo_slug change.
    // Gated to non-production so it can NEVER touch the live database (which is
    // already a plain index and needs no change).
    if (process.env.NODE_ENV !== "production") {
      try {
        await pool.query(`ALTER TABLE artworks DROP CONSTRAINT IF EXISTS artworks_seo_slug_unique`);
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS artworks_seo_slug_unique ON artworks (seo_slug)`);
      } catch (err) {
        console.error("[boot] Failed to normalize seo_slug index:", err);
      }
    }
    // Ensure the schema-added artworks columns exist on the live/workspace
    // table so artwork queries never 500 on an un-migrated database — with no
    // manual db:push (ADD COLUMN IF NOT EXISTS is idempotent). `category` is
    // the admin Landscape/Figurative selector; `seo_slug` backs the clean
    // Google-friendly URLs. Both are selected by every artwork query, so a DB
    // missing either column breaks the whole Originals/detail flow.
    try {
      // ONE LIST, SHARED WITH scripts/sync-dev-schema.mjs.
      //
      // It used to be written out inline here, which meant the only way to apply it was to
      // START the app. Replit's publish syncs the DEVELOPMENT database onto production, so a
      // workspace that was pulled but never run leaves development behind — and every column
      // that exists only in production is then scheduled for deletion. Extracting the list
      // lets the same statements be applied to development directly, in about a second.
      for (const statement of SELF_HEAL_DDL) {
        await pool.query(statement);
      }

      // EXPIRED CHECKOUT HOLDS — released on boot, then on a timer.
      //
      // On boot as well as on the interval because a restart during a checkout would
      // otherwise strand that painting until the first tick. Both paths call the same
      // idempotent statement, so running them together is harmless.
      //
      // This reuses the process that is already serving the site rather than introducing a
      // scheduler: the work is two UPDATEs a minute against an indexed column. The same sweep
      // is also exposed at POST /api/commerce/maintenance/release-expired so expiry never
      // depends on this process having stayed up.
      try {
        const { releaseExpiredReservations } = await import("./commerce/reservation");
        const sweep = async () => {
          try {
            const r = await releaseExpiredReservations();
            if (r.artworksReleased || r.ordersCancelled) {
              console.log(`[commerce] released ${r.artworksReleased} reservation(s), cancelled ${r.ordersCancelled} order(s)`);
            }
          } catch (e) {
            console.error("[commerce] reservation sweep failed:", e);
          }
        };
        await sweep();
        const timer = setInterval(sweep, 60_000);
        // Never hold the process open on this alone.
        if (typeof timer.unref === "function") timer.unref();
      } catch (e) {
        console.error("[commerce] could not start the reservation sweeper:", e);
      }
      // Who drafted it, and the contract that makes a publication measurable later.
      // Added separately so a database created by the first version still gains them.
      await pool.query(`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual'`);
      await pool.query(`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS decision_ref text`);
      await pool.query(`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS expected_outcome text`);
      await pool.query(`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS measurement_horizon_days integer`);
      await pool.query(`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS cover_image_alt text`);

      // ── DATA-LOSS CANARY for blog_posts ──────────────────────────────────
      //
      // On 2026-08-17 a published article vanished. Root cause, from the Replit
      // database panel: the DEVELOPMENT database had no `blog_posts` table at all while
      // production did, and Replit's dev→prod schema sync at publish resolves that
      // difference by DROPPING the table production has and dev does not. The boot DDL
      // above then recreates it empty, which is why the row disappeared and the id
      // sequence restarted at 1 — and why nothing anywhere reported an error.
      //
      // The structural rule this implies is the important part: **the DEVELOPMENT
      // database is the source of truth for production's SCHEMA.** Any table or column
      // that exists only in production is not "extra", it is scheduled for deletion. The
      // boot DDL is what keeps them equal, so it must have RUN against development —
      // i.e. the app must have started in the workspace — before a publish.
      //
      // This canary cannot prevent that. It makes it LOUD. The count is remembered
      // across boots, so a table that had rows and now has none announces itself instead
      // of failing into an empty /blog that looks like "no articles yet".
      try {
        // Created here too: this block runs BEFORE the app_migrations bootstrap below, and
        // the canary must not depend on statement order inside a file someone will edit.
        await pool.query(
          `CREATE TABLE IF NOT EXISTS app_migrations (key text PRIMARY KEY, applied_at timestamp NOT NULL DEFAULT now())`,
        );
        const { rows: countRows } = await pool.query(`SELECT count(*)::int AS n FROM blog_posts`);
        const current: number = countRows[0]?.n ?? 0;
        const { rows: seenRows } = await pool.query(
          `SELECT key FROM app_migrations WHERE key LIKE 'blog_posts_high_water:%' ORDER BY key DESC LIMIT 1`,
        );
        const previous = Number(String(seenRows[0]?.key ?? "").split(":")[1] ?? "0") || 0;

        if (previous > 0 && current === 0) {
          console.error(
            `[boot][DATA LOSS] blog_posts is EMPTY but previously held ${previous} row(s). ` +
            `The dev→prod schema sync almost certainly dropped and recreated it. ` +
            `Check that the DEVELOPMENT database has blog_posts with the same columns ` +
            `before the next publish — see the comment in server/index.ts.`,
          );
        }
        // Only ever ratchet UP. A legitimate deletion by the owner lowers the live count
        // but must not lower the water mark, or the next real loss would look normal.
        if (current > previous) {
          await pool.query(
            `INSERT INTO app_migrations (key) VALUES ($1) ON CONFLICT (key) DO NOTHING`,
            [`blog_posts_high_water:${String(current).padStart(6, "0")}`],
          );
        }
      } catch (err) {
        console.error("[boot] blog_posts canary failed (non-fatal):", err);
      }

      // Collector List signups (homepage "Join the Collector List" form).
      await pool.query(`CREATE TABLE IF NOT EXISTS collectors (
        id serial PRIMARY KEY,
        email text NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )`);
      // Contact-page messages.
      await pool.query(`CREATE TABLE IF NOT EXISTS messages (
        id serial PRIMARY KEY,
        name text NOT NULL,
        email text NOT NULL,
        subject text,
        message text NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )`);
    } catch (err) {
      console.error("[boot] Failed to ensure artworks columns:", err);
    }

    // One-time content merge: add the exhibitions listed on the artist's
    // Singulart profile. Guarded by an app_migrations flag so it runs EXACTLY
    // ONCE, ever. After that, deploys never touch exhibitions again — so any
    // exhibition the artist later adds, edits, or deletes in the admin sticks
    // and is never reset or resurrected by a deploy.
    try {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS app_migrations (
          key text PRIMARY KEY,
          applied_at timestamp NOT NULL DEFAULT now()
        )`
      );
      const { rows } = await pool.query(
        `SELECT 1 FROM app_migrations WHERE key = $1`,
        ["singulart_exhibitions_merge_v1"]
      );
      if (rows.length === 0) {
        const singulartExhibitions = [
          { title: "Woman. Love. Harmony", type: "group", venue: "Russian Museum of Art", location: "Armenia, Yerevan", year: 2026 },
          { title: "Solo Art Exhibition", type: "solo", venue: "", location: "Armenia, Yerevan", year: 2024 },
          { title: "Christmas Art Fair", type: "group", venue: "Liver Gallery", location: "Armenia, Yerevan", year: 2023 },
        ];
        for (const ex of singulartExhibitions) {
          await pool.query(
            `INSERT INTO exhibitions (title, type, venue, location, year)
             SELECT $1, $2, $3, $4, $5
             WHERE NOT EXISTS (SELECT 1 FROM exhibitions WHERE title = $1 AND year = $5)`,
            [ex.title, ex.type, ex.venue, ex.location, ex.year]
          );
        }
        await pool.query(
          `INSERT INTO app_migrations (key) VALUES ($1) ON CONFLICT DO NOTHING`,
          ["singulart_exhibitions_merge_v1"]
        );
      }
    } catch (err) {
      console.error("[boot] Failed to merge Singulart exhibitions:", err);
    }

    // One-time fix: correct artwork dimensions to match the sizes shown on the
    // artist's Singulart pages (the stored values were off by ~1cm). Matched by
    // the stable Singulart id at the end of each buy_link. Guarded by an
    // app_migrations flag so it runs once — any size the artist later edits in
    // the admin persists and is never overwritten by a redeploy.
    try {
      const dimensionFixes: Array<[string, string]> = [
        ["2520049", "80x70cm"], ["2520872", "100x80cm"], ["2631637", "90x80cm"],
        ["2130937", "80x60cm"], ["2627626", "70x60cm"], ["2176588", "90x80cm"],
        ["2130915", "60x70cm"], ["2602903", "60x50cm"], ["2130951", "60x60cm"],
        ["2130923", "100x80cm"], ["2621071", "80x100cm"], ["2130940", "120x90cm"],
        ["2098242", "35x28cm"], ["2130944", "50x40cm"], ["2610387", "42x30cm"],
        ["2539922", "42x30cm"], ["2532244", "30x21cm"], ["2554547", "30x21cm"],
        ["2588239", "30x42cm"], ["2128391", "35x28cm"], ["2096775", "120x110cm"],
        ["2176590", "80x100cm"], ["2130929", "100x80cm"], ["2130943", "70x60cm"],
        ["2573886", "42x30cm"], ["2534421", "60x50cm"], ["2525788", "100x80cm"],
        ["2095342", "90x80cm"],
      ];
      const { rows } = await pool.query(
        `SELECT 1 FROM app_migrations WHERE key = $1`,
        ["singulart_dimensions_fix_v1"]
      );
      if (rows.length === 0) {
        for (const [sid, dim] of dimensionFixes) {
          await pool.query(
            `UPDATE artworks SET dimensions = $1 WHERE buy_link LIKE $2`,
            [dim, `%-${sid}`]
          );
        }
        await pool.query(
          `INSERT INTO app_migrations (key) VALUES ($1) ON CONFLICT DO NOTHING`,
          ["singulart_dimensions_fix_v1"]
        );
      }
    } catch (err) {
      console.error("[boot] Failed to fix Singulart dimensions:", err);
    }
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen({
    port,
    host: "0.0.0.0",
    // SO_REUSEPORT is unsupported on macOS — keep it for Replit (Linux) only
    reusePort: process.platform === "linux",
  }, () => {
    log(`serving on port ${port}`);
  });
})();
