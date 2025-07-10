# REST Express Full-Stack Artist Portfolio

## Overview

This is a full-stack web application for an artist portfolio built with React, Express, TypeScript, and PostgreSQL. The application serves as a content management system for an artist to showcase their artworks, exhibitions, and bio information. It features both a public-facing portfolio website and an admin panel for content management.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query (React Query) for server state management
- **Styling**: Tailwind CSS with shadcn/ui component library
- **Forms**: React Hook Form with Zod validation
- **Build Tool**: Vite for development and production builds

### Backend Architecture
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js for API server
- **Database ORM**: Drizzle ORM
- **Validation**: Zod schemas for data validation
- **Development**: TSX for TypeScript execution in development

### Database Architecture
- **Database**: PostgreSQL (configured for Neon serverless)
- **Connection**: Connection pooling with @neondatabase/serverless
- **Migrations**: Drizzle Kit for schema management

## Key Components

### Data Models
The application manages four main entities:
- **Users**: Admin authentication system
- **Artworks**: Core content with images, metadata, and pricing
- **Exhibitions**: Solo and group exhibition records
- **Homepage Settings**: Configurable hero content
- **Artist Bio**: Biographical information and statements

### API Structure
RESTful API endpoints organized by resource:
- `/api/artworks` - CRUD operations for artwork management
- `/api/exhibitions` - Exhibition data management
- `/api/homepage-settings` - Homepage configuration
- `/api/artist-bio` - Artist biography management
- `/api/health` - System health and data validation

### Authentication
Simple password-based admin authentication using localStorage for session management. The system uses a hardcoded password ('artist123') stored in the frontend for simplicity.

### Image Management
- Base64 image encoding for database storage
- Client-side image compression and resizing
- Support for multiple images per artwork
- Automatic image optimization for web display

## Data Flow

1. **Client Request**: React components make API calls using TanStack Query
2. **API Processing**: Express routes handle requests, validate data with Zod
3. **Database Operations**: Drizzle ORM executes SQL queries against PostgreSQL
4. **Response**: JSON data returned to client and cached by React Query
5. **UI Updates**: React components automatically re-render with fresh data

### Storage Strategy
The application implements a dual storage approach:
- **Production**: PostgreSQL database with Drizzle ORM
- **Development**: In-memory storage class for rapid development and testing

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: PostgreSQL connection for serverless environments
- **drizzle-orm**: Type-safe database operations
- **@tanstack/react-query**: Server state management
- **@radix-ui/react-***: Accessible UI primitives
- **react-hook-form**: Form state management
- **zod**: Runtime type validation

### Development Tools
- **vite**: Build tool and development server
- **tailwindcss**: Utility-first CSS framework
- **tsx**: TypeScript execution for development
- **drizzle-kit**: Database schema management

## Deployment Strategy

The application is configured for deployment on Replit with the following setup:

### Development
- Run command: `npm run dev`
- Starts both frontend (Vite) and backend (Express) servers
- Hot module replacement for rapid development

### Production Build
- Build command: `npm run build`
- Compiles React app and bundles Express server
- Outputs static assets and server bundle to `dist/` directory

### Environment Configuration
- **NODE_ENV**: Controls development vs production mode
- **DATABASE_URL**: PostgreSQL connection string (required)
- **PORT**: Server port (defaults to 5000)

### Replit Configuration
- Modules: nodejs-20, web, postgresql-16
- Auto-scaling deployment target
- Port mapping: 5000 (internal) → 80 (external)

## Changelog

- July 10, 2025: Enhanced AR Preview feature with realistic scaling and size selection. Users can now preview artwork on their own walls using device camera with accurate real-world dimensions. Added size selection within AR view, calibration with reference objects (credit card/A4 paper), realistic rendering effects including shadows, frames, and glare for different materials. Improved UI with comprehensive controls for positioning, scaling, and rotation.
- June 27, 2025: Added comprehensive image upload functionality for admin panel, artwork reordering controls, and fixed About page to display uploaded artist bio photos. Fixed year field validation error in artwork forms and replaced buy buttons with styled contact information boxes. Added Microsoft Clarity analytics tracking to all pages. Removed exhibitions page from navigation menu. Created new Prints page with 2-column layout featuring artwork grid and live price calculator.
- June 26, 2025: Initial setup

## User Preferences

Preferred communication style: Simple, everyday language.