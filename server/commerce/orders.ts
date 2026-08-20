/**
 * ORDER PERSISTENCE.
 *
 * Raw SQL rather than Drizzle's query builder for the same reason `reservation.ts` is: these
 * statements run against a table created by the boot self-heal, on a database that may never
 * have seen a migration, and the guards that make them safe (conditional WHEREs, the ON
 * CONFLICT below) are clearer written out than assembled.
 */
import { pool, hasDatabase } from "../db";
import type { OrderStatus, PaymentStatus } from "@shared/commerce/orderStatus";
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
  shipping_carrier: string | null; tracking_number: string | null;
  shipped_at: Date | null; delivered_at: Date | null; attribution: string | null;
  created_at: Date; updated_at: Date;
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
  if (to === "shipped") stamps.push("shipped_at = now()");
  if (to === "delivered") stamps.push("delivered_at = now()");
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
