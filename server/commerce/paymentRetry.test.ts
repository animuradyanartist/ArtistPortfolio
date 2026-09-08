/**
 * PAYMENT RETRY — the pure core, tested exhaustively (no DB, no Stripe, no network).
 *
 * These pin the safety properties the feature promises:
 *   • the payable amount is rebuilt AND verified from the order row (never trusted, never re-quoted);
 *   • a paid/refunded order can never be retried;
 *   • the planned session is bound to the SAME order (metadata.orderId), so no duplicate order and no
 *     second reservation is ever created;
 *   • the 15-minute duplicate-reminder throttle reads only successful sends from the email ledger.
 */
import { describe, it, expect } from "vitest";
import type { OrderRow } from "./orders";
import { payableFromOrder, planRetrySession, reminderRecentlySent, type ReminderLedgerRow } from "./paymentRetry";

/** A complete, sane OrderRow the tests tweak per case. Defaults to an UNPAID ORIGINAL, EUR. */
function makeOrder(over: Partial<OrderRow> = {}): OrderRow {
  const base: OrderRow = {
    id: 42, reference: "AM-2026-0042", status: "checkout_created", payment_status: "unpaid",
    buyer_name: "Jane Collector", buyer_email: "jane@example.com", buyer_phone: null,
    ship_country: "US", ship_address1: "1 Main St", ship_address2: null, ship_city: "Denver",
    ship_region: "CO", ship_postal_code: "80014",
    item_type: "artwork", artwork_id: 7,
    artwork_snapshot: JSON.stringify({ title: "Road Through Gold", dimensions: "60×80 cm" }),
    item_price_minor: 100000, currency: "EUR", shipping_minor: 5000, total_minor: 105000,
    shipping_basis: null, shipping_calculation: null, prodigi_cost_minor: null, prodigi_shipping_minor: null,
    stripe_checkout_session_id: "cs_old", stripe_payment_intent_id: null,
    reserved_at: null, reservation_expires_at: null, paid_at: null,
    shipping_carrier: null, tracking_number: null, tracking_url: null,
    packed_at: null, shipped_at: null, delivered_at: null,
    expected_dispatch_at: null, estimated_delivery_at: null,
    exception_state: null, customer_message: null, internal_notes: null,
    tracking_token: "tok_unguessable_1234567890abcdef",
    payment_source: null, stripe_payment_status: null, last_payment_check_at: null, attribution: null,
    promo_code: null, promo_discount_minor: null, promo_discount_type: null, promo_discount_value: null, promo_code_id: null,
    fulfilment_provider: null, print_variant_id: null, prodigi_order_id: null,
    fulfilment_status: null, fulfilment_idempotency_key: null, fulfilment_error: null, fulfilment_retry_count: 0,
    created_at: new Date(), updated_at: new Date(),
  };
  return { ...base, ...over };
}

