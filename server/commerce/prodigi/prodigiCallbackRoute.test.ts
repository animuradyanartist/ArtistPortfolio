import { describe, it, expect, vi } from "vitest";
import { processProdigiCallback, type CallbackDeps } from "./prodigiCallbackRoute";
import type { ProdigiOrderResponse } from "./prodigiTypes";

function prodigiOrder(
  stage: "InProgress" | "Complete",
  details: Record<string, string> = {},
  tracking?: { number: string; url: string },
): ProdigiOrderResponse {
  return {
    outcome: "Ok",
    order: {
      id: "ord_123",
      status: { stage, details },
      shipments: tracking ? [{ id: "s1", status: "Shipped", carrier: "DHL", tracking }] : [],
    },
  };
}

function deps(over: Partial<CallbackDeps> = {}): CallbackDeps {
  return {
    verifyToken: (t) => t === "good-token",
    getOrderByProdigiId: async () => ({ id: 100, fulfilment_status: "created" }),
    configured: () => true,
    getProdigiOrder: async () => prodigiOrder("InProgress", { shipping: "InProgress" }, { number: "TRK1", url: "https://track/1" }),
    persist: vi.fn(async () => {}),
    ...over,
  };
}

const body = { type: "com.prodigi.order.status.stage.changed#Complete", subject: "ord_123", data: { order: { id: "ord_123" } } };

describe("processProdigiCallback — the routed callback shell", () => {
  it("rejects a request with a wrong/missing secret token (401), doing nothing", async () => {
    const d = deps();
    expect(await processProdigiCallback(d, { token: "wrong", body })).toEqual({ status: 401, body: { received: false } });
    expect(await processProdigiCallback(d, { token: undefined, body })).toEqual({ status: 401, body: { received: false } });
    expect(d.persist).not.toHaveBeenCalled();
  });

  it("acknowledges (200) but ignores a body with no parseable order id", async () => {
    const d = deps();
    const r = await processProdigiCallback(d, { token: "good-token", body: { hello: "world" } });
    expect(r.status).toBe(200);
    expect(r.body.ignored).toBe("no-order-id");
    expect(d.persist).not.toHaveBeenCalled();
  });

  it("acknowledges (200) an unmatched order without persisting", async () => {
    const d = deps({ getOrderByProdigiId: async () => null });
    const r = await processProdigiCallback(d, { token: "good-token", body });
    expect(r.status).toBe(200);
    expect(r.body.unmatched).toBe(true);
    expect(d.persist).not.toHaveBeenCalled();
  });

  it("NEVER marks anything when the provider is unconfigured — it cannot verify the payload", async () => {
    const getProdigiOrder = vi.fn();
    const d = deps({ configured: () => false, getProdigiOrder });
    const r = await processProdigiCallback(d, { token: "good-token", body });
    expect(r.status).toBe(200);
    expect(r.body.deferred).toBe("provider-unconfigured");
    expect(getProdigiOrder).not.toHaveBeenCalled();
    expect(d.persist).not.toHaveBeenCalled();
  });

  it("re-fetches the REAL order (never the payload) and applies a forward status with tracking", async () => {
    const getProdigiOrder = vi.fn(async () => prodigiOrder("InProgress", { shipping: "InProgress" }, { number: "TRK1", url: "https://track/1" }));
    const persist = vi.fn(async () => {});
    const d = deps({ getProdigiOrder, persist, getOrderByProdigiId: async () => ({ id: 100, fulfilment_status: "created" }) });
    const r = await processProdigiCallback(d, { token: "good-token", body });
    expect(getProdigiOrder).toHaveBeenCalledWith("ord_123");
    expect(r.body.applied).toBe(true);
    expect(persist).toHaveBeenCalledWith(100, {
      fulfilmentStatus: "shipped",
      carrier: "DHL",
      trackingNumber: "TRK1",
      trackingUrl: "https://track/1",
    });
  });

  it("does NOT regress a terminal state on a duplicate/reordered callback", async () => {
    const persist = vi.fn(async () => {});
    const d = deps({
      getOrderByProdigiId: async () => ({ id: 100, fulfilment_status: "complete" }),
      getProdigiOrder: async () => prodigiOrder("InProgress", {}),
      persist,
    });
    const r = await processProdigiCallback(d, { token: "good-token", body });
    expect(r.body.applied).toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });
});
