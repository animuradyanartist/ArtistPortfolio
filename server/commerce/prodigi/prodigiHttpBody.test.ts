/**
 * HTTP REQUEST-BODY BOUNDARY — asserts the EXACT JSON body the Prodigi client serializes and sends.
 *
 * A passing builder unit test is not enough: the bug that shipped was a canvas quote item reaching
 * Prodigi with NO `attributes`, so Prodigi answered MissingRequiredAttributes. These tests drive the
 * REAL client (`prodigi.getQuote` / `prodigi.createOrder`) with `fetch` mocked at the network edge and
 * assert on the actual serialized body string — the same bytes Prodigi receives.
 *
 * No key is printed or asserted: a dummy SANDBOX key is set only so the client is "configured", and the
 * captured request's headers are never read.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prodigi } from "./prodigiClient";
import { buildPrintQuoteRequest } from "../prints/printShipping";
import { buildProdigiOrderRequest, type InternalPrintOrder } from "./printFulfilment";

const DUMMY_SANDBOX_KEY = "sandbox_dummy_key_ABC1234567890";
let captured: { url: string; body: string } | null = null;

const origFetch = global.fetch;
const origLive = process.env.PRODIGI_API_KEY;
const origSandbox = process.env.PRODIGI_SANDBOX_API_KEY;

function fakeResponse(body: unknown): Response {
  const text = JSON.stringify(body);
  return {
    ok: true, status: 200, statusText: "OK",
    headers: { get: (_k: string) => null },
    text: async () => text,
  } as unknown as Response;
}

function installFetch(responseBody: unknown) {
  global.fetch = vi.fn(async (url: any, init: any) => {
    captured = { url: String(url), body: String(init?.body ?? "") };
    return fakeResponse(responseBody);
  }) as unknown as typeof fetch;
}

function sentItem() {
  expect(captured).not.toBeNull();
  return JSON.parse(captured!.body).items[0];
}

beforeEach(() => {
  captured = null;
  delete process.env.PRODIGI_API_KEY;                 // never live in tests → forces SANDBOX
  process.env.PRODIGI_SANDBOX_API_KEY = DUMMY_SANDBOX_KEY;
});
afterEach(() => {
  global.fetch = origFetch;
  if (origLive === undefined) delete process.env.PRODIGI_API_KEY; else process.env.PRODIGI_API_KEY = origLive;
  if (origSandbox === undefined) delete process.env.PRODIGI_SANDBOX_API_KEY; else process.env.PRODIGI_SANDBOX_API_KEY = origSandbox;
  vi.restoreAllMocks();
});

const internalCanvasOrder = (sku: string): InternalPrintOrder => ({
  reference: "AM-2026-9001",
  idempotencyKey: "idem-canvas-1",
  recipient: { name: "A Buyer" },
  ship: { line1: "1 Straße", city: "Berlin", postalCode: "10115", country: "DE" },
  variant: { prodigiSku: sku, printReadyAssetUrl: "https://cdn.example.com/master.tif", copies: 1 },
});

describe("Prodigi HTTP body — canvas wrap reaches the wire", () => {
  it("(1) canvas QUOTE body includes attributes.wrap = MirrorWrap", async () => {
    installFetch({ outcome: "Created", quotes: [] });
    await prodigi.getQuote(buildPrintQuoteRequest({ prodigiSku: "GLOBAL-CAN-A3", copies: 1, country: "DE", currency: "EUR" }));
    expect(captured!.url).toContain("/v4.0/quotes");
    expect(sentItem()).toEqual({ sku: "GLOBAL-CAN-A3", copies: 1, attributes: { wrap: "MirrorWrap" }, assets: [{ printArea: "default" }] });
    // The literal serialized bytes carry it (this is exactly what the previous body was missing).
    expect(captured!.body).toContain('"attributes":{"wrap":"MirrorWrap"}');
  });

  it("(1b) every verified canvas SKU sends the wrap on the wire", async () => {
    for (const sku of ["GLOBAL-CAN-A3", "GLOBAL-CAN-12X16", "GLOBAL-CAN-16X20", "GLOBAL-CAN-18X24", "GLOBAL-CAN-24X36"]) {
      installFetch({ outcome: "Created", quotes: [] });
      await prodigi.getQuote(buildPrintQuoteRequest({ prodigiSku: sku, copies: 1, country: "DE", currency: "EUR" }));
      expect(sentItem().attributes).toEqual({ wrap: "MirrorWrap" });
    }
  });

  it("(2) paper QUOTE body has NO canvas wrap", async () => {
    installFetch({ outcome: "Created", quotes: [] });
    await prodigi.getQuote(buildPrintQuoteRequest({ prodigiSku: "GLOBAL-HGE-A3", copies: 1, country: "DE", currency: "EUR" }));
    expect(sentItem().attributes).toBeUndefined();
    expect(captured!.body).not.toContain("wrap");
  });

  it("(3) canvas ORDER body includes attributes.wrap = MirrorWrap (and fillPrintArea)", async () => {
    installFetch({ outcome: "created", order: { id: "ord_x", status: { stage: "InProgress", details: {} }, shipments: [] } });
    await prodigi.createOrder(buildProdigiOrderRequest(internalCanvasOrder("GLOBAL-CAN-16X20")));
    expect(captured!.url).toContain("/v4.0/orders");
    const item = sentItem();
    expect(item.sku).toBe("GLOBAL-CAN-16X20");
    expect(item.attributes).toEqual({ wrap: "MirrorWrap" });
    expect(item.sizing).toBe("fillPrintArea");
    expect(captured!.body).toContain('"wrap":"MirrorWrap"');
  });
});
