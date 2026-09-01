import { describe, it, expect } from "vitest";
import type { OrderRow } from "../commerce/orders";
import {
  toModel, buildConfirmationEmail, buildShippedEmail, buildDeliveredEmail, buildUpdateEmail,
  buildPackedEmail, buildInTransitEmail,
} from "./render";

// A PRINT order — base64 storefront image in the snapshot (the real production case), material + size.
function makePrintOrder(o: Partial<OrderRow> = {}): OrderRow {
  return makeOrder({
    item_type: "print", artwork_id: 42,
    artwork_snapshot: JSON.stringify({
      itemType: "print", title: "Blue Hour", material: "german-etching",
      sizeLabel: "16×20 in (40×50 cm)", widthCm: 40, heightCm: 50, quantity: 2,
      image: "data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73v/+BiOh/AAA=",
    }),
    ...o,
  });
}

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

describe("PRINT vs ORIGINAL confirmation — different subject + content", () => {
  const pe = buildConfirmationEmail(toModel(makePrintOrder(), BASE, TRACK));
  const oe = buildConfirmationEmail(toModel(makeOrder(), BASE, TRACK));

  it("print subject is 'Print order confirmed — {title}'; original is 'Order confirmed — {title}'", () => {
    expect(pe.subject).toBe("Print order confirmed — Blue Hour");
    expect(oe.subject).toBe("Order confirmed — Endless Horizon");
  });
  it("print clearly labels 'Fine Art Print' + Material (category) + Size + quantity", () => {
    expect(pe.html).toContain("Fine Art Print");
    expect(pe.html).toContain("Fine Art Paper");                 // german-etching → Fine Art Paper
    expect(pe.html).toContain("16×20 in (40×50 cm)");
    expect(pe.text).toContain("Material: Fine Art Paper");
    expect(pe.text).toContain("Size: 16×20 in (40×50 cm)");
    expect(pe.text).toContain("Quantity: 2");
  });
  it("print uses production copy, never the Yerevan-studio original wording", () => {
    expect(pe.html).toContain("being prepared for production");
    expect(pe.html).not.toContain("Yerevan studio");
    expect(pe.html).not.toContain("crated by hand");
  });
  it("print carries the approved copy: archival-materials line, next-steps, and a 'View order' button", () => {
    expect(pe.html).toContain("produced to order using archival materials and professional fine art printing standards");
    expect(pe.html).toContain("Your print will now move into production");
    expect(pe.html).toContain("As soon as it is dispatched, you'll receive another email with shipping and tracking details");
    expect(pe.html).toContain("View order");
    expect(pe.text).toContain("produced to order using archival materials");
  });
  it("print always shows Quantity (even 1) and drops the redundant 'Payment: Confirmed' row", () => {
    const q1 = buildConfirmationEmail(toModel(makePrintOrder({ artwork_snapshot: JSON.stringify({ itemType: "print", title: "Blue Hour", material: "stretched-canvas", sizeLabel: "A3", quantity: 1, image: "https://cdn/x.jpg" }) }), BASE, TRACK));
    expect(q1.text).toContain("Quantity: 1");
    expect(q1.html).toContain("Quantity");
    expect(q1.html).not.toContain(">Payment<");   // no "Payment: Confirmed" row on the print confirmation
  });
  it("original uses original-artwork copy and contains NO print-specific language", () => {
    expect(oe.html).toContain("original artwork is now reserved");
    expect(oe.html).toContain("Yerevan studio");
    expect(oe.html).not.toContain("Fine Art Print");
    expect(oe.html).not.toContain("Material");
  });
});

describe("email IMAGE — absolute public URL, never base64 / never raw <img> text", () => {
  const pe = buildConfirmationEmail(toModel(makePrintOrder(), BASE, TRACK));
  it("a base64 snapshot image is DROPPED for a compact public artwork URL", () => {
    expect(pe.html).toContain("https://animuradyan.com/img/artwork/42/0");
    expect(pe.html).not.toContain("data:image");     // the base64 data URI never reaches the email
    expect(pe.html).not.toMatch(/base64/i);
  });
  it("the image is a REAL <img> tag (not escaped text), and no escaped '&lt;img' appears", () => {
    expect(pe.html).toMatch(/<img src="https:\/\/animuradyan\.com\/img\/artwork\/42\/0"/);
    expect(pe.html).not.toContain("&lt;img");         // never renders '<img src="' as literal text
  });
  it("an already-absolute https image (e.g. a mockup) is used as-is", () => {
    const withMockup = buildConfirmationEmail(toModel(
      makePrintOrder({ artwork_snapshot: JSON.stringify({ itemType: "print", title: "Blue Hour", material: "stretched-canvas", sizeLabel: "A3", image: "https://cdn.prodigi.com/mockup/xyz.jpg" }) }),
      BASE, TRACK));
    expect(withMockup.html).toContain("https://cdn.prodigi.com/mockup/xyz.jpg");
  });
});

describe("packed email", () => {
  const pe = buildPackedEmail(toModel(makePrintOrder(), BASE, TRACK));
  const oe = buildPackedEmail(toModel(makeOrder(), BASE, TRACK));
  it("subject is 'Your order is packed' and says it's packed", () => {
    expect(pe.subject).toBe("Your order is packed");
    expect(pe.html.toLowerCase()).toContain("packed");
  });
  it("labels a print as a Fine Art Print; an original as Original artwork", () => {
    expect(pe.html).toContain("Fine Art Print");
    expect(oe.html).toContain("Original artwork");
  });
});

describe("in-transit email", () => {
  const e = buildInTransitEmail(toModel(makeOrder({ shipping_carrier: "FedEx", tracking_number: "TRK123", tracking_url: "https://track.fedex.com/TRK123" }), BASE, TRACK));
  it("subject is 'Your order is on the way' and includes carrier + tracking link", () => {
    expect(e.subject).toBe("Your order is on the way");
    expect(e.html).toContain("TRK123");
    expect(e.html).toContain("https://track.fedex.com/TRK123");
    expect(e.html).toContain(TRACK);
  });
});

describe("shipped email — tracking + print/original wording", () => {
  it("includes the tracking number, carrier and clickable link when present", () => {
    const e = buildShippedEmail(toModel(makeOrder({ shipping_carrier: "DHL", tracking_number: "DHL999", tracking_url: "https://dhl.com/DHL999" }), BASE, TRACK));
    expect(e.subject).toBe("Your order has shipped — Endless Horizon");
    expect(e.html).toContain("DHL999");
    expect(e.html).toContain("https://dhl.com/DHL999");
  });
  it("a print does NOT say 'left the studio'; an original does", () => {
    const pe = buildShippedEmail(toModel(makePrintOrder(), BASE, TRACK));
    const oe = buildShippedEmail(toModel(makeOrder(), BASE, TRACK));
    expect(pe.html).not.toContain("left the studio");
    expect(pe.html).toContain("produced");
    expect(oe.html).toContain("left the studio");
  });
});
