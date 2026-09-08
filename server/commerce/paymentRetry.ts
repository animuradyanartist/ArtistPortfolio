/**
 * PAYMENT RETRY — the pure core of "let the customer complete a payment that didn't go through".
 *
 * These functions decide and PLAN; they never touch Stripe, the database, or the network, so they
 * are unit-tested exhaustively and the thin route handler around them (in routes.ts) only does the
 * three impure things: (re)reserve the artwork, ask Stripe to create the session, and write the row.
 *
 * TWO RULES GOVERN EVERYTHING HERE:
 *   1. The payable amount is REBUILT AND VERIFIED FROM THE ORDER ROW — never the client, never a
 *      re-quote. `payableFromOrder` recomputes item + shipping from the stored, server-written
 *      fields and refuses if they do not reconcile to the stored total, so a corrupt row can never
 *      lead to charging a wrong amount.
 *   2. A retry can only ever be offered on an order whose money has NOT arrived. `canSendPaymentReminder`
 *      (the one shared gate) is checked first, so a `paid` or `refunded` order is refused outright.
 *
 * The planned session carries `metadata.orderId = order.id`, so when the customer pays, the EXISTING
 * webhook marks the SAME order paid. No new order is ever created; no second reservation is planned.
 */
import type Stripe from "stripe";
import type { OrderRow } from "./orders";
import { canSendPaymentReminder } from "@shared/commerce/orderStatus";

export type RetryRefusal =
  | { kind: "closed" }          // paid or refunded — money is/was present, never retry
  | { kind: "no-amount" }       // the order is missing the amounts needed to charge
  | { kind: "amount-mismatch" }; // item + shipping does not reconcile to the stored total

export interface RetryPayable {
  currency: string;
  /** The item subtotal actually charged (full price minus the snapshotted promo discount). */
  itemMinor: number;
  /** The shipping line (0 when it was absorbed or absent). */
  shippingMinor: number;
  /** === itemMinor + shippingMinor === order.total_minor (verified). */
  totalMinor: number;
  itemName: string;
  itemDescription: string | null;
  /** true → this is an ORIGINAL and a reservation must be (re)taken at retry-click time. A print
   *  has unlimited supply and is never reserved. */
  isOriginal: boolean;
  artworkId: number | null;
}

function safeJson(s: string | null): { title?: string } | null {
  if (!s) return null;
  try { return JSON.parse(s) as { title?: string }; } catch { return null; }
}

/**
 * Rebuild the payable amount ENTIRELY from the order row and verify it reconciles.
 *
 * `total_minor` was written at checkout as `(item_price_minor − promo_discount) + shipping_minor`.
 * We recompute that here from the stored parts and refuse unless it equals the stored total — the
 * row must be able to explain its own total before we ever ask Stripe to charge it.
 */
export function payableFromOrder(order: OrderRow): { ok: true; payable: RetryPayable } | { ok: false; refusal: RetryRefusal } {
  // Gate first: a paid/refunded order can never be retried.
  if (!canSendPaymentReminder(order.payment_status)) return { ok: false, refusal: { kind: "closed" } };

  const total = order.total_minor;
  const item = order.item_price_minor;
  if (total == null || item == null || total <= 0) return { ok: false, refusal: { kind: "no-amount" } };

  const discount = order.promo_discount_minor ?? 0;
  const itemMinor = item - discount;                 // the discounted item subtotal actually charged
  const shippingMinor = order.shipping_minor ?? 0;
  if (itemMinor < 0 || shippingMinor < 0) return { ok: false, refusal: { kind: "amount-mismatch" } };
  // The whole verification, in one line: the parts must add up to the stored total.
  if (itemMinor + shippingMinor !== total) return { ok: false, refusal: { kind: "amount-mismatch" } };

  const isPrint = order.item_type === "print";
  const title = safeJson(order.artwork_snapshot)?.title?.trim() || null;
  return {
    ok: true,
    payable: {
      currency: (order.currency || "EUR"),
      itemMinor,
      shippingMinor,
      totalMinor: total,
      itemName: title ?? (isPrint ? "Fine art print" : "Original artwork"),
      itemDescription: `Order ${order.reference}`,
      // An ORIGINAL is an artwork order that holds a reservation; a print (unlimited supply) never does,
      // even though a print row also carries artwork_id (its source painting).
      isOriginal: !isPrint && order.artwork_id != null,
      artworkId: order.artwork_id ?? null,
    },
  };
}

/**
 * Plan the Stripe Checkout Session for a retry — bound to the SAME order.
 *
 * `metadata.orderId` is the link the webhook trusts; it is the existing order's id, so paying this
 * session marks THIS order paid and creates no new order. `expires_at` is set only for an original
 * (to match the reservation window); a print carries no reservation and keeps Stripe's default.
 */
export function planRetrySession(
  order: OrderRow,
  payable: RetryPayable,
  opts: { baseUrl: string; reservationMinutes?: number; now?: Date },
): Stripe.Checkout.SessionCreateParams {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const cur = payable.currency.toLowerCase();
  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      quantity: 1,
      price_data: {
        currency: cur,
        unit_amount: payable.itemMinor,
        product_data: {
          name: payable.itemName,
          ...(payable.itemDescription ? { description: payable.itemDescription } : {}),
        },
      },
    },
  ];
  if (payable.shippingMinor > 0) {
    line_items.push({
      quantity: 1,
      price_data: { currency: cur, unit_amount: payable.shippingMinor, product_data: { name: "Shipping" } },
    });
  }

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    ...(order.buyer_email ? { customer_email: order.buyer_email } : {}),
    client_reference_id: order.reference,
    // The link back to OUR row. The webhook trusts THIS, never the amounts. Same order id → no dupe.
    metadata: {
      orderId: String(order.id),
      reference: order.reference,
      retry: "1",
      ...(order.artwork_id != null ? { artworkId: String(order.artwork_id) } : {}),
      ...(order.item_type === "print"
        ? { itemType: "print", ...(order.print_variant_id != null ? { printVariantId: String(order.print_variant_id) } : {}) }
        : {}),
    },
    line_items,
    success_url: `${base}/order/${encodeURIComponent(order.reference)}?session_id={CHECKOUT_SESSION_ID}`,
    // Reuse the existing cancel route, which releases the hold (unpaid only) and lands the buyer sensibly.
    cancel_url: `${base}/api/commerce/checkout/cancel?ref=${encodeURIComponent(order.reference)}&session_id={CHECKOUT_SESSION_ID}`,
  };
  if (opts.reservationMinutes != null) {
    const now = (opts.now ?? new Date()).getTime();
    params.expires_at = Math.floor(now / 1000) + opts.reservationMinutes * 60;
  }
  return params;
}

/**
 * Has a payment reminder already been SENT for this order within the window? Prevents accidental
 * double-reminders, read purely from the existing `order_emails` ledger — no schema change.
 */
export interface ReminderLedgerRow { kind: string; status: string; created_at: string | Date }
export function reminderRecentlySent(emails: readonly ReminderLedgerRow[], now: Date, minutes = 15): boolean {
  const cutoff = now.getTime() - minutes * 60_000;
  return emails.some(
    (e) => e.kind === "payment_reminder" && e.status === "sent" && new Date(e.created_at).getTime() >= cutoff,
  );
}
