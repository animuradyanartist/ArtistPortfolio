/**
 * The shape the buyer-facing endpoints return (server: `publicOrderView` / `publicTrackingView`).
 * Kept deliberately free of any field the server withholds — there is no street address, email,
 * phone, Stripe id or internal note here, by design.
 */
export interface TimelineStep {
  key: string;
  label: string;
  state: "done" | "current" | "upcoming";
  at: string | null; // ISO
}

export interface OrderArtwork {
  id?: number;
  title?: string;
  dimensions?: string;
  medium?: string;
  year?: number;
  image?: string; // e.g. /img/artwork/123/0
}

export interface OrderView {
  reference: string;
  status: string;
  statusLabel: string;
  paymentStatus: string;
  phase: "normal" | "cancelled" | "refunded" | "payment_failed";
  buyerFirstName: string | null;
  artwork: OrderArtwork | null;
  itemsFormatted: string | null;
  shippingFormatted: string | null;
  totalFormatted: string | null;
  currency: string;
  destination: { city: string | null; country: string | null };
  carrier: string | null;
  tracking: string | null;
  trackingUrl: string | null;
  packedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  expectedDispatchAt: string | null;
  estimatedDeliveryAt: string | null;
  customerMessage: string | null;
  exception: { state: string; label: string } | null;
  timeline: TimelineStep[];
  createdAt: string | null;
  trackingToken?: string | null; // only present on the success view, only when the session matched
}

/** "2 September 2026", or null. Never invents a date. */
export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

/** The formatted money string the API returns → minor units, for analytics only. */
export function minorFromFormatted(formatted: string | null): number {
  if (!formatted) return 0;
  const n = Number(formatted.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** What to say the buyer should expect next, given where the order is. Honest, never a date it can't know. */
export function nextUpdateHint(o: OrderView): string {
  if (o.phase === "refunded") return "This order has been refunded. The amount will return to your original payment method.";
  if (o.phase === "cancelled") return "This order was cancelled. If you didn't expect this, please get in touch.";
  if (o.phase === "payment_failed") return "Your payment didn't go through. No charge was made; you're welcome to try again.";
  if (o.exception?.state === "delayed") return "There's a short delay — see the note above. I'll email you as soon as it's moving again.";
  if (o.exception?.state === "delivery_issue") return "There's a delivery issue to resolve — see the note above. I'm on it.";
  switch (o.status) {
    case "paid":
      return o.expectedDispatchAt
        ? `I'll begin preparing your painting and expect to dispatch around ${formatDate(o.expectedDispatchAt)}.`
        : "I'll begin preparing your painting. You'll get an email with tracking the moment it's on its way.";
    case "preparing":
      return o.expectedDispatchAt
        ? `Your painting is being crated. I expect to dispatch it around ${formatDate(o.expectedDispatchAt)}.`
        : "Your painting is being crated by hand. Tracking will follow when it ships.";
    case "packed":
      return "Your painting is packed and ready for the courier. Tracking will follow at dispatch.";
    case "shipped":
      return o.estimatedDeliveryAt
        ? `It's on its way — estimated delivery around ${formatDate(o.estimatedDeliveryAt)}.`
        : "It's on its way. Delivery times vary by destination and customs.";
    case "delivered":
      return "Delivered. I hope it feels right the moment you unwrap it — reply to your confirmation email if anything is amiss.";
    default:
      return "You'll receive an email at each step from here to your door.";
  }
}
