/**
 * THE ORDER STATE MACHINE, IN ONE PLACE.
 *
 * The brief says not to invent transitions casually, so they are enumerated rather than
 * implied by whichever route happens to write a status. Everything that changes an order's
 * status asks `canTransition` first, and Admin only offers the moves that pass.
 *
 * PAYMENT STATE IS NOT IN THIS MACHINE. Whether money arrived is Stripe's fact, recorded in
 * `paymentStatus` from a signature-verified webhook. Admin can move an order through
 * FULFILMENT; it cannot declare an order paid, because clicking a button in an admin panel
 * is not a payment.
 */

export const ORDER_STATUSES = [
  "pending",           // row exists, nothing sent to Stripe yet
  "checkout_created",  // Stripe session created, artwork reserved, awaiting payment
  "paid",              // webhook confirmed payment; artwork Sold
  "preparing",         // she is crating it
  "packed",            // crated and ready for the courier
  "shipped",
  "delivered",
  "cancelled",         // abandoned/expired checkout, or cancelled before payment
  "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["unpaid", "paid", "failed", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Allowed moves. Absent means forbidden.
 *
 * `paid → cancelled` is deliberately NOT here: money that arrived is refunded, not cancelled,
 * and collapsing the two would lose the fact that a card was charged.
 */
const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = Object.freeze({
  pending:          ["checkout_created", "cancelled"],
  checkout_created: ["paid", "cancelled"],
  paid:             ["preparing", "packed", "shipped", "refunded"],
  preparing:        ["packed", "shipped", "refunded"],
  packed:           ["shipped", "refunded"],
  shipped:          ["delivered", "refunded"],
  delivered:        ["refunded"],
  cancelled:        [],
  refunded:         [],
});

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true; // idempotent re-application is not a transition
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from] ?? [];
}

/** Statuses Admin may set by hand. Payment outcomes are excluded by construction.
 *  `refunded` is intentionally absent — a refund is a Stripe fact, applied by the webhook,
 *  not a button that moves money. */
export const ADMIN_SETTABLE: readonly OrderStatus[] = ["preparing", "packed", "shipped", "delivered", "cancelled"];

export function isTerminal(s: OrderStatus): boolean {
  return (TRANSITIONS[s] ?? []).length === 0;
}

/**
 * Whether Ani may set an order's fulfilment status BY HAND in Admin. Only ORIGINAL orders have a
 * manual lifecycle; a PRINT order is driven by Prodigi (its callback advances the status + emails),
 * so its status is read-only in Admin — she can never accidentally mark a print shipped while Prodigi
 * still says it is in production.
 */
export function adminMayManageStatus(itemType: string | null | undefined): boolean {
  return itemType !== "print";
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  checkout_created: "Checkout started",
  paid: "Paid",
  preparing: "Preparing",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/**
 * EXCEPTIONAL SITUATIONS THAT ARE NOT A STATUS.
 *
 * A delay or a delivery problem can happen at any point without changing where the order IS in
 * its journey, so they live in a separate nullable `exception_state` overlay rather than the
 * linear machine — raised and cleared freely, and shown to the buyer as a calm note, never as a
 * broken timeline. `payment failed` and `refunded`/`cancelled` are already represented (a
 * failed payment_status, and the terminal statuses), so they are not repeated here.
 */
export const EXCEPTION_STATES = ["delayed", "delivery_issue"] as const;
export type ExceptionState = (typeof EXCEPTION_STATES)[number];

export const EXCEPTION_STATE_LABEL: Record<ExceptionState, string> = {
  delayed: "Shipping delayed",
  delivery_issue: "Delivery issue",
};

export function isExceptionState(v: unknown): v is ExceptionState {
  return typeof v === "string" && (EXCEPTION_STATES as readonly string[]).includes(v);
}

/**
 * THE BUYER-FACING TIMELINE, derived from status — the one place that maps our internal
 * statuses onto the six steps a collector sees:
 *   Order confirmed → Preparing → Packed → Shipped → In transit → Delivered
 * "In transit" is not a stored status; it is the lived period between shipped and delivered.
 * Terminal/exception statuses (cancelled, refunded) are handled by the page, not this ladder.
 */
export const BUYER_TIMELINE_STEPS = [
  { key: "confirmed", label: "Order confirmed" },
  { key: "preparing", label: "Preparing artwork" },
  { key: "packed", label: "Packed" },
  { key: "shipped", label: "Shipped" },
  { key: "in_transit", label: "In transit" },
  { key: "delivered", label: "Delivered" },
] as const;
export type BuyerTimelineKey = (typeof BUYER_TIMELINE_STEPS)[number]["key"];

/** How far along the buyer timeline a given order status has reached (index into the steps). */
export function timelineReachedIndex(status: OrderStatus): number {
  switch (status) {
    case "pending":
    case "checkout_created": return -1;          // not yet confirmed
    case "paid":             return 0;           // Order confirmed
    case "preparing":        return 1;
    case "packed":           return 2;
    case "shipped":          return 4;           // shipped implies "in transit" is live
    case "delivered":        return 5;
    case "cancelled":
    case "refunded":         return -1;          // handled as an exceptional state by the UI
  }
}
