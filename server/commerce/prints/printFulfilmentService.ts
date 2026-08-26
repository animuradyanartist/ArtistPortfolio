/**
 * PRINT FULFILMENT SERVICE — the ONE place that turns a PAID print order into a provider
 * fulfilment and records the outcome. Called from the verified-paid webhook and reused verbatim by
 * the admin retry action, so both share the SAME stable idempotency key and a retry can never
 * double-produce.
 *
 * Never throws: every failure is recorded on the order (`fulfilment_status = 'failed'` + an error)
 * and surfaced in admin. A paid order is never lost, and fulfilment bookkeeping never turns the
 * paid webhook into a 500.
 */

import { ensureFulfilmentIdempotencyKey, setPrintFulfilment, type OrderRow } from "../orders";
import { printOrderToInternal } from "./printCheckout";
import { createPrintFulfilment } from "../prodigi/printFulfilment";

export async function fulfilPrintOrder(order: OrderRow, baseUrl: string): Promise<void> {
  try {
    const idempotencyKey = await ensureFulfilmentIdempotencyKey(order.id, order.reference);
    const token = process.env.PRODIGI_WEBHOOK_TOKEN?.trim();
    const callbackUrl = token
      ? `${baseUrl.replace(/\/+$/, "")}/api/commerce/prodigi/callback/${encodeURIComponent(token)}`
      : undefined;

    const internal = printOrderToInternal(order, { idempotencyKey, callbackUrl });
    if (!internal) {
      await setPrintFulfilment(order.id, {
        provider: "prodigi",
        fulfilmentStatus: "failed",
        idempotencyKey,
        error: "Could not build the fulfilment request (missing snapshot, shipping address or a print-ready asset).",
      });
      return;
    }

    const outcome = await createPrintFulfilment(internal);
    // An unconfigured provider is not a failure — the paid order simply waits, visibly, in admin.
    const fulfilmentStatus =
      outcome.state === "pending_unconfigured" ? "config_missing" : outcome.fulfilmentStatus;

    await setPrintFulfilment(order.id, {
      provider: "prodigi",
      prodigiOrderId: outcome.prodigiOrderId,
      fulfilmentStatus,
      idempotencyKey,
      error: outcome.error,
      carrier: outcome.tracking?.carrier ?? null,
      trackingNumber: outcome.tracking?.number ?? null,
      trackingUrl: outcome.tracking?.url ?? null,
      incrementRetry: false,
    });
  } catch (e) {
    try {
      await setPrintFulfilment(order.id, {
        provider: "prodigi",
        fulfilmentStatus: "failed",
        error: e instanceof Error ? `${e.name}: ${e.message}` : "Unknown fulfilment error",
      });
    } catch {
      // Fulfilment bookkeeping must never be the thing that fails the paid webhook.
    }
  }
}

/**
 * May this print order be (re)fulfilled? Only a PAID print order that does NOT already carry a
 * provider order id — so the admin retry can never create a second Prodigi order over an existing
 * one. (A failed attempt never stored a `prodigi_order_id`, so it is retryable; a created one is not.)
 */
export function canRetryPrintFulfilment(order: OrderRow): boolean {
  return order.item_type === "print" && order.payment_status === "paid" && order.prodigi_order_id == null;
}

export type PaidAction = "fulfil-print" | "mark-sold" | "none";

/**
 * The ONE decision the verified-paid webhook makes about a freshly-paid order. A PRINT order is
 * fulfilled by the provider and its source painting is NEVER marked sold (the original stays for
 * sale); an ORIGINAL order marks its artwork sold; anything else (e.g. the $1 test item, which has
 * no artwork) does neither. Pure, so the invariant is unit-tested away from the DB.
 */
export function paidActionFor(order: Pick<OrderRow, "item_type" | "artwork_id">): PaidAction {
  if (order.item_type === "print") return "fulfil-print";
  if (order.item_type === "artwork" && order.artwork_id != null) return "mark-sold";
  return "none";
}
