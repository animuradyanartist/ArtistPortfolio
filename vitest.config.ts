import { defineConfig } from "vitest/config";

// Standalone Vitest config so tests run from the project root (the app's
// vite.config.ts sets root to client/, which would hide shared/ + server/ tests).
export default defineConfig({
  test: {
    environment: "node",
    include: ["shared/**/*.test.ts"],
  },
});
