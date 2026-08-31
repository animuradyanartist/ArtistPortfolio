/**
 * PRINT CHECKOUT — the print branch of the ONE commerce checkout. It reuses the same orders
 * table, the same Stripe client and the same webhook as originals; only the item differs.
 *
 * THE PRICE IS THE SERVER'S. `resolveVariantPrice` (from the shared domain) is the only figure a
 * print checkout charges; nothing about price, availability or shipping is read from the client.
 * The client sends IDENTITY (which variant, how many) — the server supplies every FACT.
 *
 * Prints are made-to-order by the fulfilment provider, so there is NO reservation and NO
 * two-buyer race: unlike a unique original, a print has unlimited supply. That is why this path
 * never touches `reserveArtwork`.
 *
 * The pure builders below are unit-tested; the route just calls the database + Stripe around them.
 */

import {
  assessVariant,
  buildPrintItemSnapshot,
  resolveVariantPrice,
  type PrintVariantView,
  type PrintMasterView,
  type PrintItemSnapshot,
} from "@shared/commerce/printProduct";
import { MATERIAL_INFO, CATEGORY_LABEL, type PrintMaterial } from "@shared/commerce/prodigiProducts";
import type { InternalPrintOrder } from "../prodigi/printFulfilment";
import type { OrderRow } from "../orders";

export interface PrintSelectionInput {
  variantId: number;
  quantity: number;
}

export interface Validated<T> {
  ok: boolean;
  value?: T;
  errors?: Record<string, string>;
}

const MAX_PRINT_QTY = 10;

/** Validate the print selection the client sent — identity only, never price. */
export function validatePrintSelection(raw: unknown): Validated<PrintSelectionInput> {
  const body = (raw ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const variantId = Number(body.variantId);
  if (!Number.isInteger(variantId) || variantId <= 0) {
    errors.variantId = "A valid print option is required.";
  }

  let quantity = body.quantity == null ? 1 : Number(body.quantity);
  if (!Number.isFinite(quantity)) quantity = 1;
  quantity = Math.floor(quantity);
  if (quantity < 1) errors.quantity = "Quantity must be at least 1.";
  if (quantity > MAX_PRINT_QTY) errors.quantity = `Quantity may not exceed ${MAX_PRINT_QTY}.`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { variantId, quantity } };
}

export type PrintCheckoutRefusal =
  | { kind: "not-purchasable"; reason: string }
  | { kind: "unpriced"; reason: string };

export interface PrintCheckoutPlan {
  snapshot: PrintItemSnapshot;
  itemsMinor: number;
  /** Shipping is handled by the fulfilment provider; there is no separately-quoted print shipping yet. */
  shippingMinor: number;
  shippingBasis: string;
  totalMinor: number;
  currency: string;
  stripeLineItem: {
    name: string;
    description: string;
    unitAmountMinor: number;
    quantity: number;
    currency: string;
  };
}

export type PrintCheckoutResult =
  | { ok: true; plan: PrintCheckoutPlan }
  | { ok: false; refusal: PrintCheckoutRefusal };

function variantDescription(v: PrintVariantView): string {
  // Customer-facing wording only: category + size + stock label. No Prodigi/SKU/wrap terminology.
  const info = MATERIAL_INFO[v.material as PrintMaterial];
  const category = info ? CATEGORY_LABEL[info.category] : "Fine Art Print";
  const stock = info?.stockLabel ?? v.material;
  const parts = [category, `${v.widthCm}×${v.heightCm} cm`, stock];
  if (v.framed) parts.push(`Framed (${v.frameColour ?? "natural"})`);
  return parts.join(" · ");
}

/**
 * Build the print checkout plan from SERVER-RESOLVED rows. Refuses anything not purchasable or
 * unpriced — the same gate the storefront uses, applied again at the point of charging.
 */
export function planPrintCheckout(args: {
  print: { id: number; title: string; artworkId: number | null; images: string[] };
  variant: PrintVariantView;
  master: PrintMasterView | null;
  quantity: number;
}): PrintCheckoutResult {
  const { print, variant, master, quantity } = args;

  const assessment = assessVariant(variant, master);
  if (assessment.state !== "purchasable") {
    return {
      ok: false,
      refusal: { kind: "not-purchasable", reason: assessment.reason ?? "This print is not available to buy yet." },
    };
  }

  const itemsMinor = resolveVariantPrice(variant, quantity);
  if (itemsMinor == null) {
    return { ok: false, refusal: { kind: "unpriced", reason: "This print has no own-site price." } };
  }

  const snapshot = buildPrintItemSnapshot({
    print,
    variant,
    master,
    quantity,
    image: print.images[0] ?? (variant.mockups && variant.mockups[0]) ?? null,
  });

  // Print delivery is fulfilled and shipped by the provider; until the provider's live shipping
  // quote is wired (needs the API + a real master), no separate print-shipping line is charged.
  const shippingMinor = 0;
  const shippingBasis = "print-fulfilment (provider ships; no separate shipping charged yet)";

  return {
    ok: true,
    plan: {
      snapshot,
      itemsMinor,
      shippingMinor,
      shippingBasis,
      totalMinor: itemsMinor + shippingMinor,
      currency: variant.currency,
      stripeLineItem: {
        name: `${print.title} — Fine-Art Print`,
        description: variantDescription(variant),
        unitAmountMinor: variant.retailMinor!,
        quantity,
        currency: variant.currency,
      },
    },
  };
}

/**
 * Map a PAID print order row to the InternalPrintOrder the fulfilment helper consumes. Reads the
 * stored snapshot (the historical variant) and the buyer/ship fields on the order. Pure; the
 * webhook supplies the stable idempotency key and callback URL.
 */
export function printOrderToInternal(
  order: OrderRow,
  opts: { idempotencyKey: string; callbackUrl?: string },
): InternalPrintOrder | null {
  if (!order.artwork_snapshot) return null;
  let snap: PrintItemSnapshot;
  try {
    snap = JSON.parse(order.artwork_snapshot) as PrintItemSnapshot;
  } catch {
    return null;
  }
  if (snap.itemType !== "print" || !snap.prodigiSku || !snap.printReadyAssetUrl) return null;
  if (!order.ship_address1 || !order.ship_city || !order.ship_postal_code || !order.ship_country) return null;

  // Buyer/order-specific attributes only (frame colour from the purchase). The CATALOGUE-required
  // attributes — canvas `wrap` — are injected canonically by buildProdigiOrderRequest from the SKU
  // registry, so they reach Prodigi regardless of what this mapper carries. (See printFulfilment.ts.)
  const attributes: Record<string, string> = {};
  if (snap.framed && snap.frameColour) attributes.frameColour = snap.frameColour;

  return {
    reference: order.reference,
    idempotencyKey: opts.idempotencyKey,
    recipient: {
      name: order.buyer_name ?? "Customer",
      ...(order.buyer_email ? { email: order.buyer_email } : {}),
      ...(order.buyer_phone ? { phone: order.buyer_phone } : {}),
    },
    ship: {
      line1: order.ship_address1,
      ...(order.ship_address2 ? { line2: order.ship_address2 } : {}),
      city: order.ship_city,
      ...(order.ship_region ? { region: order.ship_region } : {}),
      postalCode: order.ship_postal_code,
      country: order.ship_country,
    },
    variant: {
      prodigiSku: snap.prodigiSku,
      printReadyAssetUrl: snap.printReadyAssetUrl,
      copies: snap.quantity,
      ...(Object.keys(attributes).length ? { attributes } : {}),
    },
    ...(opts.callbackUrl ? { callbackUrl: opts.callbackUrl } : {}),
  };
}
