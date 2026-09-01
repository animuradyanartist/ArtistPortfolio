/**
 * DISPATCH IDEMPOTENCY — the once-only guarantee, tested at the dispatch layer.
 *
 * The real guarantee is the `order_emails.dedupe_key` unique index; here `claimOrderEmail` is mocked
 * to simulate that index (an in-memory Set), the Resend provider is mocked to capture sends, and the
 * real render templates are used. So: a confirmation (or any once-only status email) sends exactly
 * once; a second call — a Stripe webhook retry, or re-setting the same status — sends nothing.
 * No real email is ever sent (the provider is mocked).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OrderRow } from "../commerce/orders";

const H = vi.hoisted(() => ({
  sent: [] as { to: string; subject: string; html: string; text: string }[],
  claimed: new Set<string>(),
  id: { n: 0 },
  configured: { v: true },
}));

vi.mock("../commerce/orders", () => ({ ensureTrackingToken: async () => "tok_test" }));
vi.mock("./provider", () => ({
  emailConfigured: () => H.configured.v,
  sendEmail: async (msg: { to: string; subject: string; html: string; text: string }) => {
    H.sent.push(msg);
    return { ok: true, id: `msg_${++H.id.n}` };
  },
}));
vi.mock("./emailLog", () => ({
  // Simulates the unique index on dedupe_key: a claimed key can never be claimed again.
  claimOrderEmail: async (_o: number, _k: string, _t: string | null, _s: string | null, dedupeKey: string | null) => {
    if (dedupeKey) {
      if (H.claimed.has(dedupeKey)) return { claimed: false, id: null };
      H.claimed.add(dedupeKey);
      return { claimed: true, id: ++H.id.n };
    }
    return { claimed: true, id: ++H.id.n };
  },
  finishOrderEmail: async () => {},
  releaseOrderEmailClaim: async () => {},
  logOrderEmail: async () => {},
  listOrderEmails: async () => [],
}));

import {
  sendOrderConfirmation, sendPackedEmail, sendShippedEmail, sendPreparingStatusEmail, sendInTransitEmail,
} from "./index";

function makeOrder(o: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 1, reference: "AM-2026-0007", status: "paid", payment_status: "paid",
    buyer_name: "Sargsyan Armen", buyer_email: "buyer@example.com", buyer_phone: null,
    ship_country: "France", ship_address1: "1 Rue", ship_address2: null, ship_city: "Paris", ship_region: null, ship_postal_code: "75001",
    item_type: "artwork", artwork_id: 18,
    artwork_snapshot: JSON.stringify({ title: "Endless Horizon", dimensions: "80×100 cm", image: "/img/artwork/18/0" }),
    item_price_minor: 242000, currency: "EUR", shipping_minor: 8000, total_minor: 250000,
    shipping_basis: null, shipping_calculation: null,
    stripe_checkout_session_id: "cs_1", stripe_payment_intent_id: "pi_1",
    reserved_at: null, reservation_expires_at: null, paid_at: new Date(),
    shipping_carrier: null, tracking_number: null, tracking_url: null,
    packed_at: null, shipped_at: null, delivered_at: null,
    expected_dispatch_at: null, estimated_delivery_at: null,
    exception_state: null, customer_message: null, internal_notes: null,
    tracking_token: "tok_test", attribution: null,
    created_at: new Date(), updated_at: new Date(),
    ...o,
  } as OrderRow;
}
const printOrder = (o: Partial<OrderRow> = {}) => makeOrder({
  id: 2, item_type: "print", artwork_id: 42,
  artwork_snapshot: JSON.stringify({ itemType: "print", title: "Blue Hour", material: "german-etching", sizeLabel: "16×20 in (40×50 cm)", quantity: 1, image: "data:image/webp;base64,UklGRhIAAAA=" }),
  ...o,
});

beforeEach(() => { H.sent = []; H.claimed = new Set(); H.id = { n: 0 }; H.configured.v = true; });

describe("order confirmation — exactly one per order, retry-safe", () => {
  it("a paid ORIGINAL order sends exactly one confirmation", async () => {
    const r = await sendOrderConfirmation(makeOrder());
    expect(r.status).toBe("sent");
    expect(H.sent).toHaveLength(1);
    expect(H.sent[0].subject).toBe("Order confirmed — Endless Horizon");
  });
  it("a paid PRINT order sends exactly one confirmation with print content", async () => {
    const r = await sendOrderConfirmation(printOrder());
    expect(r.status).toBe("sent");
    expect(H.sent).toHaveLength(1);
    expect(H.sent[0].subject).toBe("Print order confirmed — Blue Hour");
    expect(H.sent[0].html).toContain("Fine Art Print");
    expect(H.sent[0].html).not.toContain("data:image");                 // base64 never sent
    expect(H.sent[0].html).toContain("https://animuradyan.com/img/artwork/42/0");
  });
  it("a WEBHOOK RETRY (second call, same order) sends NOTHING — no duplicate", async () => {
    await sendOrderConfirmation(makeOrder());
    const again = await sendOrderConfirmation(makeOrder());
    expect(again.status).toBe("skipped");
    expect(again.reason).toBe("already-sent");
    expect(H.sent).toHaveLength(1);                                      // still one
  });
  it("skips (records) when email is not configured — never throws, sends nothing", async () => {
    H.configured.v = false;
    const r = await sendOrderConfirmation(makeOrder());
    expect(r.status).toBe("skipped");
    expect(H.sent).toHaveLength(0);
  });
});

describe("status emails — one per status, re-set sends no duplicate", () => {
  it("packed sends once; a second 'packed' (same status re-set) sends nothing", async () => {
    expect((await sendPackedEmail(makeOrder())).status).toBe("sent");
    const again = await sendPackedEmail(makeOrder());
    expect(again.status).toBe("skipped");
    expect(H.sent).toHaveLength(1);
    expect(H.sent[0].subject).toBe("Your order is packed");
  });
  it("preparing (auto, once-only) sends once then dedupes", async () => {
    expect((await sendPreparingStatusEmail(makeOrder())).status).toBe("sent");
    expect((await sendPreparingStatusEmail(makeOrder())).status).toBe("skipped");
    expect(H.sent).toHaveLength(1);
  });
  it("shipped carries carrier + tracking + a clickable link", async () => {
    await sendShippedEmail(makeOrder({ shipping_carrier: "DHL", tracking_number: "DHL999", tracking_url: "https://dhl.com/DHL999" }));
    expect(H.sent[0].subject).toBe("Your order has shipped — Endless Horizon");
    expect(H.sent[0].html).toContain("DHL999");
    expect(H.sent[0].html).toContain("https://dhl.com/DHL999");
  });
  it("in-transit is REPEATABLE (no status) — two sends both go out", async () => {
    await sendInTransitEmail(makeOrder({ tracking_url: "https://x/y" }));
    await sendInTransitEmail(makeOrder({ tracking_url: "https://x/y" }));
    expect(H.sent).toHaveLength(2);
    expect(H.sent[0].subject).toBe("Your order is on the way");
  });
});