describe("payableFromOrder — rebuild + VERIFY the amount from the order row", () => {
  it("rebuilds an original with no promo (item + shipping = total)", () => {
    const r = payableFromOrder(makeOrder());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payable).toMatchObject({ itemMinor: 100000, shippingMinor: 5000, totalMinor: 105000, currency: "EUR", isOriginal: true, artworkId: 7 });
    expect(r.payable.itemName).toBe("Road Through Gold");
  });

  it("applies the SNAPSHOTTED promo discount to the item line (server data only)", () => {
    const r = payableFromOrder(makeOrder({ promo_discount_minor: 20000, total_minor: 85000 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payable.itemMinor).toBe(80000);      // 100000 − 20000
    expect(r.payable.shippingMinor).toBe(5000);
    expect(r.payable.totalMinor).toBe(85000);
  });

  it("a FAILED order is still retryable (rebuilds fine)", () => {
    expect(payableFromOrder(makeOrder({ payment_status: "failed" })).ok).toBe(true);
  });

  it("REFUSES a paid order — money already arrived, never retry", () => {
    const r = payableFromOrder(makeOrder({ payment_status: "paid" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.kind).toBe("closed");
  });

  it("REFUSES a refunded order — closed", () => {
    const r = payableFromOrder(makeOrder({ payment_status: "refunded" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.kind).toBe("closed");
  });

  it("REFUSES a row whose parts do not reconcile to the stored total (never charge a wrong amount)", () => {
    const r = payableFromOrder(makeOrder({ total_minor: 999999 }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.kind).toBe("amount-mismatch");
  });

  it("REFUSES a row missing the amounts", () => {
    expect(payableFromOrder(makeOrder({ total_minor: null })).ok).toBe(false);
    expect(payableFromOrder(makeOrder({ item_price_minor: null })).ok).toBe(false);
  });

  it("marks a PRINT as not-original (no reservation needed), even though it carries a source artwork_id", () => {
    const r = payableFromOrder(makeOrder({ item_type: "print", print_variant_id: 3, artwork_snapshot: JSON.stringify({ title: "Golden Field · print" }) }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payable.isOriginal).toBe(false);
  });
});

describe("planRetrySession — bound to the SAME order, amounts from the payable", () => {
  const line = (p: ReturnType<typeof planRetrySession>, i: number) => {
    const li = (p.line_items ?? [])[i] as { price_data?: { unit_amount?: number; currency?: string; product_data?: { name?: string } } };
    return li?.price_data;
  };

  it("carries metadata.orderId = the existing order (retry pays the SAME order — no duplicate order)", () => {
    const order = makeOrder({ id: 4242 });
    const built = payableFromOrder(order);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const p = planRetrySession(order, built.payable, { baseUrl: "https://animuradyan.com", reservationMinutes: 30 });
    expect(p.metadata?.orderId).toBe("4242");
    expect(p.metadata?.reference).toBe(order.reference);
    expect(p.metadata?.retry).toBe("1");
    expect(p.client_reference_id).toBe(order.reference);
  });

  it("sends the customer to pay under THEIR OWN email, and line items sum to the verified total", () => {
    const order = makeOrder();
    const built = payableFromOrder(order);
    if (!built.ok) throw new Error("expected ok");
    const p = planRetrySession(order, built.payable, { baseUrl: "https://animuradyan.com/", reservationMinutes: 30 });
    expect(p.customer_email).toBe("jane@example.com");
    expect(line(p, 0)?.unit_amount).toBe(100000);
    expect(line(p, 0)?.currency).toBe("eur");
    expect(line(p, 1)?.unit_amount).toBe(5000);            // shipping line
    const sum = (p.line_items ?? []).reduce((n, li) => n + ((li as { price_data?: { unit_amount?: number } }).price_data?.unit_amount ?? 0), 0);
    expect(sum).toBe(built.payable.totalMinor);
    expect(p.success_url).toContain(`/order/${order.reference}`);
  });

  it("omits the shipping line when shipping is absorbed (0), and matches the total", () => {
    const order = makeOrder({ shipping_minor: 0, total_minor: 100000 });
    const built = payableFromOrder(order);
    if (!built.ok) throw new Error("expected ok");
    const p = planRetrySession(order, built.payable, { baseUrl: "https://x.test" });
    expect((p.line_items ?? []).length).toBe(1);
  });

  it("sets an expiry for an ORIGINAL (matches the reservation window) and none for a PRINT", () => {
    const now = new Date("2026-09-08T12:00:00Z");
    const orig = makeOrder();
    const bo = payableFromOrder(orig); if (!bo.ok) throw new Error();
    const po = planRetrySession(orig, bo.payable, { baseUrl: "https://x.test", reservationMinutes: 30, now });
    expect(po.expires_at).toBe(Math.floor(now.getTime() / 1000) + 30 * 60);

    const print = makeOrder({ item_type: "print", print_variant_id: 1 });
    const bp = payableFromOrder(print); if (!bp.ok) throw new Error();
    const pp = planRetrySession(print, bp.payable, { baseUrl: "https://x.test" });
    expect(pp.expires_at).toBeUndefined();
  });
});

describe("reminderRecentlySent — the 15-minute duplicate throttle", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();
  const rows = (rs: Array<Partial<ReminderLedgerRow>>): ReminderLedgerRow[] =>
    rs.map((r) => ({ kind: "payment_reminder", status: "sent", created_at: ago(1), ...r }));

  it("throttles when a reminder was SENT within the window", () => {
    expect(reminderRecentlySent(rows([{ created_at: ago(5) }]), now, 15)).toBe(true);
  });
  it("does NOT throttle once the window has passed", () => {
    expect(reminderRecentlySent(rows([{ created_at: ago(20) }]), now, 15)).toBe(false);
  });
  it("ignores a FAILED/skipped reminder (only a successful send counts)", () => {
    expect(reminderRecentlySent(rows([{ status: "failed", created_at: ago(2) }]), now, 15)).toBe(false);
    expect(reminderRecentlySent(rows([{ status: "skipped", created_at: ago(2) }]), now, 15)).toBe(false);
  });
  it("ignores other email kinds", () => {
    expect(reminderRecentlySent(rows([{ kind: "shipped", created_at: ago(2) }]), now, 15)).toBe(false);
  });
  it("no history → not throttled", () => {
    expect(reminderRecentlySent([], now, 15)).toBe(false);
  });
});
