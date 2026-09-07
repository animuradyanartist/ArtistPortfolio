/**
 * THE COLLECTOR SIGNUP FLOW, END TO END (route + storage).
 *
 * Production returned HTTP 500 "Failed to join the collector list" for a valid email: the live
 * `collectors` table predated the `source` column, so storage.addCollector's INSERT/SELECT threw
 * `column "source" does not exist`. The schema-level cause is covered by selfHealDdl.test.ts; this
 * pins the ROUTE CONTRACT the signup form depends on, against the in-memory store:
 *   - a valid new email subscribes (201) and is persisted WITH its source,
 *   - an invalid email is a clear 400 (never the generic 500 the form showed as "something went wrong"),
 *   - a duplicate is idempotent — 201, the same id, and NO second row (no duplicate subscriptions).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "http";
import { registerRoutes } from "./routes";
import { storage } from "./storage";

let server: Server;
let origin: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  server = await registerRoutes(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const a = server.address();
  if (!a || typeof a === "string") throw new Error("no port");
  origin = `http://127.0.0.1:${a.port}`;
}, 30_000);

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

const post = (body: unknown) =>
  fetch(`${origin}/api/collectors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/collectors — collector signup", () => {
  it("a valid new email subscribes (201) and is persisted with its source", async () => {
    const email = `new-${Date.now()}@example.com`;
    const res = await post({ email, source: "homepage" });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { ok: boolean; id: number };
    expect(json.ok).toBe(true);
    expect(typeof json.id).toBe("number");

    const row = (await storage.getAllCollectors()).find((c) => c.email === email);
    expect(row).toBeTruthy();
    expect(row!.source).toBe("homepage"); // the field that was missing in production
  });

  it("an invalid email is a clear 400, not a generic 500", async () => {
    const res = await post({ email: "not-an-email", source: "homepage" });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { message?: string };
    expect(json.message ?? "").toMatch(/valid email/i);
  });

  it("a duplicate email is idempotent: 201, same id, and no second row", async () => {
    const email = `dupe-${Date.now()}@example.com`;
    const first = (await (await post({ email, source: "artwork" })).json()) as { id: number };
    const second = await post({ email, source: "artwork" });
    expect(second.status).toBe(201); // NOT an error the form would show as "something went wrong"
    const secondJson = (await second.json()) as { id: number };
    expect(secondJson.id).toBe(first.id);

    const rows = (await storage.getAllCollectors()).filter((c) => c.email === email);
    expect(rows).toHaveLength(1); // no duplicate subscription created
  });

  it("trims + lowercases, so 'Me@X.com' and '  me@x.com ' are one subscriber", async () => {
    const mixed = `Me-${Date.now()}@Example.com`;
    const lower = mixed.toLowerCase();
    await post({ email: mixed, source: "homepage" });
    const again = await post({ email: `  ${lower}  `, source: "artwork" });
    expect(again.status).toBe(201);
    const rows = (await storage.getAllCollectors()).filter((c) => c.email === lower);
    expect(rows).toHaveLength(1);
  });
});
