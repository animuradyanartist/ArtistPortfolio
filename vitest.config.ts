import { defineConfig } from "vitest/config";
import path from "node:path";

// Standalone Vitest config so tests run from the project root (the app's
// vite.config.ts sets root to client/, which would hide shared/ + server/ tests).
// The @shared / @ aliases mirror tsconfig paths so tests can import the shared
// helper and the client seo module (for the artworkPath regression test).
export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@": path.resolve(import.meta.dirname, "client/src"),
    },
  },
  test: {
    environment: "node",
    include: ["shared/**/*.test.ts"],
  },
});
