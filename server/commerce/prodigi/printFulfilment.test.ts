/**
 * Fulfilment decides real money and real production, so its logic is tested at the edges:
 * fail-closed with no key, idempotency key carried through, alreadyExists reconciled, a thrown
 * API error left as a visible paid-but-failed order, and the status/tracking mapping.
 * No network — a mock ProdigiPort stands in for the real client (the real one is verified against
 * sandbox only once a key exists).
 */
import { describe, it, expect, vi } from "vitest";
import {
  createPrintFulfilment,
  buildProdigiOrderRequest,
  mapProdigiStatus,
  extractTracking,
  type InternalPrintOrder,
  type ProdigiPort,
} from "./printFulfilment";
import type { ProdigiOrderResponse } from "./prodigiTypes";

const order = (over: Partial<InternalPrintOrder> = {}): InternalPrintOrder => ({
  reference: "AM-2026-0007",
  idempotencyKey: "idem-abc-123",
  recipient: { name: "A Buyer", email: "buyer@example.com" },
  ship: { line1: "1 Test St", city: "London", postalCode: "SW1A 1AA", country: "GB" },
  variant: { prodigiSku: "GLOBAL-HGE-A2", printReadyAssetUrl: "https://cdn.example.com/a.jpg", md5Hash: "abc" },
  callbackUrl: "https://animuradyan.com/api/commerce/prodigi/callback?t=secret",
  ...over,
});

const resp = (over: Partial<ProdigiOrderResponse["order"]> = {}, outcome = "created"): ProdigiOrderResponse => ({
  outcome,
  order: {
    id: "ord_999",
    status: { stage: "InProgress", details: {} },
    shipments: [],
    ...over,
  },
});

describe("buildProdigiOrderRequest", () => {
  it("carries the idempotency key as a BODY field and maps recipient/asset", () => {
    const req = buildProdigiOrderRequest(order());
    expect(req.idempotencyKey).toBe("idem-abc-123");
    expect(req.merchantReference).toBe("AM-2026-0007");
    expect(req.recipient.address.countryCode).toBe("GB");
    expect(req.items[0].sku).toBe("GLOBAL-HGE-A2");
    expect(req.items[0].sizing).toBe("fillPrintArea");
    expect(req.items[0].assets[0].url).toBe("https://cdn.example.com/a.jpg");
    expect(req.items[0].assets[0].md5Hash).toBe("abc");
    expect(req.shippingMethod).toBe("Standard");
  });

  it("a PAPER order carries NO canvas attributes", () => {
    // Default order() is GLOBAL-HGE-A2 (paper) — the registry adds no wrap.
    expect(buildProdigiOrderRequest(order()).items[0].attributes).toBeUndefined();
  });

  it("a CANVAS order INJECTS attributes.wrap = MirrorWrap from the SKU registry (canonical serializer)", () => {
    const req = buildProdigiOrderRequest(order({ variant: { prodigiSku: "GLOBAL-CAN-16X20", printReadyAssetUrl: "https://cdn.example.com/a.jpg" } }));
    expect(req.items[0].attributes).toEqual({ wrap: "MirrorWrap" });
    expect(req.items[0].sizing).toBe("fillPrintArea");
  });

  it("a CANVAS order merges the wrap with an order-specific attribute (frame), registry supplying wrap", () => {
    const req = buildProdigiOrderRequest(order({ variant: { prodigiSku: "GLOBAL-CAN-16X20", printReadyAssetUrl: "https://cdn.example.com/a.jpg", attributes: { frameColour: "black" } } }));
    expect(req.items[0].attributes).toEqual({ wrap: "MirrorWrap", frameColour: "black" });
  });
});

