import { defineConfig } from "vitest/config";
import path from "node:path";

// Standalone Vitest config so tests run from the project root (the app's
// vite.config.ts sets root to client/, which would hide shared/ + server/ tests).
// The @shared / @ aliases mirror tsconfig paths so tests can import the shared
// helper and the client seo module (for the artworkPath regression test).
export default defineConfig({
  // The client .test.tsx files render components with react-dom/server, so their
  // JSX must be transpiled. Vitest's bundled (rolldown) Vite transpiles JSX with
  // oxc; point it at React's automatic runtime so .tsx suites compile. The `node`
  // environment is kept because renderToStaticMarkup needs no DOM.
  oxc: {
    jsx: { runtime: "automatic", importSource: "react" },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@": path.resolve(import.meta.dirname, "client/src"),
    },
  },
  test: {
    environment: "node",
    include: ["shared/**/*.test.{ts,tsx}", "server/**/*.test.{ts,tsx}", "client/src/**/*.test.{ts,tsx}"],
    // The two singulart suites are written against `node:test`, not Vitest, so Vitest
    // finds no suite in them and fails the run. They are excluded here rather than
    // rewritten — they still run under `node --test` — and the header comment above was
    // already promising that server tests execute, which until now they never did.
    exclude: ["**/node_modules/**", "**/.git/**", "server/singulart-*.test.ts"],
  },
});
