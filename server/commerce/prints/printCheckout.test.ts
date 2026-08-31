import { describe, it, expect } from "vitest";
import {
  validatePrintSelection,
  planPrintCheckout,
  printOrderToInternal,
} from "./printCheckout";
import { paidActionFor } from "./printFulfilmentService";
import type { PrintVariantView, PrintMasterView } from "@shared/commerce/printProduct";
import type { OrderRow } from "../orders";

const readyMaster: PrintMasterView = {
  status: "ready", widthPx: 6000, heightPx: 4000,
  printReadyAssetUrl: "https://cdn.example.com/master/1.tif", checksumMd5: "abc",
};

function variant(over: Partial<PrintVariantView> = {}): PrintVariantView {
  return {
    id: 7, printId: 10, material: "photo-rag", prodigiSku: "GLOBAL-HGE-A2", sizeLabel: "L",
    widthCm: 100, heightCm: 67, framed: false, frameColour: null, retailMinor: 12000, currency: "EUR",
    printReadyAssetUrl: null, mockups: ["m.jpg"], effectiveDpi: 300, eligible: true, enabled: true,
    prodigiVerified: false, ...over,
  };
}

const print = { id: 10, title: "Blue Hour", artworkId: 42, images: ["/img/artwork/42/0"] };

describe("validatePrintSelection — identity only, never price", () => {
  it("accepts a valid variant id + quantity, defaulting quantity to 1", () => {
    expect(validatePrintSelection({ variantId: 7 })).toEqual({ ok: true, value: { variantId: 7, quantity: 1 } });
    expect(validatePrintSelection({ variantId: 7, quantity: 3 }).value).toEqual({ variantId: 7, quantity: 3 });
  });
  it("rejects a missing/invalid variant id", () => {
    expect(validatePrintSelection({}).ok).toBe(false);
    expect(validatePrintSelection({ variantId: 0 }).ok).toBe(false);
    expect(validatePrintSelection({ variantId: -3 }).ok).toBe(false);
  });
  it("rejects an out-of-range quantity", () => {
    expect(validatePrintSelection({ variantId: 7, quantity: 0 }).ok).toBe(false);
    expect(validatePrintSelection({ variantId: 7, quantity: 99 }).ok).toBe(false);
  });
  it("ignores any price the client tries to send", () => {
    const r = validatePrintSelection({ variantId: 7, quantity: 2, priceMinor: 1 } as unknown);
    expect(r.value).toEqual({ variantId: 7, quantity: 2 });
  });
});

