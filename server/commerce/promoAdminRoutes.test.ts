/**
 * THE PROMO ADMIN API IS REGISTERED AND REACHABLE.
 *
 * Proves the endpoints AdminPromoCodes calls actually exist behind the app (not an HTML fallback),
 * and that they are guarded by admin auth — i.e. an unauthenticated request reaches the real route
 * and is refused with a JSON 401, rather than 404-ing because the route was never mounted.
 */
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
  app.use(session({ secret: "promo-routing-test-secret", resave: false, saveUninitialized: false, cookie: { secure: false } }));
  server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not open a port");
  origin = `http://127.0.0.1:${address.port}`;
}, 30_000);

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

const UNAUTHORIZED = { message: "Unauthorized: Admin authentication required", authenticated: false };

describe("promo admin API routing", () => {
  it("GET /api/admin/promo-codes reaches the guarded route (JSON 401, not an HTML 404)", async () => {
    const res = await fetch(`${origin}/api/admin/promo-codes`);
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual(UNAUTHORIZED);
  });

  it("the write routes are all registered and guarded", async () => {
    const post = await fetch(`${origin}/api/admin/promo-codes`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "X" }),
    });
    const patch = await fetch(`${origin}/api/admin/promo-codes/1`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "X" }),
    });
    const active = await fetch(`${origin}/api/admin/promo-codes/1/active`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: false }),
    });
    const del = await fetch(`${origin}/api/admin/promo-codes/1`, { method: "DELETE" });
    for (const res of [post, patch, active, del]) {
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual(UNAUTHORIZED);
    }
  });

  it("an unknown promo path is a JSON 404, not an HTML fallback", async () => {
    const res = await fetch(`${origin}/api/admin/promo-codes/definitely/not/a/route`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
