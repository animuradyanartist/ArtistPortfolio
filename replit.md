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
- **Feedback Widget**: Custom HTML/JavaScript widget for collecting star ratings and messages to PostgreSQL.
- **Analytics**: Microsoft Clarity integration.

### Deployment Strategy
- Configured for Replit deployment.
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