describe("planPrintCheckout — the server sets the price", () => {
  it("plans a valid purchasable variant, pricing by quantity", () => {
    const r = planPrintCheckout({ print, variant: variant(), master: readyMaster, quantity: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.itemsMinor).toBe(24000);
    expect(r.plan.totalMinor).toBe(24000); // no separate print shipping charged yet
    expect(r.plan.shippingMinor).toBe(0);
    expect(r.plan.currency).toBe("EUR");
    expect(r.plan.stripeLineItem.unitAmountMinor).toBe(12000);
    expect(r.plan.stripeLineItem.quantity).toBe(2);
    expect(r.plan.snapshot.itemType).toBe("print");
    expect(r.plan.snapshot.printVariantId).toBe(7);
    expect(r.plan.snapshot.printReadyAssetUrl).toBe(readyMaster.printReadyAssetUrl);
  });

  it("REFUSES a disabled variant (tampered/rerouted selection)", () => {
    const r = planPrintCheckout({ print, variant: variant({ enabled: false }), master: readyMaster, quantity: 1 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.kind).toBe("not-purchasable");
  });

  it("REFUSES when no master is ready (nothing is purchasable today)", () => {
    const r = planPrintCheckout({ print, variant: variant(), master: null, quantity: 1 });
    expect(r.ok).toBe(false);
  });

  it("REFUSES an unpriced variant", () => {
    const r = planPrintCheckout({ print, variant: variant({ retailMinor: null }), master: readyMaster, quantity: 1 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.kind).toBe("not-purchasable"); // provisional (unpriced) → not purchasable
  });

  it("REFUSES an unverified / non-launch Prodigi SKU (invented or 404'd)", () => {
    for (const sku of ["MADE-UP-SKU", "GLOBAL-PR-16X20", "GLOBAL-FAP-16X24"]) {
      const r = planPrintCheckout({ print, variant: variant({ prodigiSku: sku }), master: readyMaster, quantity: 1 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.refusal.kind).toBe("not-purchasable");
    }
  });
});

function order(over: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 100, reference: "AM-2026-0100", status: "paid", payment_status: "paid",
    buyer_name: "Jae Kim", buyer_email: "jae@example.com", buyer_phone: null,
    ship_country: "DE", ship_address1: "1 Straße", ship_address2: null, ship_city: "Berlin",
    ship_region: null, ship_postal_code: "10115",
    item_type: "print", artwork_id: 42,
    artwork_snapshot: JSON.stringify({
      itemType: "print", printId: 10, printVariantId: 7, artworkId: 42, title: "Blue Hour",
      material: "photo-rag", sizeLabel: "L", widthCm: 100, heightCm: 67, framed: true, frameColour: "black",
      prodigiSku: "GLOBAL-HGE-A2", printReadyAssetUrl: "https://cdn.example.com/master/1.tif",
      quantity: 2, unitPriceMinor: 12000, currency: "EUR", image: "/img/artwork/42/0",
    }),
    item_price_minor: 24000, currency: "EUR", shipping_minor: 0, total_minor: 24000,
    shipping_basis: null, shipping_calculation: null,
    stripe_checkout_session_id: "cs_1", stripe_payment_intent_id: "pi_1",
    reserved_at: null, reservation_expires_at: null, paid_at: new Date(),
    shipping_carrier: null, tracking_number: null, tracking_url: null,
    packed_at: null, shipped_at: null, delivered_at: null,
    expected_dispatch_at: null, estimated_delivery_at: null,
    exception_state: null, customer_message: null, internal_notes: null, tracking_token: null,
    payment_source: null, stripe_payment_status: null, last_payment_check_at: null, attribution: null,
    fulfilment_provider: "prodigi", print_variant_id: 7, prodigi_order_id: null,
    fulfilment_status: "pending", fulfilment_idempotency_key: null, fulfilment_error: null, fulfilment_retry_count: 0,
    created_at: new Date(), updated_at: new Date(),
    ...over,
  };
}

describe("printOrderToInternal — paid order → provider request", () => {
  it("maps a valid paid print order, carrying frame attributes + copies", () => {
    const internal = printOrderToInternal(order(), { idempotencyKey: "am-print-AM-2026-0100", callbackUrl: "https://x/cb/t" });
    expect(internal).not.toBeNull();
    expect(internal!.variant.prodigiSku).toBe("GLOBAL-HGE-A2");
    expect(internal!.variant.copies).toBe(2);
    expect(internal!.variant.attributes).toEqual({ frameColour: "black" });
    expect(internal!.ship.country).toBe("DE");
    expect(internal!.idempotencyKey).toBe("am-print-AM-2026-0100");
    expect(internal!.callbackUrl).toBe("https://x/cb/t");
  });

  it("returns null (unfulfillable) when the shipping address is incomplete", () => {
    expect(printOrderToInternal(order({ ship_address1: null }), { idempotencyKey: "k" })).toBeNull();
  });

  it("returns null when the snapshot has no print-ready asset", () => {
    const bad = order({ artwork_snapshot: JSON.stringify({ itemType: "print", prodigiSku: "X", printReadyAssetUrl: null }) });
    expect(printOrderToInternal(bad, { idempotencyKey: "k" })).toBeNull();
  });

  it("returns null for a non-print snapshot", () => {
    expect(printOrderToInternal(order({ artwork_snapshot: JSON.stringify({ itemType: "artwork" }) }), { idempotencyKey: "k" })).toBeNull();
  });

  it("(7) a CANVAS order carries the wrap attribute in the provider request (not just frame)", () => {
    const canvasOrder = order({
      artwork_snapshot: JSON.stringify({
        itemType: "print", printId: 10, printVariantId: 8, artworkId: 42, title: "Blue Hour",
        material: "stretched-canvas", sizeLabel: "16×20", widthCm: 40.6, heightCm: 50.8, framed: false, frameColour: null,
        prodigiSku: "GLOBAL-CAN-16X20", printReadyAssetUrl: "https://cdn.example.com/master/1.tif",
        quantity: 1, unitPriceMinor: 14000, currency: "EUR", image: "/img/artwork/42/0",
      }),
    });
    const internal = printOrderToInternal(canvasOrder, { idempotencyKey: "am-print-canvas" });
    expect(internal).not.toBeNull();
    // The catalogue wrap is included so Prodigi stretches + wraps the canvas correctly.
    expect(internal!.variant.attributes).toEqual({ wrap: "MirrorWrap" });
  });

  it("(7) a paper order still carries ONLY frame (no spurious wrap)", () => {
    const internal = printOrderToInternal(order(), { idempotencyKey: "k" });
    expect(internal!.variant.attributes).toEqual({ frameColour: "black" });
  });
});

describe("paidActionFor — the paid-webhook branch invariant", () => {
  it("(12) a PRINT order fulfils and NEVER marks the source painting sold (paper OR canvas)", () => {
    expect(paidActionFor({ item_type: "print", artwork_id: 42 })).toBe("fulfil-print");
    // Canvas is still a print — buying one must never mark the original artwork sold.
    expect(paidActionFor({ item_type: "print", artwork_id: 7 })).toBe("fulfil-print");
  });
  it("an ORIGINAL order marks its artwork sold", () => {
    expect(paidActionFor({ item_type: "artwork", artwork_id: 42 })).toBe("mark-sold");
  });
  it("the $1 test item (no artwork) does neither", () => {
    expect(paidActionFor({ item_type: "test", artwork_id: null })).toBe("none");
  });
});
