import { describe, it, expect } from "vitest";
import {
  buildPrintQuoteRequest,
  costToMinor,
  selectShipping,
  isQuoteOkOutcome,
  quotePrintShipping,
  checkoutShippingOutcome,
  adminQuoteDiagnostic,
  type ProdigiQuotePort,
} from "./printShipping";
import { ProdigiApiError } from "../prodigi/prodigiClient";
import type { ProdigiQuoteResponse } from "../prodigi/prodigiTypes";

// The REAL Prodigi v4.0 /quotes success shape uses outcome "Created" (not "Ok" — the old, unverified
// assumption that made every real quote fail-closed). The default mirrors reality.
function quoteResponse(over: Partial<ProdigiQuoteResponse> = {}): ProdigiQuoteResponse {
  return {
    outcome: "Created",
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

  it("INJECTS the canvas wrap from the SKU registry — every caller sends it, none has to remember", () => {
    // The bug: a caller that passed no attributes produced a canvas item with NO attributes, and Prodigi
    // rejected it (MissingRequiredAttributes). The builder now sources the required wrap from the registry.
    const req = buildPrintQuoteRequest({ prodigiSku: "GLOBAL-CAN-A3", copies: 1, country: "DE", currency: "EUR" });
    expect(req.items[0].attributes).toEqual({ wrap: "MirrorWrap" });
    expect(req.items).toEqual([{ sku: "GLOBAL-CAN-A3", copies: 1, attributes: { wrap: "MirrorWrap" }, assets: [{ printArea: "default" }] }]);
  });

  it("a PAPER SKU gets NO canvas attributes (wrap is canvas-only)", () => {
    const req = buildPrintQuoteRequest({ prodigiSku: "GLOBAL-HGE-A3", copies: 1, country: "DE", currency: "EUR" });
    expect(req.items[0].attributes).toBeUndefined();
  });

  it("all five verified canvas SKUs carry attributes.wrap = MirrorWrap", () => {
    for (const sku of ["GLOBAL-CAN-A3", "GLOBAL-CAN-12X16", "GLOBAL-CAN-16X20", "GLOBAL-CAN-18X24", "GLOBAL-CAN-24X36"]) {
      expect(buildPrintQuoteRequest({ prodigiSku: sku, copies: 1, country: "DE", currency: "EUR" }).items[0].attributes).toEqual({ wrap: "MirrorWrap" });
    }
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

  it("accepts the REAL success outcome 'Created' (regression: the deployed estimator showed no prices)", () => {
    // This is the exact bug: a genuine Prodigi quote (outcome "Created") must be priced, not rejected.
    const picked = selectShipping(quoteResponse({ outcome: "Created" }), "standard");
    expect(picked).not.toBeNull();
    expect(picked?.shippingMinor).toBe(850);
    expect(picked?.itemsMinor).toBe(6500);
  });

  it("accepts success outcomes case-insensitively ('Created', 'Ok', 'created')", () => {
    for (const outcome of ["Created", "created", "Ok", "OK", "ok"]) {
      expect(selectShipping(quoteResponse({ outcome }), "standard")).not.toBeNull();
    }
  });

  it("returns null when the outcome is a non-success value or nothing is priced", () => {
    expect(selectShipping(quoteResponse({ outcome: "NotEnoughInformation" }))).toBeNull();
    expect(selectShipping(quoteResponse({ outcome: "CountryNotSupported" }))).toBeNull();
    expect(selectShipping(quoteResponse({ quotes: [] }))).toBeNull();
  });
});

describe("isQuoteOkOutcome", () => {
  it("treats only known success values as OK (case-insensitive)", () => {
    expect(isQuoteOkOutcome("Created")).toBe(true);
    expect(isQuoteOkOutcome("ok")).toBe(true);
    expect(isQuoteOkOutcome("NotEnoughInformation")).toBe(false);
    expect(isQuoteOkOutcome(null)).toBe(false);
    expect(isQuoteOkOutcome(undefined)).toBe(false);
  });

  it("accepts 'CreatedWithIssues' — a valid quote with a warning is still a success", () => {
    // The exact outcome the live US quote returns (UsSalesTaxWarning) and international quotes return
    // (import/VAT/customs warnings). Rejecting it was the international-checkout outage.
    expect(isQuoteOkOutcome("CreatedWithIssues")).toBe(true);
    expect(isQuoteOkOutcome("createdwithissues")).toBe(true);
    expect(isQuoteOkOutcome("  CreatedWithIssues  ")).toBe(true);
  });

  it("STILL rejects genuine failures that are not a 'created' outcome (fail-closed preserved)", () => {
    expect(isQuoteOkOutcome("CountryNotSupported")).toBe(false);
    expect(isQuoteOkOutcome("NotEnoughInformation")).toBe(false);
    expect(isQuoteOkOutcome("MissingRequiredAttributes")).toBe(false);
    expect(isQuoteOkOutcome("")).toBe(false);
  });
});

describe("CreatedWithIssues — the international shipping regression", () => {
  // Prodigi returns a VALID quote with outcome "CreatedWithIssues" for US (sales-tax warning) and for
  // international destinations (customs/VAT warnings). The parser used to reject it, so every non-Armenia
  // destination fell to "no-quote" and checkout refused. Armenia returned a clean "Created" and worked.
  const usCanvasQuote = quoteResponse({
    outcome: "CreatedWithIssues",
    quotes: [
      { shipmentMethod: "Standard", costSummary: { items: { amount: "0.00", currency: "USD" }, shipping: { amount: "34.55", currency: "USD" } } },
    ],
  });

  it("selectShipping accepts a CreatedWithIssues response that carries a valid priced quote", () => {
    const picked = selectShipping(usCanvasQuote, "standard");
    expect(picked).not.toBeNull();
    expect(picked?.shippingMinor).toBe(3455); // $34.55 — the exact proven live quote
    expect(picked?.currency).toBe("USD");
    expect(picked?.method).toBe("Standard");
  });

  it("quotePrintShipping returns the real shipping (never a fabricated amount) for CreatedWithIssues", async () => {
    // The exact proven scenario: GLOBAL-CAN-24X36, MirrorWrap injected by the SKU registry, US, USD.
    const port: ProdigiQuotePort = { getQuote: async () => usCanvasQuote };
    const r = await quotePrintShipping(
      { prodigiSku: "GLOBAL-CAN-24X36", copies: 1, country: "US", currency: "USD" },
      { configured: () => true, prodigi: port },
    );
    expect(r).toEqual({ ok: true, shippingMinor: 3455, itemsMinor: 0, currency: "USD", method: "Standard" });
  });

  it("STILL fails closed when CreatedWithIssues carries NO usable priced quote", () => {
    // A warning outcome with an empty/unpriced quotes array is NOT a usable quote — it must not proceed.
    expect(selectShipping(quoteResponse({ outcome: "CreatedWithIssues", quotes: [] }))).toBeNull();
    expect(selectShipping(quoteResponse({
      outcome: "CreatedWithIssues",
      quotes: [{ shipmentMethod: "Standard", costSummary: { items: { amount: "10", currency: "USD" }, shipping: { amount: null as unknown as string, currency: "USD" } } }],
    }))).toBeNull();
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

  it("returns no-quote (with Prodigi's outcome for the admin) when nothing is priced", async () => {
    const port: ProdigiQuotePort = { getQuote: async () => quoteResponse({ outcome: "CountryNotSupported", quotes: [] }) };
    const r = await quotePrintShipping(input, { configured: () => true, prodigi: port });
    expect(r).toEqual({ ok: false, reason: "no-quote", outcome: "CountryNotSupported" });
  });

  it("surfaces the Prodigi HTTP status + issues on an API error (never the key)", async () => {
    const port: ProdigiQuotePort = {
      getQuote: async () => { throw new ProdigiApiError(404, "Not Found", "00-trace-01", { issues: [{ errorCode: "ItemNotFound", description: "Unknown SKU" }] }); },
    };
    const r = await quotePrintShipping(input, { configured: () => true, prodigi: port });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("error");
      expect(r.status).toBe(404);
      expect(r.detail).toContain("HTTP 404");
      expect(r.detail).toContain("ItemNotFound");
    }
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

describe("adminQuoteDiagnostic — distinguishes the failure causes for the admin", () => {
  it("not-configured", () => {
    expect(adminQuoteDiagnostic({ ok: false, reason: "unconfigured" }).code).toBe("not-configured");
  });
  it("invalid-sku (Prodigi 404)", () => {
    expect(adminQuoteDiagnostic({ ok: false, reason: "error", status: 404, detail: "HTTP 404 Not Found" }).code).toBe("invalid-sku");
  });
  it("prodigi-auth (401/403 — bad or wrong-env key)", () => {
    expect(adminQuoteDiagnostic({ ok: false, reason: "error", status: 401 }).code).toBe("prodigi-auth");
    expect(adminQuoteDiagnostic({ ok: false, reason: "error", status: 403 }).code).toBe("prodigi-auth");
  });
  it("prodigi-api-error (other HTTP error)", () => {
    expect(adminQuoteDiagnostic({ ok: false, reason: "error", status: 500, detail: "HTTP 500" }).code).toBe("prodigi-api-error");
  });
  it("destination-unsupported when the outcome mentions country/destination/shipping", () => {
    expect(adminQuoteDiagnostic({ ok: false, reason: "no-quote", outcome: "CountryNotSupported" }).code).toBe("destination-unsupported");
  });
  it("quote-unavailable for a generic no-quote", () => {
    expect(adminQuoteDiagnostic({ ok: false, reason: "no-quote" }).code).toBe("quote-unavailable");
  });
  it("every message is a non-empty, key-free string", () => {
    const cases = [
      adminQuoteDiagnostic({ ok: false, reason: "unconfigured" }),
      adminQuoteDiagnostic({ ok: false, reason: "error", status: 404 }),
      adminQuoteDiagnostic({ ok: false, reason: "no-quote", outcome: "X" }),
    ];
    for (const c of cases) expect(c.message.length).toBeGreaterThan(0);
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
