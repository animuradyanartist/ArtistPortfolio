import { describe, it, expect } from "vitest";
import {
  buildPrintQuoteRequest,
  costToMinor,
  selectShipping,
  quotePrintShipping,
  checkoutShippingOutcome,
  type ProdigiQuotePort,
} from "./printShipping";
import type { ProdigiQuoteResponse } from "../prodigi/prodigiTypes";

function quoteResponse(over: Partial<ProdigiQuoteResponse> = {}): ProdigiQuoteResponse {
  return {
    outcome: "Ok",
    quotes: [
      {
        shipmentMethod: "Standard",
        costSummary: { items: { amount: "65.00", currency: "EUR" }, shipping: { amount: "8.50", currency: "EUR" } },
      },
    ],
    ...over,
  };
}

describe("buildPrintQuoteRequest", () => {
  it("targets the destination + SKU with a print-area asset and no order side-effect", () => {
    const req = buildPrintQuoteRequest({ prodigiSku: "GLOBAL-HGE-12X16", copies: 2, country: "de", currency: "eur" });
    expect(req.destinationCountryCode).toBe("DE");
    expect(req.currencyCode).toBe("EUR");
    expect(req.shippingMethod).toBe("standard");
    expect(req.items).toEqual([{ sku: "GLOBAL-HGE-12X16", copies: 2, assets: [{ printArea: "default" }] }]);
  });

  it("includes attributes only when present and floors copies to at least 1", () => {
    const req = buildPrintQuoteRequest({ prodigiSku: "S", copies: 0, country: "US", currency: "USD", attributes: { frameColour: "black" } });
    expect(req.items[0].copies).toBe(1);
    expect(req.items[0].attributes).toEqual({ frameColour: "black" });
  });
});

describe("costToMinor", () => {
  it("parses decimal strings to integer minor units", () => {
    expect(costToMinor("8.50")).toBe(850);
    expect(costToMinor("12")).toBe(1200);
    expect(costToMinor("0.00")).toBe(0);
  });
  it("rejects non-numeric / negative as null (never free shipping by accident)", () => {
    expect(costToMinor("free")).toBeNull();
    expect(costToMinor(null)).toBeNull();
    expect(costToMinor("-5")).toBeNull();
  });
});

describe("selectShipping", () => {
  it("prefers the requested method, else the cheapest", () => {
    const resp = quoteResponse({
      quotes: [
        { shipmentMethod: "Express", costSummary: { items: { amount: "65", currency: "EUR" }, shipping: { amount: "20", currency: "EUR" } } },
        { shipmentMethod: "Standard", costSummary: { items: { amount: "65", currency: "EUR" }, shipping: { amount: "8.5", currency: "EUR" } } },
      ],
    });
    expect(selectShipping(resp, "standard")?.shippingMinor).toBe(850);
    expect(selectShipping(resp)?.shippingMinor).toBe(850); // cheapest fallback
  });

  it("returns null when the outcome is not Ok or nothing is priced", () => {
    expect(selectShipping(quoteResponse({ outcome: "NotEnoughInformation" }))).toBeNull();
    expect(selectShipping(quoteResponse({ quotes: [] }))).toBeNull();
  });
});

describe("quotePrintShipping — fails closed", () => {
  const input = { prodigiSku: "GLOBAL-HGE-12X16", copies: 1, country: "DE", currency: "EUR" };

  it("returns unconfigured when Prodigi has no key (no fabricated amount)", async () => {
    const r = await quotePrintShipping(input, { configured: () => false });
    expect(r).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("returns the real shipping when the provider answers", async () => {
    const port: ProdigiQuotePort = { getQuote: async () => quoteResponse() };
    const r = await quotePrintShipping(input, { configured: () => true, prodigi: port });
    expect(r).toEqual({ ok: true, shippingMinor: 850, itemsMinor: 6500, currency: "EUR", method: "Standard" });
  });

  it("returns error (never a number) when the provider throws", async () => {
    const port: ProdigiQuotePort = { getQuote: async () => { throw new Error("boom"); } };
    const r = await quotePrintShipping(input, { configured: () => true, prodigi: port });
    expect(r).toEqual({ ok: false, reason: "error" });
  });

  it("returns no-quote when the response carries no usable shipping", async () => {
    const port: ProdigiQuotePort = { getQuote: async () => quoteResponse({ quotes: [] }) };
    const r = await quotePrintShipping(input, { configured: () => true, prodigi: port });
    expect(r).toEqual({ ok: false, reason: "no-quote" });
  });

  it("(4) surfaces the Prodigi PRODUCTION cost (costSummary.items) alongside shipping", async () => {
    const port: ProdigiQuotePort = { getQuote: async () => quoteResponse() };
    const r = await quotePrintShipping(input, { configured: () => true, prodigi: port });
    expect(r.ok && r.itemsMinor).toBe(6500);   // production cost, from the SAME quote — never fabricated
    expect(r.ok && r.shippingMinor).toBe(850);
  });

  it("(6) shipping varies by destination — a different Prodigi quote yields a different amount", async () => {
    const de: ProdigiQuotePort = { getQuote: async () => quoteResponse() }; // shipping 8.50, items 65
    const us: ProdigiQuotePort = { getQuote: async () => quoteResponse({ quotes: [{ shipmentMethod: "Standard", costSummary: { items: { amount: "65.00", currency: "EUR" }, shipping: { amount: "19.90", currency: "EUR" } } }] }) };
    const rDe = await quotePrintShipping({ ...input, country: "DE" }, { configured: () => true, prodigi: de });
    const rUs = await quotePrintShipping({ ...input, country: "US" }, { configured: () => true, prodigi: us });
    expect(rDe.ok && rDe.shippingMinor).toBe(850);
    expect(rUs.ok && rUs.shippingMinor).toBe(1990);
    expect((rDe.ok && rDe.shippingMinor)).not.toBe((rUs.ok && rUs.shippingMinor));
  });
});

describe("checkoutShippingOutcome — the checkout fails CLOSED on an unavailable quote", () => {
  it("(7)(9) a successful quote → proceed with the QUOTED shipping (checkout total = subtotal + this)", () => {
    const o = checkoutShippingOutcome({ ok: true, shippingMinor: 850, itemsMinor: 6500, currency: "EUR", method: "Standard" });
    expect(o.proceed).toBe(true);
    if (o.proceed) {
      expect(o.shippingMinor).toBe(850);         // the customer is charged the quoted shipping
      expect(o.prodigiCostMinor).toBe(6500);     // production cost captured for accounting
      // Stripe total for a 12000-minor item = subtotal + quoted shipping.
      expect(12000 + o.shippingMinor).toBe(12850);
    }
  });

  it("(8) a failed quote → DO NOT proceed (never free shipping, never a wrong total), with a clear message", () => {
    for (const reason of ["unconfigured", "no-quote", "error"] as const) {
      const o = checkoutShippingOutcome({ ok: false, reason });
      expect(o.proceed).toBe(false);
      if (!o.proceed) {
        expect(o.reason).toBe(reason);
        expect(o.message).toMatch(/unavailable|couldn.t calculate shipping/i);
      }
    }
  });
});
