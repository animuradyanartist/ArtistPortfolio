/**
 * THE BUYER-FACING PROJECTION OF AN ORDER — in one place, so the privacy rules can't drift.
 *
 * What a buyer may see and what they may NOT:
 *   • YES: their first name, the artwork, the amounts, the destination CITY + COUNTRY, the
 *     carrier + tracking + a clickable link, the dates that are actually known, the latest
 *     buyer-visible note, and the six-step timeline.
 *   • NO: the full street address, postal code, region, buyer email/phone, Stripe ids, and —
 *     above all — `internal_notes`, which are private to Admin and never leave the server.
 *
 * The success page is reached by the sequential reference and therefore shows only this core; a
 * durable `trackingToken` is handed back ONLY when the caller proves it just completed this
 * checkout (matching Stripe session id). The tracking page is reached by that unguessable token,
 * which is itself the proof — so it shows the same buyer-safe core, never more.
 */
import type { OrderRow } from "./orders";
import { formatMoney, type Currency } from "@shared/commerce/money";
import {
  ORDER_STATUS_LABEL, type OrderStatus, BUYER_TIMELINE_STEPS, timelineReachedIndex,
  EXCEPTION_STATE_LABEL, isExceptionState,
} from "@shared/commerce/orderStatus";

const iso = (d: Date | null): string | null => (d ? new Date(d).toISOString() : null);
const money = (minor: number | null, c: Currency): string | null => (minor != null ? formatMoney(minor, c) : null);

export interface TimelineStep { key: string; label: string; state: "done" | "current" | "upcoming"; at: string | null }

function buildTimeline(order: OrderRow): TimelineStep[] {
  const reached = timelineReachedIndex(order.status as OrderStatus);
  const stampFor: Record<string, Date | null> = {
    confirmed: order.paid_at,
    preparing: null,
    packed: order.packed_at,
    shipped: order.shipped_at,
    in_transit: order.shipped_at,
    delivered: order.delivered_at,
  };
  return BUYER_TIMELINE_STEPS.map((step, i) => ({
    key: step.key,
    label: step.label,
    state: reached < 0 ? "upcoming" : i < reached ? "done" : i === reached ? "current" : "upcoming",
    at: iso(stampFor[step.key] ?? null),
  }));
}

/** The top-level shape the buyer UI switches on. Exceptions overlay this without breaking it. */
function phaseOf(order: OrderRow): "normal" | "cancelled" | "refunded" | "payment_failed" {
  if (order.status === "refunded") return "refunded";
  if (order.status === "cancelled") return "cancelled";
  if (order.payment_status === "failed") return "payment_failed";
  return "normal";
}

function firstName(name: string | null): string | null {
  const t = (name ?? "").trim().split(/\s+/)[0];
  return t || null;
}

function coreView(order: OrderRow) {
  const c = (order.currency as Currency) || "EUR";
  const ex = order.exception_state;
  return {
    reference: order.reference,
    status: order.status,
    statusLabel: ORDER_STATUS_LABEL[order.status as OrderStatus] ?? order.status,
    paymentStatus: order.payment_status,
    phase: phaseOf(order),
    buyerFirstName: firstName(order.buyer_name),
    artwork: order.artwork_snapshot ? safeParse(order.artwork_snapshot) : null,
    itemsFormatted: money(order.item_price_minor, c),
    shippingFormatted: money(order.shipping_minor, c),
    totalFormatted: money(order.total_minor, c),
    currency: c,
    destination: { city: order.ship_city?.trim() || null, country: order.ship_country?.trim() || null },
    carrier: order.shipping_carrier,
    tracking: order.tracking_number,
    trackingUrl: order.tracking_url,
    packedAt: iso(order.packed_at),
    shippedAt: iso(order.shipped_at),
    deliveredAt: iso(order.delivered_at),
    expectedDispatchAt: iso(order.expected_dispatch_at),
    estimatedDeliveryAt: iso(order.estimated_delivery_at),
    customerMessage: order.customer_message,
    exception: isExceptionState(ex) ? { state: ex, label: EXCEPTION_STATE_LABEL[ex] } : null,
    timeline: buildTimeline(order),
    createdAt: iso(order.created_at),
  };
}

/** Success page (by reference). `trackToken` is included only when the session was proven. */
export function publicOrderView(order: OrderRow, opts: { trackToken?: string | null } = {}) {
  return { ...coreView(order), trackingToken: opts.trackToken ?? null };
}

/** Tracking page (by token — the token is the proof). Same buyer-safe core, nothing more. */
export function publicTrackingView(order: OrderRow) {
  return coreView(order);
}

function safeParse(s: string): unknown { try { return JSON.parse(s); } catch { return null; } }
