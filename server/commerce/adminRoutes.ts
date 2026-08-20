/**
 * ADMIN COMMERCE ROUTES.
 *
 * Every route here sits behind `requireAdminAuth`, the same guard the rest of the admin uses.
 * Nothing about that guard is weakened or worked around.
 *
 * WHAT ADMIN MAY NOT DO. There is no route below that sets `payment_status`, and that is
 * deliberate: whether money arrived is Stripe's fact, established by a signed webhook. An
 * admin panel that can mark an order paid is an admin panel that can be talked into it.
 */
import type { Express } from "express";
import { requireAdminAuth } from "../auth";
import { hasDatabase } from "../db";
import { listOrders, getOrder, setOrderStatus, setTracking } from "./orders";
import { releaseExpiredReservations } from "./reservation";
import { stripeMode } from "./stripeClient";
import { ADMIN_SETTABLE, nextStatuses, type OrderStatus } from "@shared/commerce/orderStatus";
import { formatMoney, type Currency } from "@shared/commerce/money";

export function registerAdminCommerceRoutes(app: Express): void {
  /** Whether payment is wired up, so Admin can say so instead of the owner guessing. */
  app.get("/api/admin/commerce/status", requireAdminAuth, async (_req, res) => {
    res.json({
      stripeMode: stripeMode(),
      databaseAvailable: hasDatabase,
      webhookSecretConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
    });
  });

  app.get("/api/admin/orders", requireAdminAuth, async (_req, res) => {
    try {
      const rows = await listOrders();
      res.json(rows.map((o) => {
        const c = (o.currency as Currency) ?? "EUR";
        const snap = o.artwork_snapshot ? safeParse(o.artwork_snapshot) : null;
        return {
          id: o.id, reference: o.reference, status: o.status, paymentStatus: o.payment_status,
          buyerName: o.buyer_name, buyerEmail: o.buyer_email,
          artworkTitle: (snap as { title?: string } | null)?.title ?? null,
          artworkId: o.artwork_id,
          country: o.ship_country,
          itemsFormatted: o.item_price_minor != null ? formatMoney(o.item_price_minor, c) : null,
          shippingFormatted: o.shipping_minor != null ? formatMoney(o.shipping_minor, c) : null,
          totalFormatted: o.total_minor != null ? formatMoney(o.total_minor, c) : null,
          createdAt: o.created_at,
        };
      }));
    } catch {
      res.status(500).json({ message: "Could not load orders." });
    }
  });

  app.get("/api/admin/orders/:id", requireAdminAuth, async (req, res) => {
    try {
      const order = await getOrder(Number.parseInt(String(req.params.id), 10));
      if (!order) return res.status(404).json({ message: "Not found" });
      const c = (order.currency as Currency) ?? "EUR";
      res.json({
        ...order,
        itemsFormatted: order.item_price_minor != null ? formatMoney(order.item_price_minor, c) : null,
        shippingFormatted: order.shipping_minor != null ? formatMoney(order.shipping_minor, c) : null,
        totalFormatted: order.total_minor != null ? formatMoney(order.total_minor, c) : null,
        artworkSnapshot: order.artwork_snapshot ? safeParse(order.artwork_snapshot) : null,
        shippingCalculation: order.shipping_calculation ? safeParse(order.shipping_calculation) : null,
        attribution: order.attribution ? safeParse(order.attribution) : null,
        // Only the moves the state machine actually permits from here.
        availableStatuses: nextStatuses(order.status as OrderStatus).filter((s) => ADMIN_SETTABLE.includes(s)),
      });
    } catch {
      res.status(500).json({ message: "Could not load this order." });
    }
  });

  app.post("/api/admin/orders/:id/status", requireAdminAuth, async (req, res) => {
    try {
      const to = String((req.body ?? {}).status ?? "") as OrderStatus;
      if (!ADMIN_SETTABLE.includes(to)) {
        return res.status(400).json({ message: "That is not a status this panel may set." });
      }
      const r = await setOrderStatus(Number.parseInt(String(req.params.id), 10), to);
      if (!r.ok) return res.status(409).json({ message: r.reason ?? "Not allowed" });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Could not update this order." });
    }
  });

  app.post("/api/admin/orders/:id/tracking", requireAdminAuth, async (req, res) => {
    try {
      const carrier = trimOrNull((req.body ?? {}).carrier);
      const tracking = trimOrNull((req.body ?? {}).trackingNumber);
      await setTracking(Number.parseInt(String(req.params.id), 10), carrier, tracking);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Could not save tracking." });
    }
  });

  /** Manual sweep, for when she wants a stuck hold released now rather than within a minute. */
  app.post("/api/admin/commerce/release-expired", requireAdminAuth, async (_req, res) => {
    res.json(await releaseExpiredReservations());
  });
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}
function trimOrNull(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, 120) : null;
}
