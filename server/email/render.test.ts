import { describe, it, expect } from "vitest";
import type { OrderRow } from "../commerce/orders";
import {
  toModel, buildConfirmationEmail, buildShippedEmail, buildDeliveredEmail, buildUpdateEmail,
} from "./render";

const BASE = "https://animuradyan.com";
const TRACK = "https://animuradyan.com/track/tok_secret";

function makeOrder(o: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 1, reference: "AM-2026-0007", status: "paid", payment_status: "paid",
    buyer_name: "Sargsyan Armen", buyer_email: "buyer@example.com", buyer_phone: null,
    ship_country: "France", ship_address1: "1 Rue de la Paix", ship_address2: null,
    ship_city: "Paris", ship_region: null, ship_postal_code: "75001",
    item_type: "artwork", artwork_id: 18,
    artwork_snapshot: JSON.stringify({ id: 18, title: "Endless Horizon", dimensions: "80×100 cm", medium: "Oil on canvas", year: 2025, image: "/img/artwork/18/0" }),
    item_price_minor: 242000, currency: "EUR", shipping_minor: 8000, total_minor: 250000,
    shipping_basis: null, shipping_calculation: null,
    stripe_checkout_session_id: "cs_test_1", stripe_payment_intent_id: "pi_1",
    reserved_at: null, reservation_expires_at: null, paid_at: new Date("2026-09-01T10:00:00Z"),
    shipping_carrier: null, tracking_number: null, tracking_url: null,
    packed_at: null, shipped_at: null, delivered_at: null,
    expected_dispatch_at: null, estimated_delivery_at: null,
    exception_state: null, customer_message: null, internal_notes: null,
    tracking_token: "tok_secret", attribution: null,
    created_at: new Date("2026-09-01T09:00:00Z"), updated_at: new Date("2026-09-01T09:00:00Z"),
    ...o,
  } as OrderRow;
}

describe("confirmation email", () => {
  const e = buildConfirmationEmail(toModel(makeOrder(), BASE, TRACK));
  it("greets the buyer by first name", () => {
    expect(e.html).toContain("Armen");
    expect(e.text).toContain("Armen");
  });
  it("carries the reference and the total paid", () => {
    expect(e.html).toContain("AM-2026-0007");
    expect(e.html).toContain("2,500.00"); // €250000 minor
  });
  it("links to the secure tracking page", () => {
    expect(e.html).toContain(TRACK);
    expect(e.text).toContain(TRACK);
  });
  it("states the payment is confirmed", () => {
    expect(e.html.toLowerCase()).toContain("confirmed");
  });
  it("embeds an ABSOLUTE artwork image (mail clients cannot resolve /img)", () => {
    expect(e.html).toContain("https://animuradyan.com/img/artwork/18/0");
  });
  it("does NOT fabricate a dispatch date when none is known", () => {
    expect(e.html).not.toMatch(/dispatch[^<]*around/i);
  });
  it("DOES state the dispatch window when one is set", () => {
    const withDate = buildConfirmationEmail(toModel(makeOrder({ expected_dispatch_at: new Date("2026-09-08T00:00:00Z") }), BASE, TRACK));
    expect(withDate.html).toMatch(/dispatch[^<]*around/i);
    expect(withDate.html).toContain("8 September 2026");
  });
  it("has both an HTML document and a non-trivial plain-text twin", () => {
    expect(e.html).toContain("<!doctype html>");
    expect(e.text.length).toBeGreaterThan(80);
  });
});

describe("shipped email", () => {
  const e = buildShippedEmail(toModel(makeOrder({
    status: "shipped", shipping_carrier: "FedEx", tracking_number: "FX123456789",
    tracking_url: "https://fedex.com/track/FX123456789",
    shipped_at: new Date("2026-09-05T00:00:00Z"), estimated_delivery_at: new Date("2026-09-12T00:00:00Z"),
  }), BASE, TRACK));
  it("names the carrier and tracking number, and links out", () => {
    expect(e.html).toContain("FedEx");
    expect(e.html).toContain("FX123456789");
    expect(e.html).toContain("https://fedex.com/track/FX123456789");
  });
  it("shows the estimated delivery date that was set", () => {
    expect(e.html).toContain("12 September 2026");
  });
  it("always carries a Track Order CTA", () => {
    expect(e.html).toContain(TRACK);
  });
});

describe("delivered email", () => {
  const e = buildDeliveredEmail(toModel(makeOrder({ status: "delivered", delivered_at: new Date("2026-09-12T00:00:00Z") }), BASE, TRACK));
  it("is a warm arrival confirmation inviting contact", () => {
    expect(e.html.toLowerCase()).toContain("arrived");
    expect(e.html.toLowerCase()).toContain("reply");
  });
});

describe("manual / delay update email", () => {
  const e = buildUpdateEmail(toModel(makeOrder(), BASE, TRACK), { subject: "A short delay", message: "Customs is a little slow this week.\n\nIt will move again shortly." });
  it("carries the written message and the subject", () => {
    expect(e.subject).toBe("A short delay");
    expect(e.html).toContain("Customs is a little slow this week.");
    expect(e.text).toContain("It will move again shortly.");
  });
  it("still has a Track Order CTA", () => {
    expect(e.html).toContain(TRACK);
  });
});
