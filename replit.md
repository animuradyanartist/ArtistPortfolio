# REST Express Full-Stack Artist Portfolio

## Overview

This project is a full-stack web application designed as an artist's portfolio and content management system. It enables artists to showcase artworks, exhibitions, and biographical information through a public-facing website. An integrated admin panel provides tools for managing all content. The application aims to provide a robust and scalable platform for artists to present their work online, with a focus on SEO, performance, and a rich user experience.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack Query (React Query)
- **Styling**: Tailwind CSS with shadcn/ui
- **Forms**: React Hook Form with Zod validation
- **Build Tool**: Vite

### Backend Architecture
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database ORM**: Drizzle ORM
- **Validation**: Zod schemas

### Database Architecture
- **Database**: PostgreSQL (configured for Neon serverless)
- **Connection**: @neondatabase/serverless for connection pooling
- **Migrations**: Drizzle Kit

### Key Features
- **Data Models**: Manages Users, Artworks, Exhibitions, Gallery Photos, Homepage Settings, and Artist Bio.
- **RESTful API**: Structured endpoints for CRUD operations on all resources.
- **Authentication**: Simple password-based admin authentication using localStorage.
- **Image Management**: Base64 encoding, client-side compression/resizing, multiple images per artwork, automatic optimization.
- **Data Flow**: React components use TanStack Query to call Express APIs; Express validates with Zod, Drizzle ORM interacts with PostgreSQL, and JSON data is returned.
- **Storage Strategy**: PostgreSQL for production, in-memory storage for development.
- **Performance Optimization**: Gzip compression, lazy loading for images, and Cache-Control headers for API endpoints. Base64 images stored in the DB are never inlined in public JSON responses — `server/images.ts` swaps them for lightweight `/img/:kind/:id/:idx` URLs; that route resizes to WebP with sharp, caches to `public/uploads/_cache/` (rebuilt on demand, safe on redeploy), and serves with immutable browser caching. Admin edit forms fetch `?raw=1` to keep editing the stored originals; mutation endpoints resolve `/img/` refs back to originals before saving. Hot list endpoints are memoized in memory for 60s (invalidated on any /api mutation).
- **SEO**: Comprehensive SEO with optimized meta tags, JSON-LD structured data (Person, VisualArtwork), dynamic sitemap.xml and robots.txt, image sitemaps, and canonical URL management for React SPA. Individual SEO landing pages for artworks.
- **Gallery Feature**: Dedicated gallery management with image uploads, reordering, featured status, and a public gallery display.
- **AR Preview**: Realistic scaling and size selection for artwork previews using augmented reality.
- **Artwork Category (Originals page tabs)**: The public Originals page (`client/src/pages/ArtworksPage.tsx`) splits paintings into **Landscape** vs **Figurative** tabs. Category is a real, admin-editable column — `category text("category")` on the `artworks` table (nullable). The admin create/edit forms (`CreateArtworkPage.tsx` / `EditArtworkPage.tsx`) expose a **Category** selector with three choices: *Auto (detect from title)*, *Landscape*, *Figurative*; "Auto" stores `null`. `client/src/lib/artworkCategory.ts` prefers the explicit `category` value and falls back to a keyword classifier over the title/description when it is `null`. **Migration note:** adding this column requires `npm run db:push`, which touches the live Neon DB — coordinate with the owner before running against prod. Dev can be synced safely with the `neondb_dev` push command in the Test/Production section below.
- **Feedback Widget**: Custom HTML/JavaScript widget for collecting star ratings and messages to PostgreSQL.
- **Analytics**: Microsoft Clarity integration.

### Deployment Strategy
- Configured for Replit deployment.

### THE DEVELOPMENT DATABASE DEFINES PRODUCTION'S SCHEMA — read before any migration
- This app has **two** databases (Replit → Database → All Databases): **Development** and
  **Production**. The workspace's `DATABASE_URL` points at Development; the deployment's
  points at Production.
- **On publish, Replit reconciles production's schema to match development's.** A table or
  column that exists ONLY in production is not treated as extra — it is **DROPPED**.
- **This destroyed a published article on 2026-08-17.** `blog_posts` existed in production
  and did not exist in development, because the blog code arrived by GitHub merge and the
  workspace app was never started afterwards. Publishing dropped the table; the boot DDL
  recreated it empty; the row was gone and the id sequence restarted at 1. Nothing logged
  an error — `/blog` simply served empty, which looks identical to "no articles yet".
- `drizzle.config.ts`'s `tablesFilter` does NOT protect against this. That setting only
  affects `drizzle-kit push`, which is not what runs here.
- **The rule: after any schema change, start the app in the workspace once BEFORE
  publishing.** The boot DDL is idempotent and runs in both environments, so starting it in
  development is what keeps the two schemas equal. Alternatively apply the same DDL by hand
  in Database → Development → SQL console.
- A boot canary in `server/index.ts` remembers the highest row count `blog_posts` has ever
  held and logs `[boot][DATA LOSS]` if the table is ever found empty afterwards. It cannot
  prevent the loss; it stops it being silent.

