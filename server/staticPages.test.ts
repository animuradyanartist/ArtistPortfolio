/**
 * STATIC POLICY PAGES ANSWER 200, NOT A SOFT-404.
 *
 * /returns, /shipping and /privacy are real routes in App.tsx with server-rendered bodies, but they
 * were missing from the known-route list, so the catch-all served their SSR content under a 404
 * status — a soft-404 that also kept them out of the index. These pin BOTH halves: the status line
 * is 200 AND the crawlable body is present, while a genuinely unknown URL still answers 404.
 *
 * Runs against the real production handler + built index.html, exactly like artworksPage.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import { registerRoutes } from "./routes";

let server: Server;
let origin: string;

beforeAll(async () => {
  const built = path.resolve(process.cwd(), "dist/public/index.html");
  if (!fs.existsSync(built)) throw new Error("run `npm run build` first — these test the production output");
  process.env.NODE_ENV = "production";
  const app = express();
  server = await registerRoutes(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const a = server.address();
  if (!a || typeof a === "string") throw new Error("no port");
  origin = `http://127.0.0.1:${a.port}`;
}, 30_000);

afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

describe("policy pages return 200 with a crawlable SSR body", () => {
  it("/returns → 200 and the returns SSR content is present", async () => {
    const res = await fetch(`${origin}/returns`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="returns-ssr"');
    expect(html).toContain("Returns &amp; Refunds");
    // The two policy sections the page distinguishes are both rendered.
    expect(html).toContain("Fine-art prints");
    expect(html).toContain("Original paintings");
  });

  it("/shipping → 200 with its SSR body", async () => {
    const res = await fetch(`${origin}/shipping`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("shipping-ssr");
  });

  it("/privacy → 200 with its SSR body", async () => {
    const res = await fetch(`${origin}/privacy`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("privacy-ssr");
  });
});

describe("real 404 handling is not weakened", () => {
  it("a genuinely unknown URL still answers 404", async () => {
    const res = await fetch(`${origin}/completely-made-up-page-xyz`);
    expect(res.status).toBe(404);
  });

  it("a nested unknown path under a known prefix still answers 404", async () => {
    const res = await fetch(`${origin}/returns/not-a-page`);
    expect(res.status).toBe(404);
  });
});
