/**
 * ORDER PERSISTENCE.
 *
 * Raw SQL rather than Drizzle's query builder for the same reason `reservation.ts` is: these
 * statements run against a table created by the boot self-heal, on a database that may never
 * have seen a migration, and the guards that make them safe (conditional WHEREs, the ON
 * CONFLICT below) are clearer written out than assembled.
 */
import crypto from "node:crypto";
import { pool, hasDatabase } from "../db";
import type { OrderStatus, PaymentStatus, ExceptionState } from "@shared/commerce/orderStatus";
import { canTransition } from "@shared/commerce/orderStatus";

export interface OrderRow {
  id: number; reference: string; status: OrderStatus; payment_status: PaymentStatus;
  buyer_name: string | null; buyer_email: string | null; buyer_phone: string | null;
  ship_country: string | null; ship_address1: string | null; ship_address2: string | null;
  ship_city: string | null; ship_region: string | null; ship_postal_code: string | null;
  item_type: string; artwork_id: number | null; artwork_snapshot: string | null;
  item_price_minor: number | null; currency: string; shipping_minor: number | null;
  total_minor: number | null; shipping_basis: string | null; shipping_calculation: string | null;
  stripe_checkout_session_id: string | null; stripe_payment_intent_id: string | null;
  reserved_at: Date | null; reservation_expires_at: Date | null; paid_at: Date | null;
  shipping_carrier: string | null; tracking_number: string | null; tracking_url: string | null;
  packed_at: Date | null; shipped_at: Date | null; delivered_at: Date | null;
  expected_dispatch_at: Date | null; estimated_delivery_at: Date | null;
  exception_state: string | null; customer_message: string | null; internal_notes: string | null;
  tracking_token: string | null;
  payment_source: string | null; stripe_payment_status: string | null; last_payment_check_at: Date | null;
  attribution: string | null;
  // ── print fulfilment (Prodigi). Null on original-artwork orders. ──
  fulfilment_provider: string | null; print_variant_id: number | null; prodigi_order_id: string | null;
  fulfilment_status: string | null; fulfilment_idempotency_key: string | null;
  fulfilment_error: string | null; fulfilment_retry_count: number | null;
  created_at: Date; updated_at: Date;
}

/**
 * Persist the outcome of a print fulfilment attempt onto the order. Called only from the paid
 * webhook path (and the admin retry, which reuses the same idempotency key). Pure DB write; the
 * decision of WHAT to write is made by `createPrintFulfilment`.
 */
export async function setPrintFulfilment(
  id: number,
  patch: {
    provider?: string | null;
    prodigiOrderId?: string | null;
    fulfilmentStatus?: string | null;
    idempotencyKey?: string | null;
    error?: string | null;
    carrier?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
    incrementRetry?: boolean;
  },
): Promise<void> {
  await pool.query(
    `UPDATE orders SET
        fulfilment_provider = COALESCE($2, fulfilment_provider),
        prodigi_order_id = COALESCE($3, prodigi_order_id),
        fulfilment_status = COALESCE($4, fulfilment_status),
        fulfilment_idempotency_key = COALESCE($5, fulfilment_idempotency_key),
        fulfilment_error = $6,
        shipping_carrier = COALESCE($7, shipping_carrier),
        tracking_number = COALESCE($8, tracking_number),
        tracking_url = COALESCE($9, tracking_url),
        fulfilment_retry_count = fulfilment_retry_count + $10,
        updated_at = now()
      WHERE id = $1`,
    [
      id,
      patch.provider ?? null,
      patch.prodigiOrderId ?? null,
      patch.fulfilmentStatus ?? null,
      patch.idempotencyKey ?? null,
      patch.error ?? null,
      patch.carrier ?? null,
      patch.trackingNumber ?? null,
      patch.trackingUrl ?? null,
      patch.incrementRetry ? 1 : 0,
    ],
  );
}

/** Ensure a stable fulfilment idempotency key exists for a print order; returns it. */
export async function ensureFulfilmentIdempotencyKey(id: number, reference: string): Promise<string> {
  const existing = await pool.query(
    `SELECT fulfilment_idempotency_key AS k FROM orders WHERE id = $1`, [id],
  );
  const current = existing.rows[0]?.k as string | null | undefined;
  if (current) return current;
  const key = `am-print-${reference}`;
  await pool.query(
    `UPDATE orders SET fulfilment_idempotency_key = $2, updated_at = now()
       WHERE id = $1 AND fulfilment_idempotency_key IS NULL`,
    [id, key],
  );
  return key;
}

