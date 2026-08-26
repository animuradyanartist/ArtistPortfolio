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
import {
  listOrders, getOrder, setOrderStatus, setFulfilmentDetails,
  setExceptionState, setCustomerMessage, setInternalNotes,
  markOrderPaid, setPaymentSource, recordPaymentCheck, logOrderAudit, listOrderAudit,
} from "./orders";
import { releaseExpiredReservations, markSold } from "./reservation";
import { fulfilPrintOrder, canRetryPrintFulfilment } from "./prints/printFulfilmentService";
import { stripeMode, stripeClient } from "./stripeClient";
import {
  sendOrderConfirmation, sendShippedEmail, sendDeliveredEmail, sendPreparingEmail, sendManualUpdate,
  resendConfirmation, listOrderEmails, emailConfigured,
} from "../email";
import { ADMIN_SETTABLE, nextStatuses, isExceptionState, type OrderStatus, type ExceptionState } from "@shared/commerce/orderStatus";
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
        const snap = o.artwork_snapshot ? safeParse(o.artwork_snapshot) as { title?: string; image?: string } | null : null;
        return {
          id: o.id, reference: o.reference, status: o.status, paymentStatus: o.payment_status,
          buyerName: o.buyer_name, buyerEmail: o.buyer_email,
          artworkTitle: snap?.title ?? null,
          artworkImage: snap?.image ?? null,
          artworkId: o.artwork_id,
          country: o.ship_country,
          itemsFormatted: o.item_price_minor != null ? formatMoney(o.item_price_minor, c) : null,
          shippingFormatted: o.shipping_minor != null ? formatMoney(o.shipping_minor, c) : null,
          totalFormatted: o.total_minor != null ? formatMoney(o.total_minor, c) : null,
          carrier: o.shipping_carrier, tracking: o.tracking_number,
          exceptionState: o.exception_state,
          // ── item type + print fulfilment, so the list can badge PRINT and surface a paid-but-
          //    unfulfilled order at a glance. Null on original-artwork orders. ──
          itemType: o.item_type,
          fulfilmentProvider: o.fulfilment_provider,
          fulfilmentStatus: o.fulfilment_status,
          fulfilmentError: o.fulfilment_error,
          prodigiOrderId: o.prodigi_order_id,
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
        // ── print fulfilment, camelCase for the UI (the raw snake_case fields are also spread
        //    above). `itemSnapshot` is the parsed variant snapshot; for a print it carries
        //    material/size/frame/sku/quantity. `canRetryFulfilment` gates the retry button. ──
        isPrint: order.item_type === "print",
        fulfilmentProvider: order.fulfilment_provider,
        fulfilmentStatus: order.fulfilment_status,
        fulfilmentError: order.fulfilment_error,
        fulfilmentRetryCount: order.fulfilment_retry_count ?? 0,
        prodigiOrderId: order.prodigi_order_id,
        printVariantId: order.print_variant_id,
        canRetryFulfilment: canRetryPrintFulfilment(order),
        // Only the moves the state machine actually permits from here.
        availableStatuses: nextStatuses(order.status as OrderStatus).filter((s) => ADMIN_SETTABLE.includes(s)),
        // The email ledger for this order, and whether the mailer is configured at all.
        emails: await listOrderEmails(order.id),
        emailConfigured: emailConfigured(),
        // The audit trail (reconciliation actions), so Admin sees who moved payment and why.
        audit: await listOrderAudit(order.id),
      });
    } catch {
      res.status(500).json({ message: "Could not load this order." });
    }
  });

  app.post("/api/admin/orders/:id/status", requireAdminAuth, async (req, res) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      const to = String((req.body ?? {}).status ?? "") as OrderStatus;
      if (!ADMIN_SETTABLE.includes(to)) {
        return res.status(400).json({ message: "That is not a status this panel may set." });
      }
      const before = await getOrder(id);
      if (!before) return res.status(404).json({ message: "Not found" });
      const r = await setOrderStatus(id, to);
      if (!r.ok) return res.status(409).json({ message: r.reason ?? "Not allowed" });

      // LIFECYCLE EMAILS — only on a genuine transition into shipped/delivered (not on an
      // idempotent re-save), and only for a paid order. Each is once-only per order anyway, and
      // the send never throws, so a mail problem cannot fail this action.
      let email: { status: string; reason?: string } | null = null;
      if (to !== before.status && before.payment_status === "paid") {
        const fresh = await getOrder(id);
        if (fresh && to === "shipped") email = await sendShippedEmail(fresh);
        else if (fresh && to === "delivered") email = await sendDeliveredEmail(fresh);
      }
      res.json({ ok: true, email });
    } catch {
      res.status(500).json({ message: "Could not update this order." });
    }
  });

  // Carrier, tracking number, a clickable tracking link, and the two dates she can honestly
  // promise. All fields optional; an empty value clears the field.
  app.post("/api/admin/orders/:id/fulfilment", requireAdminAuth, async (req, res) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      const b = (req.body ?? {}) as Record<string, unknown>;
      await setFulfilmentDetails(id, {
        carrier: trimOrNull(b.carrier),
        trackingNumber: trimOrNull(b.trackingNumber),
        trackingUrl: trimUrlOrNull(b.trackingUrl),
        expectedDispatchAt: parseDateOrNull(b.expectedDispatch),
        estimatedDeliveryAt: parseDateOrNull(b.estimatedDelivery),
      });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Could not save fulfilment details." });
    }
  });

  // Raise or clear the non-status exception overlay (delayed / delivery_issue).
  app.post("/api/admin/orders/:id/exception", requireAdminAuth, async (req, res) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      const raw = (req.body ?? {}).state;
      let state: ExceptionState | null;
      if (raw == null || raw === "") state = null;
      else if (isExceptionState(raw)) state = raw;
      else return res.status(400).json({ message: "Unknown exception state." });
      await setExceptionState(id, state);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Could not update this order." });
    }
  });

  // The buyer-visible note shown on the tracking page (does NOT send an email by itself).
  app.post("/api/admin/orders/:id/customer-message", requireAdminAuth, async (req, res) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      await setCustomerMessage(id, trimLongOrNull((req.body ?? {}).message));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Could not save the update." });
    }
  });

  // Private admin note. Never leaves the server.
  app.post("/api/admin/orders/:id/internal-notes", requireAdminAuth, async (req, res) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      await setInternalNotes(id, trimLongOrNull((req.body ?? {}).notes));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Could not save the note." });
    }
  });

  // Send a buyer email on demand: resend confirmation, a preparing note, a delay note, or a
  // free-form message. Delay/manual messages are also stored as the tracking-page note so the
  // page and the email agree.
  app.post("/api/admin/orders/:id/email", requireAdminAuth, async (req, res) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      const order = await getOrder(id);
      if (!order) return res.status(404).json({ message: "Not found" });
      const b = (req.body ?? {}) as { kind?: string; subject?: string; message?: string };
      const kind = String(b.kind ?? "");
      const message = typeof b.message === "string" ? b.message.trim() : "";
      const subject = typeof b.subject === "string" ? b.subject.trim() : "";

      let result;
      switch (kind) {
        case "resend_confirmation": result = await resendConfirmation(order); break;
        case "preparing":           result = await sendPreparingEmail(order); break;
        case "delay":
        case "manual": {
          if (!message) return res.status(400).json({ message: "A message is required." });
          const subj = subject || (kind === "delay" ? `An update on your order ${order.reference}` : `A note about your order ${order.reference}`);
          await setCustomerMessage(id, message.slice(0, 2000)); // keep the tracking page in step
          result = await sendManualUpdate(order, { subject: subj, message, kind });
          break;
        }
        default: return res.status(400).json({ message: "Unknown email type." });
      }
      res.json({ ok: result.status !== "failed", result });
    } catch {
      res.status(500).json({ message: "Could not send the email." });
    }
  });

  // ── PAYMENT: read-only Stripe check ────────────────────────────────────────────────────
  // Query Stripe server-side for this order's real payment state, cache it, stamp the check
  // time. Marks NOTHING — it only lets Admin SEE Stripe's truth before deciding to reconcile.
  app.post("/api/admin/orders/:id/check-payment", requireAdminAuth, async (req, res) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      const order = await getOrder(id);
      if (!order) return res.status(404).json({ message: "Not found" });
      if (!order.stripe_checkout_session_id) {
        return res.json({ ok: true, stripePaymentStatus: null, note: "This order has no Stripe checkout session." });
      }
      const stripe = stripeClient();
      if (!stripe) return res.status(503).json({ message: "Stripe is not configured." });
      let session;
      try {
        session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id, { expand: ["payment_intent"] });
      } catch {
        return res.status(502).json({ message: "Could not reach Stripe to check this payment." });
      }
      const stripeStatus = session.payment_status ?? null;
      const pi = session.payment_intent;
      const piStatus = pi && typeof pi === "object" ? pi.status : null;
      await recordPaymentCheck(id, stripeStatus);
      return res.json({
        ok: true, stripePaymentStatus: stripeStatus, paymentIntentStatus: piStatus,
        orderPaymentStatus: order.payment_status,
      });
    } catch {
      return res.status(500).json({ message: "Could not check payment." });
    }
  });

  // ── PAYMENT: reconcile (EMERGENCY fallback for a failed webhook) ─────────────────────────
  //
  // Payment is Stripe's fact, so this NEVER trusts a button: it retrieves the Checkout Session
  // server-side, and only if Stripe itself says `paid` does it run the SAME idempotent flow the
  // webhook runs — markOrderPaid → markSold → exactly one confirmation email. The webhook code
  // is untouched; this simply reuses its helpers. markOrderPaid is atomic and once-only, so if
  // the webhook arrives before or after, exactly one of the two does the work; the email is
  // dedupe-guarded on top of that. An unpaid/failed Stripe payment can never be marked paid here.
  app.post("/api/admin/orders/:id/reconcile", requireAdminAuth, async (req, res) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      const order = await getOrder(id);
      if (!order) return res.status(404).json({ message: "Not found" });
      if (!order.stripe_checkout_session_id) {
        return res.status(409).json({ message: "This order has no Stripe checkout session to reconcile." });
      }
      const stripe = stripeClient();
      if (!stripe) return res.status(503).json({ message: "Stripe is not configured." });

      let session;
      try {
        session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id, { expand: ["payment_intent"] });
      } catch (e) {
        await logOrderAudit(id, "reconcile", "error", `Stripe retrieve failed: ${e instanceof Error ? e.message : "unknown"}`);
        return res.status(502).json({ message: "Could not reach Stripe to check this payment." });
      }

      const stripeStatus = session.payment_status ?? null; // 'paid' | 'unpaid' | 'no_payment_required'
      const pi = session.payment_intent;
      const piStatus = pi && typeof pi === "object" ? pi.status : null;
      const piId = pi && typeof pi === "object" ? pi.id : (typeof pi === "string" ? pi : null);
      await recordPaymentCheck(id, stripeStatus);

      // Guard: never mark an unpaid/failed Stripe payment as paid.
      if (stripeStatus !== "paid") {
        await logOrderAudit(id, "reconcile", "not-paid", `Stripe payment_status=${stripeStatus}${piStatus ? `, payment_intent=${piStatus}` : ""}`);
        return res.json({ ok: false, reason: "not-paid", stripePaymentStatus: stripeStatus, paymentIntentStatus: piStatus });
      }

      // The same once-only post-payment flow as the webhook.
      const wasFirst = await markOrderPaid(order.id, piId);
      let email: { status: string; reason?: string } | null = null;
      if (wasFirst) {
        if (order.artwork_id) await markSold(order.artwork_id, order.id); // also clears the reservation
        await setPaymentSource(order.id, "reconcile");
        const paidOrder = await getOrder(order.id);
        if (paidOrder) email = await sendOrderConfirmation(paidOrder); // dedupe-guarded → exactly one
      }
      await logOrderAudit(
        id, "reconcile", wasFirst ? "paid-by-reconcile" : "already-paid",
        wasFirst
          ? `Stripe confirmed paid; order marked paid, artwork sold, confirmation email: ${email?.status ?? "n/a"}.`
          : "Stripe confirms paid; order was already paid (webhook or a prior reconcile) — no change made.",
      );
      return res.json({ ok: true, wasFirst, stripePaymentStatus: "paid", paymentIntentStatus: piStatus, email });
    } catch {
      return res.status(500).json({ message: "Reconciliation failed." });
    }
  });

  // ── PRINT: retry fulfilment (for a paid-but-unfulfilled print order) ─────────────────────
  //
  // Reuses the SAME fulfilment service the webhook uses, which reuses the SAME stable idempotency
  // key — so a retry can only reconcile to the existing provider order, never create a second one.
  // Guarded to print orders that are paid and do NOT already carry a provider order id.
  app.post("/api/admin/orders/:id/retry-fulfilment", requireAdminAuth, async (req, res) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      const order = await getOrder(id);
      if (!order) return res.status(404).json({ message: "Not found" });
      if (!canRetryPrintFulfilment(order)) {
        return res.status(409).json({
          message:
            order.item_type !== "print" ? "This is not a print order."
            : order.payment_status !== "paid" ? "Only a paid order can be fulfilled."
            : "This order already has a provider order — retrying is disabled to avoid a duplicate.",
        });
      }
      const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol ?? "https";
      const base = process.env.PUBLIC_BASE_URL?.trim() || `${proto}://${req.get("host")}`;
      await fulfilPrintOrder(order, base);
      const fresh = await getOrder(id);
      await logOrderAudit(id, "retry-fulfilment", fresh?.fulfilment_status ?? "unknown",
        `Retry fulfilment invoked; fulfilment_status=${fresh?.fulfilment_status ?? "n/a"}, prodigi_order_id=${fresh?.prodigi_order_id ?? "none"}.`);
      return res.json({
        ok: true,
        fulfilmentStatus: fresh?.fulfilment_status ?? null,
        prodigiOrderId: fresh?.prodigi_order_id ?? null,
        fulfilmentError: fresh?.fulfilment_error ?? null,
      });
    } catch {
      return res.status(500).json({ message: "Could not retry fulfilment." });
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
function trimLongOrNull(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, 2000) : null;
}
/** Accept only http(s) links; anything else is cleared rather than stored. */
function trimUrlOrNull(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s.slice(0, 500) : null;
}
/** "YYYY-MM-DD" (or empty) → a Date at UTC midnight, or null to clear. Never throws. */
function parseDateOrNull(v: unknown): Date | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
