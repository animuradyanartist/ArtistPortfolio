/**
 * The callback is a public URL, so its guard is tested: a wrong/missing token is refused, the order
 * id is parsed from the CloudEvents subject (never trusted beyond that), and status application is
 * idempotent and never regresses a terminal state (duplicate/reordered callbacks are safe).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  tokensMatch,
  verifyCallbackToken,
  parseCallbackOrderId,
  shouldApplyStatus,
  applyRefetchedOrder,
  customerLifecycleForFulfilment,
} from "./prodigiCallback";
import type { ProdigiOrderResponse } from "./prodigiTypes";

const order = (stage: any, details: any = {}, shipments: any[] = []): ProdigiOrderResponse => ({
  outcome: "created",
  order: { id: "ord_1", status: { stage, details }, shipments },
});

describe("callback token", () => {
  const OLD = process.env.PRODIGI_WEBHOOK_TOKEN;
  beforeEach(() => { process.env.PRODIGI_WEBHOOK_TOKEN = "s3cr3t-token-value"; });
  afterEach(() => { process.env.PRODIGI_WEBHOOK_TOKEN = OLD; });

  it("accepts the exact token, rejects wrong/missing/empty", () => {
    expect(verifyCallbackToken("s3cr3t-token-value")).toBe(true);
    expect(verifyCallbackToken("wrong")).toBe(false);
    expect(verifyCallbackToken(undefined)).toBe(false);
    expect(verifyCallbackToken("")).toBe(false);
  });

  it("rejects everything when no token is configured", () => {
    delete process.env.PRODIGI_WEBHOOK_TOKEN;
    expect(verifyCallbackToken("anything")).toBe(false);
  });

  it("tokensMatch is length-safe and constant-time-ish", () => {
    expect(tokensMatch("abc", "abc")).toBe(true);
    expect(tokensMatch("abc", "abcd")).toBe(false);
    expect(tokensMatch(null, "abc")).toBe(false);
  });
});

describe("parseCallbackOrderId", () => {
  it("reads the ord_ id from the CloudEvents subject", () => {
    expect(parseCallbackOrderId({ subject: "ord_42" })).toBe("ord_42");
  });
  it("falls back to data.order.id", () => {
    expect(parseCallbackOrderId({ data: { order: { id: "ord_7" } } })).toBe("ord_7");
  });
  it("returns null for junk / unknown shapes", () => {
    expect(parseCallbackOrderId({ subject: "not-an-order" })).toBeNull();
    expect(parseCallbackOrderId(null)).toBeNull();
    expect(parseCallbackOrderId("string")).toBeNull();
  });
});

describe("shouldApplyStatus — idempotent, no regress", () => {
  it("advances forward", () => {
    expect(shouldApplyStatus("created", "inproduction")).toBe(true);
    expect(shouldApplyStatus("inproduction", "shipped")).toBe(true);
    expect(shouldApplyStatus(null, "created")).toBe(true);
  });
  it("ignores duplicates and backwards moves (safe on reorder/retry)", () => {
    expect(shouldApplyStatus("shipped", "shipped")).toBe(false); // duplicate
    expect(shouldApplyStatus("complete", "inproduction")).toBe(false); // regress
    expect(shouldApplyStatus("shipped", "created")).toBe(false);
  });
});

describe("applyRefetchedOrder", () => {
  it("derives status + tracking from the re-fetched order and gates by no-regress", () => {
    const refetched = order("InProgress", { shipping: "InProgress" }, [
      { id: "shp_1", status: "Shipped", carrier: "dpd", tracking: { number: "D1", url: "https://t/D1" } },
    ]);
    const a = applyRefetchedOrder("inproduction", refetched);
    expect(a.fulfilmentStatus).toBe("shipped");
    expect(a.tracking?.url).toBe("https://t/D1");
    expect(a.apply).toBe(true);

    // a duplicate of the same shipped state must not re-apply
    const b = applyRefetchedOrder("shipped", refetched);
    expect(b.apply).toBe(false);
  });
});

describe("customerLifecycleForFulfilment — Prodigi drives a print's customer status + email", () => {
  it("created adds no customer change (the order was already confirmed on payment)", () => {
    expect(customerLifecycleForFulfilment("paid", "created")).toEqual({ status: null, email: null });
  });
  it("inproduction → Preparing + preparing email", () => {
    expect(customerLifecycleForFulfilment("paid", "inproduction")).toEqual({ status: "preparing", email: "preparing" });
  });
  it("shipped → Shipped + shipped email", () => {
    expect(customerLifecycleForFulfilment("preparing", "shipped")).toEqual({ status: "shipped", email: "shipped" });
    expect(customerLifecycleForFulfilment("paid", "shipped")).toEqual({ status: "shipped", email: "shipped" });
  });
  it("complete → Shipped (Prodigi complete = dispatched/closed, NEVER 'delivered')", () => {
    expect(customerLifecycleForFulfilment("preparing", "complete")).toEqual({ status: "shipped", email: "shipped" });
  });
  it("no move when already at/after the target (idempotent) or on a backward map", () => {
    expect(customerLifecycleForFulfilment("shipped", "shipped")).toEqual({ status: null, email: null });   // same
    expect(customerLifecycleForFulfilment("shipped", "complete")).toEqual({ status: null, email: null });  // already shipped
    expect(customerLifecycleForFulfilment("shipped", "inproduction")).toEqual({ status: null, email: null }); // out-of-order, no regress
  });
  it("cancelled / failed / pending → no automatic customer move", () => {
    for (const s of ["cancelled", "failed", "pending"]) {
      expect(customerLifecycleForFulfilment("paid", s)).toEqual({ status: null, email: null });
    }
  });
});