describe("createPrintFulfilment", () => {
  it("FAILS CLOSED when Prodigi is not configured — order waits, never fails", async () => {
    const prodigi: ProdigiPort = { createOrder: vi.fn() };
    const out = await createPrintFulfilment(order(), { prodigi, configured: () => false });
    expect(out.state).toBe("pending_unconfigured");
    expect(out.fulfilmentStatus).toBe("pending");
    expect(out.prodigiOrderId).toBeNull();
    expect(prodigi.createOrder).not.toHaveBeenCalled(); // never touched the API
  });

  it("creates an order and returns its id + status when configured", async () => {
    const prodigi: ProdigiPort = { createOrder: vi.fn().mockResolvedValue(resp()) };
    const out = await createPrintFulfilment(order(), { prodigi, configured: () => true });
    expect(out.state).toBe("created");
    expect(out.prodigiOrderId).toBe("ord_999");
    expect(prodigi.createOrder).toHaveBeenCalledOnce();
    // the idempotency key reached the API
    expect((prodigi.createOrder as any).mock.calls[0][0].idempotencyKey).toBe("idem-abc-123");
  });

  it("reconciles a duplicate to alreadyExists instead of double-producing", async () => {
    const prodigi: ProdigiPort = { createOrder: vi.fn().mockResolvedValue(resp({}, "alreadyExists")) };
    const out = await createPrintFulfilment(order(), { prodigi, configured: () => true });
    expect(out.state).toBe("already_exists");
    expect(out.prodigiOrderId).toBe("ord_999");
  });

  it("leaves a paid order visibly FAILED (never lost) when the API throws", async () => {
    const prodigi: ProdigiPort = { createOrder: vi.fn().mockRejectedValue(new Error("Prodigi 503 down")) };
    const out = await createPrintFulfilment(order(), { prodigi, configured: () => true });
    expect(out.state).toBe("failed");
    expect(out.fulfilmentStatus).toBe("failed");
    expect(out.error).toMatch(/503/);
  });
});

describe("status + tracking mapping", () => {
  it("maps Prodigi stage/details to our internal status", () => {
    expect(mapProdigiStatus(resp({ status: { stage: "InProgress", details: {} } }))).toBe("created");
    expect(mapProdigiStatus(resp({ status: { stage: "InProgress", details: { inProduction: "InProgress" } } }))).toBe("inproduction");
    expect(mapProdigiStatus(resp({ status: { stage: "InProgress", details: { shipping: "InProgress" } } }))).toBe("shipped");
    expect(mapProdigiStatus(resp({ status: { stage: "Complete", details: {} } }))).toBe("complete");
    expect(mapProdigiStatus(resp({ status: { stage: "Cancelled", details: {} } }))).toBe("cancelled");
  });

  it("lifts carrier + tracking url off the shipment when present (documented { name, service } carrier)", () => {
    const t = extractTracking(resp({ shipments: [{ id: "shp_1", status: "Shipped", carrier: { name: "royalmail", service: "Tracked 48" }, tracking: { number: "RM123", url: "https://track/RM123" } }] }));
    expect(t).toEqual({ carrier: "royalmail", number: "RM123", url: "https://track/RM123" });
    expect(extractTracking(resp())).toBeNull(); // no shipments yet
  });
});

describe("reconciled against the REAL sandbox order (ord_1169093, verified 2026)", () => {
  // The exact shape the sandbox returned for a fresh create: outcome Created, stage InProgress,
  // no shipments yet. Locks our client's interpretation to the verified reality.
  const sandboxCreate: ProdigiOrderResponse = {
    outcome: "Created",
    order: { id: "ord_1169093", status: { stage: "InProgress", details: {} }, shipments: [] },
  };

  it("a freshly-created sandbox order maps to 'created' with no tracking", () => {
    expect(mapProdigiStatus(sandboxCreate)).toBe("created");
    expect(extractTracking(sandboxCreate)).toBeNull();
  });

  it("createPrintFulfilment records the provider order id + 'created' state (idempotency key carried)", async () => {
    const client: ProdigiPort = { createOrder: vi.fn(async () => sandboxCreate) };
    const out = await createPrintFulfilment(order(), { prodigi: client, configured: () => true });
    expect(out.state).toBe("created");
    expect(out.prodigiOrderId).toBe("ord_1169093");
    expect(out.fulfilmentStatus).toBe("created");
    expect(out.tracking).toBeNull();
    // the body Prodigi received carried our stable idempotency key as a BODY field
    const req = (client.createOrder as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(req.idempotencyKey).toBe("idem-abc-123");
  });

  it("a duplicate create returns Prodigi 'alreadyExists' and reconciles rather than double-producing", async () => {
    const dup: ProdigiOrderResponse = { ...sandboxCreate, outcome: "alreadyExists" };
    const client: ProdigiPort = { createOrder: vi.fn(async () => dup) };
    const out = await createPrintFulfilment(order(), { prodigi: client, configured: () => true });
    expect(out.state).toBe("already_exists");
    expect(out.prodigiOrderId).toBe("ord_1169093");
  });
});
