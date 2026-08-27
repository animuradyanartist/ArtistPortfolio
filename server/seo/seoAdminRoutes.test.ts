import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import session from "express-session";
import type { Server } from "node:http";
import { registerRoutes } from "../routes";

let server: Server;
let origin: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "seo-routing-test-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    }),
  );
  server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not open a port");
  origin = `http://127.0.0.1:${address.port}`;
}, 30_000);

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("SEO admin API routing", () => {
  it("reaches the protected status route instead of an HTML fallback", async () => {
    const response = await fetch(`${origin}/api/admin/seo/status`);

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      message: "Unauthorized: Admin authentication required",
      authenticated: false,
    });
  });

  it("returns JSON 404 for an unknown API path", async () => {
    const response = await fetch(`${origin}/api/admin/seo/definitely-does-not-exist`);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "API route not found" });
  });
});