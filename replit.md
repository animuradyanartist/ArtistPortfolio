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
- **Performance Optimization**: Gzip compression, lazy loading for images, and Cache-Control headers for API endpoints.
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