/**
 * A reference a person can read down a phone line.
 *
 * The sequence is per-year and derived from the table itself rather than from a counter that
 * could drift. Collisions are impossible in practice and prevented absolutely by the unique
 * index — a retry simply picks the next number.
 */
export async function nextReference(now: Date = new Date()): Promise<string> {
  const year = now.getUTCFullYear();
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM orders WHERE reference LIKE $1`, [`AM-${year}-%`],
  );
  const n = (rows[0]?.n ?? 0) + 1;
  return `AM-${year}-${String(n).padStart(4, "0")}`;
}

export async function createOrder(fields: Partial<OrderRow> & { reference: string }): Promise<OrderRow> {
  const cols = Object.keys(fields);
  const vals = Object.values(fields);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await pool.query(
    `INSERT INTO orders (${cols.join(", ")}) VALUES (${placeholders}) RETURNING *`, vals,
  );
  return rows[0] as OrderRow;
}

export async function getOrder(id: number): Promise<OrderRow | null> {
  if (!hasDatabase) return null;
  const { rows } = await pool.query(`SELECT * FROM orders WHERE id = $1`, [id]);
  return (rows[0] as OrderRow) ?? null;
}

export async function getOrderByReference(reference: string): Promise<OrderRow | null> {
  if (!hasDatabase) return null;
  const { rows } = await pool.query(`SELECT * FROM orders WHERE reference = $1`, [reference]);
  return (rows[0] as OrderRow) ?? null;
}

export async function getOrderBySession(sessionId: string): Promise<OrderRow | null> {
  if (!hasDatabase) return null;
  const { rows } = await pool.query(
    `SELECT * FROM orders WHERE stripe_checkout_session_id = $1`, [sessionId],
  );
  return (rows[0] as OrderRow) ?? null;
}

export async function getOrderByProdigiOrderId(prodigiOrderId: string): Promise<OrderRow | null> {
  const { rows } = await pool.query(
    `SELECT * FROM orders WHERE prodigi_order_id = $1 LIMIT 1`, [prodigiOrderId],
  );
  return (rows[0] as OrderRow) ?? null;
}

export async function getOrderByPaymentIntent(paymentIntentId: string): Promise<OrderRow | null> {
  if (!hasDatabase || !paymentIntentId) return null;
  const { rows } = await pool.query(
    `SELECT * FROM orders WHERE stripe_payment_intent_id = $1`, [paymentIntentId],
  );
  return (rows[0] as OrderRow) ?? null;
}

export async function listOrders(limit = 200): Promise<OrderRow[]> {
  if (!hasDatabase) return [];
  const { rows } = await pool.query(
    `SELECT * FROM orders ORDER BY created_at DESC LIMIT $1`, [limit],
  );
  return rows as OrderRow[];
}

/**
 * Move an order's FULFILMENT status, refusing any move the state machine forbids.
 *
 * Payment status is not settable here — it is written only by `markOrderPaid`, from a
 * verified webhook.
 */
export async function setOrderStatus(id: number, to: OrderStatus): Promise<{ ok: boolean; reason?: string }> {
  const order = await getOrder(id);
  if (!order) return { ok: false, reason: "not-found" };
  if (!canTransition(order.status, to)) {
    return { ok: false, reason: `cannot move an order from ${order.status} to ${to}` };
  }
  const stamps: string[] = [];
  if (to === "packed") stamps.push("packed_at = coalesce(packed_at, now())");
  if (to === "shipped") stamps.push("shipped_at = coalesce(shipped_at, now())");
  if (to === "delivered") stamps.push("delivered_at = coalesce(delivered_at, now())");
  await pool.query(
    `UPDATE orders SET status = $2, updated_at = now()${stamps.length ? ", " + stamps.join(", ") : ""}
      WHERE id = $1`, [id, to],
  );
  return { ok: true };
}

export async function setTracking(id: number, carrier: string | null, tracking: string | null): Promise<void> {
  await pool.query(
    `UPDATE orders SET shipping_carrier = $2, tracking_number = $3, updated_at = now() WHERE id = $1`,
    [id, carrier, tracking],
  );
}

/**
 * The fuller fulfilment record Admin edits: carrier, tracking number + a clickable link, and
 * the two dates she can honestly promise. `undefined` leaves a field untouched; an explicit
 * `null` clears it. Never touches status or payment.
 */
export interface FulfilmentPatch {
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  expectedDispatchAt?: Date | null;
  estimatedDeliveryAt?: Date | null;
}
export async function setFulfilmentDetails(id: number, patch: FulfilmentPatch): Promise<void> {
  const map: Record<string, keyof FulfilmentPatch> = {
    shipping_carrier: "carrier",
    tracking_number: "trackingNumber",
    tracking_url: "trackingUrl",
    expected_dispatch_at: "expectedDispatchAt",
    estimated_delivery_at: "estimatedDeliveryAt",
  };
  const sets: string[] = [];
  const vals: unknown[] = [id];
  for (const [col, key] of Object.entries(map)) {
    if (patch[key] !== undefined) { vals.push(patch[key]); sets.push(`${col} = $${vals.length}`); }
  }
  if (!sets.length) return;
  await pool.query(`UPDATE orders SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`, vals);
}

/** Raise or clear the non-status exception overlay (delayed / delivery_issue / null). */
export async function setExceptionState(id: number, state: ExceptionState | null): Promise<void> {
  await pool.query(
    `UPDATE orders SET exception_state = $2, updated_at = now() WHERE id = $1`, [id, state],
  );
}

/** The latest buyer-visible note. Shown on the tracking page; may accompany a manual email. */
export async function setCustomerMessage(id: number, message: string | null): Promise<void> {
  await pool.query(
    `UPDATE orders SET customer_message = $2, updated_at = now() WHERE id = $1`, [id, message],
  );
}

/** Private admin note. NEVER returned by a public endpoint. */
export async function setInternalNotes(id: number, notes: string | null): Promise<void> {
  await pool.query(
    `UPDATE orders SET internal_notes = $2, updated_at = now() WHERE id = $1`, [id, notes],
  );
}

export async function getOrderByTrackingToken(token: string): Promise<OrderRow | null> {
  if (!hasDatabase || !token) return null;
  const { rows } = await pool.query(`SELECT * FROM orders WHERE tracking_token = $1`, [token]);
  return (rows[0] as OrderRow) ?? null;
}

/**
 * The unguessable handle for the buyer's tracking page — generated lazily and stored once, so
 * the URL is stable across every email and page for the life of the order. 32 random bytes,
 * URL-safe. The partial unique index guarantees no collision persists.
 */
export async function ensureTrackingToken(id: number): Promise<string | null> {
  const existing = await getOrder(id);
  if (!existing) return null;
  if (existing.tracking_token) return existing.tracking_token;
  const token = crypto.randomBytes(24).toString("base64url");
  const { rows } = await pool.query(
    `UPDATE orders SET tracking_token = $2, updated_at = now()
      WHERE id = $1 AND tracking_token IS NULL RETURNING tracking_token`,
    [id, token],
  );
  // If a concurrent caller won, re-read the value it wrote rather than overwriting it.
  if (rows.length === 1) return rows[0].tracking_token as string;
  return (await getOrder(id))?.tracking_token ?? null;
}

/**
 * Refund is a Stripe fact, recorded from the signature-verified webhook — not an admin button.
 * Idempotent: only the first delivery that flips a non-refunded order returns true.
 */
export async function markOrderRefunded(orderId: number): Promise<boolean> {
  const { rows } = await pool.query(
    `UPDATE orders SET payment_status = 'refunded', status = 'refunded', updated_at = now()
      WHERE id = $1 AND payment_status <> 'refunded' RETURNING id`,
    [orderId],
  );
  return rows.length === 1;
}

/**
 * Record that a manual reconciliation — not the webhook — was the thing that moved this order to
 * paid. Only ever called by the reconcile action, and only when ITS markOrderPaid won the race,
 * so a webhook-paid order is never mislabelled.
 */
export async function setPaymentSource(id: number, source: "reconcile"): Promise<void> {
  await pool.query(`UPDATE orders SET payment_source = $2, updated_at = now() WHERE id = $1`, [id, source]);
}

/** Cache the last Stripe payment_status seen by a server-side check, and stamp the check time. */
export async function recordPaymentCheck(id: number, stripeStatus: string | null): Promise<void> {
  await pool.query(
    `UPDATE orders SET stripe_payment_status = $2, last_payment_check_at = now(), updated_at = now() WHERE id = $1`,
    [id, stripeStatus],
  );
}

export interface OrderAuditRow {
  id: number; action: string; result: string | null; detail: string | null; actor: string | null; created_at: Date;
}
export async function logOrderAudit(
  orderId: number, action: string, result: string | null, detail: string | null, actor = "admin",
): Promise<void> {
  if (!hasDatabase) return;
  await pool.query(
    `INSERT INTO order_audit (order_id, action, result, detail, actor) VALUES ($1, $2, $3, $4, $5)`,
    [orderId, action, result, detail ? detail.slice(0, 500) : null, actor],
  );
}
export async function listOrderAudit(orderId: number): Promise<OrderAuditRow[]> {
  if (!hasDatabase) return [];
  const { rows } = await pool.query(
    `SELECT id, action, result, detail, actor, created_at FROM order_audit WHERE order_id = $1 ORDER BY created_at DESC`,
    [orderId],
  );
  return rows as OrderAuditRow[];
}

/**
 * Record payment — ONCE.
 *
 * The `payment_status = 'unpaid'` guard is what makes a duplicated webhook harmless: the
 * second delivery updates zero rows and the caller learns it was not the one that did it, so
 * no second fulfilment action is taken. Returns true only for the delivery that won.
 */
export async function markOrderPaid(
  orderId: number, paymentIntentId: string | null,
): Promise<boolean> {
  const { rows } = await pool.query(
    `UPDATE orders
        SET payment_status = 'paid', status = 'paid', paid_at = now(),
            stripe_payment_intent_id = COALESCE($2, stripe_payment_intent_id),
            updated_at = now()
      WHERE id = $1 AND payment_status = 'unpaid'
      RETURNING id`,
    [orderId, paymentIntentId],
  );
  return rows.length === 1;
}

export async function markOrderCancelled(orderId: number): Promise<void> {
  await pool.query(
    `UPDATE orders SET status = 'cancelled', updated_at = now()
      WHERE id = $1 AND payment_status = 'unpaid' AND status IN ('pending','checkout_created')`,
    [orderId],
  );
}

export async function markOrderFailed(orderId: number): Promise<void> {
  await pool.query(
    `UPDATE orders SET payment_status = 'failed', updated_at = now()
      WHERE id = $1 AND payment_status = 'unpaid'`, [orderId],
  );
}

/**
 * THE IDEMPOTENCY GATE.
 *
 * Returns true only the FIRST time an event id is seen. `ON CONFLICT DO NOTHING` makes the
 * check and the claim a single statement, so two concurrent deliveries of the same event
 * cannot both pass.
 */
export async function claimStripeEvent(eventId: string, type: string): Promise<boolean> {
  const { rows } = await pool.query(
    `INSERT INTO stripe_events (event_id, type) VALUES ($1, $2)
     ON CONFLICT (event_id) DO NOTHING RETURNING id`,
    [eventId, type],
  );
  return rows.length === 1;
}

/**
 * HOW MANY CHECKOUTS HAS THIS BUYER STARTED AND NOT PAID FOR, LATELY?
 *
 * The in-memory limiter in routes.ts is per-process, and production demonstrably does not
 * behave as one process: forty rapid requests to the maintenance route were all served, so
 * either the app runs on several instances or the bucket does not survive between them.
 * Either way it cannot be the only thing standing between an abuser and a table full of order
 * rows, so the guard that matters is backed by the DATABASE, which every instance shares.
 *
 * Scoped to the email already stored on the order — no new personal data is collected to make
 * this work, and no IP address is recorded.
 *
 * It counts UNPAID orders only. Somebody who really is buying several paintings pays for them,
 * and paying clears them from this count.
 */
export async function recentUnpaidOrderCount(email: string, minutes = 15): Promise<number> {
  if (!hasDatabase || !email) return 0;
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM orders
      WHERE lower(buyer_email) = lower($1)
        AND payment_status = 'unpaid'
        AND created_at > now() - ($2 || ' minutes')::interval`,
    [email, String(minutes)],
  );
  return rows[0]?.n ?? 0;
}