### Print masters live in Replit Object Storage (NOT a local disk)
- Production is a **Replit Autoscale deployment** whose filesystem is EPHEMERAL (reset on every
  Publish/redeploy, per-instance). High-resolution print masters therefore live in **Replit Object
  Storage** (`server/commerce/prints/masterObjectStore.ts`), keyed per print
  (`prints/<printId>/master-<rand>.<ext>`). Postgres keeps only the reference (`prints.master_asset_key`)
  + metadata; the bytes are never in Postgres and never a public URL. Prodigi downloads via the
  short-lived, HMAC-signed, per-print token route `/api/commerce/prints/master-file/:printId?token=…`,
  which streams the object through the app.
- **Local upload staging is disposable** (OS temp dir): a master is streamed to a local temp file only
  to be validated (sharp) and checksummed, then uploaded to Object Storage and the temp file deleted.
  Permanent bytes never depend on local filesystem persistence.
- **Manual setup required (once):** add **Object Storage** to the Repl (Tools → Object Storage → create
  a bucket). That injects the default bucket the SDK uses. Optionally pin a specific bucket with the
  **`PRINT_MASTERS_BUCKET_ID`** Replit Secret. In production a missing/unreachable store fails LOUD at
  boot (`[master-storage][FATAL]`) and every upload returns 502 — it NEVER silently writes to a local
  disk. (Dev without a bucket uses a local-filesystem store; tests force it via `MASTER_STORAGE_BACKEND=local`.)
- The old `PRINT_MASTERS_DIR=/var/data/print-masters` assumption (a Render persistent-disk path) is gone.

### Publishing articles (the blog)
- **There is no `render.yaml`.** It was removed: ArtistPortfolio is not deployed on Render (Render hosts
  only Career OS's `career-os-worker`). Production (animuradyan.com) is served by the **Replit Autoscale
  deployment** — `server: Google Frontend`. Do not re-add a Render blueprint to this repo.
- **Merging to `main` does NOT deploy. A human pressing Publish does.** Settled from the
  Publishing panel, which is authoritative: production reads "Ani published N minutes ago",
  and EVERY entry in the deploy history is "Ani published". There is no GitHub Action and no
  repo-tracking deploy. I got this wrong in both directions on 2026-08-17 — first assuming
  Render, then assuming auto-deploy because a deploy happened to land while I was pushing.
  It landed because Ani pressed Publish. Check the Publishing panel before believing either.
- **A new Secret does not reach production until the next Publish.** Autoscale serves the
  build that was published; adding `BLOG_AGENT_TOKEN` afterwards leaves the running
  deployment without it, and `requireBlogAgent` then refuses every caller — correctly, and
  indistinguishably from a wrong token, because it fails closed on purpose.
- **Do not detect a deploy by HTTP status.** This is a client-rendered SPA with a catch-all:
  every unknown path, `/api/*` included, answers **200 with the HTML shell**. A route that
  does not exist looks identical to one that does. Test the BODY — JSON for an API, an
  injected `blog-ssr` / `blog-post-ssr` block for a page.
- **`BLOG_AGENT_TOKEN` must be set as a Replit Secret** for Career OS to prepare article
  drafts. Generate a long random value (≥32 chars); it is never chosen by hand elsewhere.
  Leaving it unset is SAFE and CLOSED — the agent routes then refuse everyone, they do not
  fall open. Nothing else breaks without it.
- The permission model, in one line: that token opens **create draft** and **revise its own
  unpublished draft**, and there is **no agent publish route in the codebase at all**.
  Publishing, unpublishing and deleting live behind the admin session only, and the owner's
  Publish button in Admin → Articles is the only thing that changes what the public sees.
- `npm run dev` starts both frontend and backend.
- `npm run build` compiles for production.
- Environment variables: `NODE_ENV`, `DATABASE_URL`, `PORT`.
- Replit Configuration: nodejs-20, web, postgresql-16 modules, auto-scaling, port mapping 5000:80.

### Test/Production Environment Separation
- **Development** (`npm run dev`, NODE_ENV=development): uses `neondb_dev` database (auto-derived from DATABASE_URL by appending `_dev` to the database name). Content changes here do NOT affect the live site.
- **Production** (deployed at anymoore.am, NODE_ENV=production): uses `neondb` database (DATABASE_URL). This is where real content lives.
- `server/db.ts` selects the correct database based on NODE_ENV. A custom `DEV_DATABASE_URL` env var can override the auto-derived dev URL.
- The admin panel shows a visible **amber "TEST ENVIRONMENT"** banner in development and a subtle green "PRODUCTION" indicator when deployed.
- Schema is synced to the dev database via: `DATABASE_URL=$(node -e "const u=new URL(process.env.DATABASE_URL);u.pathname='/neondb_dev';console.log(u.toString())") npm run db:push`

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: PostgreSQL connection
- **drizzle-orm**: Type-safe database operations
- **@tanstack/react-query**: Server state management
- **@radix-ui/react-***: Accessible UI primitives
- **react-hook-form**: Form state management
- **zod**: Runtime type validation

### Development Tools
- **vite**: Build tool and dev server
- **tailwindcss**: CSS framework
- **tsx**: TypeScript execution
- **drizzle-kit**: Database schema management