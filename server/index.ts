import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import pgSession from "connect-pg-simple";
import compression from "compression";
import path from "path";
import fs from "fs";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { pool, hasDatabase } from "./db";
import { PATH_SETTINGS_DDL } from "@shared/pathSchema";

const app = express();

// Enable gzip compression for all responses
app.use(compression());

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: false, limit: '100mb' }));

// PostgreSQL session store for production compatibility
const PgStore = pgSession(session);

// Session configuration for admin authentication.
// Without a database (local preview mode) fall back to the default
// in-memory session store.
app.use(session({
  store: hasDatabase ? new PgStore({
    pool: pool,
    tableName: 'session',
    createTableIfMissing: true,
  }) : undefined,
  secret: process.env.SESSION_SECRET || 'fallback-secret-key-change-in-production',
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
    // Ensure the schema-added artworks columns exist on the live/workspace
    // table so artwork queries never 500 on an un-migrated database — with no
    // manual db:push (ADD COLUMN IF NOT EXISTS is idempotent). `category` is
    // the admin Landscape/Figurative selector; `seo_slug` backs the clean
    // Google-friendly URLs. Both are selected by every artwork query, so a DB
    // missing either column breaks the whole Originals/detail flow.
    try {
      await pool.query(`ALTER TABLE artworks ADD COLUMN IF NOT EXISTS category text`);
      await pool.query(`ALTER TABLE artworks ADD COLUMN IF NOT EXISTS seo_slug text`);
      // "Where the work lives" section content (JSON array of {image, caption}).
      await pool.query(`ALTER TABLE homepage_settings ADD COLUMN IF NOT EXISTS room_items text`);
    } catch (err) {
      console.error("[boot] Failed to ensure artworks columns:", err);
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
