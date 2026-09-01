/**
 * PRODIGI CALLBACK — Prodigi publishes no signature/HMAC, so the callback URL carries a SECRET
 * TOKEN (`?t=…`, from PRODIGI_WEBHOOK_TOKEN) and we reject anything without it. The payload itself
 * is treated as an untrusted HINT: the route re-`GET`s the order from Prodigi and applies THAT
 * state, never the posted body. The token is compared in constant time and never logged.
 *
 * Status application is IDEMPOTENT and never regresses: a duplicate or out-of-order callback that
 * would move a terminal state backwards is ignored, so retries can't corrupt an order.
 */

import { timingSafeEqual } from "node:crypto";
import { mapProdigiStatus, extractTracking, type FulfilmentTracking } from "./printFulfilment";
import type { ProdigiOrderResponse } from "./prodigiTypes";
import { canTransition, type OrderStatus } from "@shared/commerce/orderStatus";

/** Constant-time string compare that can't throw on length mismatch. */
export function tokensMatch(provided: string | undefined | null, expected: string | undefined | null): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** True only when the request's token matches PRODIGI_WEBHOOK_TOKEN. Read at call time. */
export function verifyCallbackToken(provided: string | undefined | null): boolean {
  return tokensMatch(provided, process.env.PRODIGI_WEBHOOK_TOKEN?.trim() ?? null);
}

/** The CloudEvents `subject` is the Prodigi order id (`ord_…`). Returns null if absent. */
export function parseCallbackOrderId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const subject = (body as { subject?: unknown }).subject;
  if (typeof subject === "string" && subject.startsWith("ord_")) return subject;
  // fall back to data.order.id if present
  const id = (body as any)?.data?.order?.id;
  return typeof id === "string" && id.startsWith("ord_") ? id : null;
}

/** Rank of a fulfilment status — higher is "more final". Used to refuse regressions. */
const RANK: Record<string, number> = {
  pending: 0,
  created: 1,
  inproduction: 2,
  shipped: 3,
  complete: 4,
  cancelled: 4,
  failed: 4,
};

/**
 * Given the order's CURRENT internal status and the status derived from a fresh Prodigi fetch,
 * decide whether to apply the new one. Never moves a terminal/forward state backwards, so duplicate
 * or reordered callbacks are safe.
 */
export function shouldApplyStatus(current: string | null | undefined, next: string): boolean {
  const c = current ? (RANK[current] ?? 0) : -1;
  const n = RANK[next] ?? 0;
  if (next === current) return false; // no-op, avoid churn
  return n > c;
}

export interface CallbackApplication {
  fulfilmentStatus: string;
  tracking: FulfilmentTracking | null;
  apply: boolean;
}

/**
 * Turn a freshly re-fetched Prodigi order into the update we should apply, honouring the no-regress
 * rule. `refetched` MUST come from a real GET (never the callback body).
 */
export function applyRefetchedOrder(
  currentStatus: string | null | undefined,
  refetched: ProdigiOrderResponse,
): CallbackApplication {
  const fulfilmentStatus = mapProdigiStatus(refetched);
  const tracking = extractTracking(refetched);
  return {
    fulfilmentStatus,
    tracking,
    apply: shouldApplyStatus(currentStatus, fulfilmentStatus),
  };
}

/**
 * THE PRODIGI → CUSTOMER LIFECYCLE MAP (print orders only). Prodigi is the source of truth for a
 * print's fulfilment, so a genuine forward Prodigi state drives the customer-facing `order.status`
 * and the matching once-only email — Ani never sets a print's status by hand.
 *
 * Uses ONLY the states our integration actually derives (mapProdigiStatus): created, inproduction,
 * shipped, complete, cancelled (+ pending/failed). We do NOT invent a Prodigi "packed" or
 * "in transit" state:
 *   • created      → the order is already "paid"/confirmed from the Stripe webhook → NO customer change
 *                    and NO email (the confirmation email was already sent on payment).
 *   • inproduction → "preparing" (In production) → send the preparing email.
 *   • shipped      → "shipped" (+ real Prodigi tracking) → send the shipped email.
 *   • complete     → Prodigi's order is fully dispatched/closed. It is NOT a delivery confirmation
 *                    (Prodigi does not confirm delivery), so it maps to "shipped", never "delivered".
 *   • cancelled/failed/pending → no automatic customer move (handled by refund/admin recovery).
 *
 * The move is gated to a genuine FORWARD transition from the current customer status via
 * `canTransition`, so a duplicate or out-of-order callback yields no change and no email.
 */
export interface CustomerLifecycleMove {
  /** The customer status to advance to, or null for no customer-visible change. */
  status: OrderStatus | null;
  /** The once-only lifecycle email to send, or null. */
  email: "preparing" | "shipped" | null;
}

export function customerLifecycleForFulfilment(
  currentCustomerStatus: string | null | undefined,
  fulfilmentStatus: string,
): CustomerLifecycleMove {
  const target: OrderStatus | null =
    fulfilmentStatus === "inproduction" ? "preparing"
    : (fulfilmentStatus === "shipped" || fulfilmentStatus === "complete") ? "shipped"
    : null;
  if (!target) return { status: null, email: null };
  const cur = (currentCustomerStatus ?? "") as OrderStatus;
  // Only move FORWARD (and never onto the same status) — no regressions, no churn.
  if (cur === target || !canTransition(cur, target)) return { status: null, email: null };
  return { status: target, email: target === "preparing" ? "preparing" : "shipped" };
}
