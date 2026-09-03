/**
 * /google-merchant.xml — the flag gate and the print-invariance guarantee, at the ROUTE level.
 *
 * The single feed carries prints (always) and originals (only when MERCHANT_INCLUDE_ORIGINALS=true).
 * Enabling originals must NEVER change a single print record, and no private asset/secret may appear
 * in the output. These boot the real handler and assert on the actual served XML.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import { registerRoutes } from "./routes";

let server: Server;
let origin: string;
const FLAG = "MERCHANT_INCLUDE_ORIGINALS";
const prevFlag = process.env[FLAG];

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

afterAll(async () => {
  if (prevFlag === undefined) delete process.env[FLAG]; else process.env[FLAG] = prevFlag;
  await new Promise<void>((r) => server.close(() => r()));
});

const feed = async () => (await fetch(`${origin}/google-merchant.xml`)).text();
const printItems = (xml: string) => (xml.match(/<item>[\s\S]*?<\/item>/g) ?? []).filter((b) => b.includes("<g:id>print-"));

const origCount = (xml: string) => (xml.match(/<g:id>original-/g) ?? []).length;

describe("MERCHANT_INCLUDE_ORIGINALS gate", () => {
  it("with the flag OFF: valid RSS and NO originals", async () => {
    delete process.env[FLAG];
    const xml = await feed();
    expect(xml).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
    expect(xml).toContain("</rss>");
    expect(origCount(xml)).toBe(0);
  });

  it("with the flag ON: eligible originals are added, and every print record is unchanged", async () => {
    delete process.env[FLAG];
    const offXml = await feed();
    const off = printItems(offXml);
    process.env[FLAG] = "true";
    const onXml = await feed();
    const on = printItems(onXml);
    // Originals appear only when enabled; the print <item> set is identical either way.
    expect(origCount(offXml)).toBe(0);
    expect(origCount(onXml)).toBeGreaterThan(0);
    expect(on).toEqual(off);
  });

  it("never leaks a private master URL, base64 blob, token or API route — flag on or off", async () => {
    for (const state of ["off", "on"] as const) {
      if (state === "off") delete process.env[FLAG]; else process.env[FLAG] = "true";
      const xml = await feed();
      expect(xml).not.toContain("data:image");
      expect(xml).not.toContain("master");
      expect(xml).not.toContain("/api/");
      expect(xml).not.toContain("token");
      expect(xml).not.toContain("printReadyAssetUrl");
    }
  });
});
