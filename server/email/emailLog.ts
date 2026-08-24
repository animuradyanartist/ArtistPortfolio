/**
 * THE EMAIL LEDGER — history and idempotency, in the `order_emails` table.
 *
 * IDEMPOTENCY. A once-only email (the payment confirmation above all) claims a `dedupeKey`
 * before it is sent. The unique index on `dedupe_key` makes the claim atomic: a Stripe webhook
 * retry, or two concurrent deliveries, cannot both win, so the confirmation can never be sent
 * twice. On a SEND FAILURE the claim is released (see `dispatchOrderEmail`) so the slot is not
 * poisoned — a later automatic retry or an admin resend can still get through. A successful send
 * keeps the slot forever, which is exactly the once-only guarantee.
 *
 * HISTORY. Every attempt — sent, failed, or skipped — leaves a row, so Admin can see per order
 * what went out and whether the provider accepted it. A failure is recorded, never swallowed.
 */
import { pool, hasDatabase } from "../db";

export type EmailStatus = "pending" | "sent" | "failed" | "skipped";

export interface OrderEmailRow {
  id: number;
  kind: string;
  to_email: string | null;
  subject: string | null;
  status: EmailStatus;
  provider_id: string | null;
  error: string | null;
  created_at: Date;
}

export interface ClaimResult { claimed: boolean; id: number | null }

/**
 * Insert a `pending` row and take ownership of the send. For once-only emails pass a
 * `dedupeKey` (e.g. `"42:order_confirmation"`): if a row with that key already exists the claim
 * is refused (`claimed:false`). For repeatable emails pass `null` — the insert always succeeds.
 */
export async function claimOrderEmail(
  orderId: number, kind: string, toEmail: string | null, subject: string | null, dedupeKey: string | null,
): Promise<ClaimResult> {
  if (!hasDatabase) return { claimed: false, id: null };
  if (dedupeKey) {
    const { rows } = await pool.query(
      `INSERT INTO order_emails (order_id, kind, to_email, subject, status, dedupe_key)
       VALUES ($1, $2, $3, $4, 'pending', $5)
       ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
      [orderId, kind, toEmail, subject, dedupeKey],
    );
    return rows.length === 1 ? { claimed: true, id: rows[0].id } : { claimed: false, id: null };
  }
  const { rows } = await pool.query(
    `INSERT INTO order_emails (order_id, kind, to_email, subject, status)
     VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
    [orderId, kind, toEmail, subject],
  );
  return { claimed: true, id: rows[0].id };
}

/** Resolve a claimed row's outcome. */
export async function finishOrderEmail(
  id: number, status: EmailStatus, providerId: string | null, error: string | null,
): Promise<void> {
  if (!hasDatabase) return;
  await pool.query(
    `UPDATE order_emails SET status = $2, provider_id = $3, error = $4 WHERE id = $1`,
    [id, status, providerId, error ? error.slice(0, 300) : null],
  );
}

/**
 * Release a once-only claim after a failed send, so the dedupe slot is free again. The pending
 * row is deleted; a separate `failed` history row (with no dedupe key) records the attempt.
 */
export async function releaseOrderEmailClaim(id: number): Promise<void> {
  if (!hasDatabase) return;
  await pool.query(`DELETE FROM order_emails WHERE id = $1 AND status = 'pending'`, [id]);
}

/** Write a standalone history row (used for skipped/failed records that hold no dedupe slot). */
export async function logOrderEmail(
  orderId: number, kind: string, toEmail: string | null, subject: string | null,
  status: EmailStatus, providerId: string | null, error: string | null,
): Promise<void> {
  if (!hasDatabase) return;
  await pool.query(
    `INSERT INTO order_emails (order_id, kind, to_email, subject, status, provider_id, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [orderId, kind, toEmail, subject, status, providerId, error ? error.slice(0, 300) : null],
  );
}

export async function listOrderEmails(orderId: number): Promise<OrderEmailRow[]> {
  if (!hasDatabase) return [];
  const { rows } = await pool.query(
    `SELECT id, kind, to_email, subject, status, provider_id, error, created_at
       FROM order_emails WHERE order_id = $1 ORDER BY created_at DESC`,
    [orderId],
  );
  return rows as OrderEmailRow[];
}
