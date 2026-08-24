import { describe, it, expect } from "vitest";
import type { OrderRow } from "./orders";
import { publicOrderView, publicTrackingView } from "./orderView";

function makeOrder(o: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 1, reference: "AM-2026-0007", status: "shipped", payment_status: "paid",
    buyer_name: "Sargsyan Armen", buyer_email: "buyer@example.com", buyer_phone: "+374 00 000000",
    ship_country: "France", ship_address1: "1 Rue de la Paix", ship_address2: "Flat 3",
    ship_city: "Paris", ship_region: "Île-de-France", ship_postal_code: "75001",
    item_type: "artwork", artwork_id: 18,
    artwork_snapshot: JSON.stringify({ id: 18, title: "Endless Horizon", image: "/img/artwork/18/0" }),
    item_price_minor: 242000, currency: "EUR", shipping_minor: 8000, total_minor: 250000,
    shipping_basis: null, shipping_calculation: null,
    stripe_checkout_session_id: "cs_test_1", stripe_payment_intent_id: "pi_1",
    reserved_at: null, reservation_expires_at: null, paid_at: new Date("2026-09-01T10:00:00Z"),
    shipping_carrier: "FedEx", tracking_number: "FX1", tracking_url: "https://fedex.com/FX1",
    packed_at: new Date("2026-09-04T00:00:00Z"), shipped_at: new Date("2026-09-05T00:00:00Z"), delivered_at: null,
    expected_dispatch_at: null, estimated_delivery_at: new Date("2026-09-12T00:00:00Z"),
    exception_state: null, customer_message: "Collected by the courier this morning.",
    internal_notes: "PRIVATE: buyer haggled, watch shipping cost.",
    tracking_token: "tok_secret", attribution: null,
    created_at: new Date("2026-09-01T09:00:00Z"), updated_at: new Date("2026-09-05T00:00:00Z"),
    ...o,
  } as OrderRow;
}

describe("buyer-facing projection — privacy", () => {
  const view = publicTrackingView(makeOrder());
  const json = JSON.stringify(view);

  it("NEVER leaks the street address, postal code or region", () => {
    expect(json).not.toContain("1 Rue de la Paix");
    expect(json).not.toContain("Flat 3");
    expect(json).not.toContain("75001");
    expect(json).not.toContain("Île-de-France");
  });
  it("NEVER leaks buyer email or phone", () => {
    expect(json).not.toContain("buyer@example.com");
    expect(json).not.toContain("+374 00 000000");
  });
  it("NEVER leaks internal notes or Stripe ids", () => {
    expect(json).not.toContain("PRIVATE");
    expect(json).not.toContain("cs_test_1");
    expect(json).not.toContain("pi_1");
    expect(view).not.toHaveProperty("internal_notes");
    expect(view).not.toHaveProperty("stripe_payment_intent_id");
  });
  it("DOES include the coarse destination (city + country) and the shipment link", () => {
    expect(view.destination).toEqual({ city: "Paris", country: "France" });
    expect(view.trackingUrl).toBe("https://fedex.com/FX1");
    expect(view.carrier).toBe("FedEx");
  });
  it("gives the buyer their first name only, not the full name", () => {
    expect(view.buyerFirstName).toBe("Sargsyan"); // first token — greeting, not identity
  });
});

describe("buyer-facing projection — timeline & token gating", () => {
  it("builds the six-step timeline with shipped reached to in-transit", () => {
    const view = publicTrackingView(makeOrder());
    expect(view.timeline).toHaveLength(6);
    expect(view.timeline[0].state).toBe("done");       // confirmed
    expect(view.timeline[4].state).toBe("current");    // in_transit (shipped)
    expect(view.timeline[5].state).toBe("upcoming");   // delivered
  });
  it("withholds the tracking token unless the session was proven", () => {
    const order = makeOrder();
    expect(publicOrderView(order).trackingToken).toBeNull();
    expect(publicOrderView(order, { trackToken: "tok_secret" }).trackingToken).toBe("tok_secret");
  });
  it("surfaces the buyer-visible note but not as an internal field", () => {
    const view = publicTrackingView(makeOrder());
    expect(view.customerMessage).toBe("Collected by the courier this morning.");
  });
  it("reports a refunded order via phase, not the ladder", () => {
    const view = publicTrackingView(makeOrder({ status: "refunded", payment_status: "refunded" }));
    expect(view.phase).toBe("refunded");
  });
});
