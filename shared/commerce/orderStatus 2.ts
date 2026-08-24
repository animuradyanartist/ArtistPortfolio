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
  paid:             ["preparing", "shipped", "refunded"],
  preparing:        ["shipped", "refunded"],
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

/** Statuses Admin may set by hand. Payment outcomes are excluded by construction. */
export const ADMIN_SETTABLE: readonly OrderStatus[] = ["preparing", "shipped", "delivered", "cancelled"];

export function isTerminal(s: OrderStatus): boolean {
  return (TRANSITIONS[s] ?? []).length === 0;
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  checkout_created: "Checkout started",
  paid: "Paid",
  preparing: "Preparing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};
