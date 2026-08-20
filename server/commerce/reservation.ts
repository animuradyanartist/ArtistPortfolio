/**
 * ONE PAINTING, ONE BUYER.
 *
 * This is the file that stops two people paying for the same canvas.
 *
 * THE MECHANISM IS A CONDITIONAL UPDATE, not a read followed by a write. Two checkouts that
 * arrive in the same millisecond both run:
 *
 *     UPDATE artworks SET reserved_until = ... WHERE id = $1 AND (nobody holds it)
 *
 * Postgres serialises the two statements on the row. The first sets the hold and reports one
 * updated row; the second finds the WHERE no longer true and reports zero. Zero rows is the
 * loser, and the loser is told the work just went. No transaction blocks, no advisory locks,
 * no read-modify-write window for the two to race inside.
 *
 * THE HOLD IS NOT A SALE. `availability` is untouched here. Somebody who opens checkout and
 * closes the tab must not mark a painting sold — the hold simply lapses. Only a
 * signature-verified payment webhook writes "sold", and it does it once.
 *
 * EVERY HOLD HAS AN EXPIRY. A reservation with no deadline is a painting nobody can ever buy
 * again, so the column is always written with one and the sweeper below releases the rest.
 */
import { pool, hasDatabase } from "../db";

/**
 * How long a checkout may hold a painting.
 *
 * Long enough to type an address and find a card; short enough that an abandoned tab does not
 * take a work off sale for an afternoon. Stripe's own Checkout Sessions expire at 24h; this is
 * deliberately far shorter, and the webhook extends nothing — payment replaces the hold
 * outright.
 */
export const RESERVATION_MINUTES = 30;

export interface ReservationResult {
  ok: boolean;
  /** Why the hold could not be taken, for the 409 the caller returns. */
  reason?: "already-reserved" | "not-available" | "no-database";
}

/**
 * Take the hold, or fail.
 *
 * The WHERE clause is the entire safety property, so read it as one sentence: reserve this
 * row only if it is still available, still enabled for direct sale, still priced, and either
 * unheld or held by a hold that has already lapsed — or held by THIS order already, which
 * makes a retry of the same checkout idempotent rather than a conflict.
 */
export async function reserveArtwork(
  artworkId: number,
  orderId: number,
  minutes: number = RESERVATION_MINUTES,
): Promise<ReservationResult> {
  if (!hasDatabase) return { ok: false, reason: "no-database" };

  const { rows } = await pool.query(
    `UPDATE artworks
        SET reserved_until = (now() + ($3 || ' minutes')::interval)::timestamp,
            reserved_by_order_id = $2
      WHERE id = $1
        AND availability = 'available'
        AND direct_sale_enabled = true
        AND website_price_minor IS NOT NULL
        AND website_price_minor > 0
        -- A promise blocks the sale here too, not only in the eligibility check, so a race
        -- cannot slip past it. Open-ended (NULL/blank until) keeps blocking.
        --
        -- Compared as TEXT, not cast to a date: commitment_until holds an ISO 'YYYY-MM-DD',
        -- and ISO dates sort lexicographically, so "< today" is exactly "is in the past"
        -- without a cast that behaves differently across engines.
        AND (has_commitment IS NOT TRUE
             OR (commitment_until IS NOT NULL
                 AND commitment_until <> ''
                 AND commitment_until < $4))
        AND (reserved_until IS NULL
             OR reserved_until <= now()
             OR reserved_by_order_id = $2)
      RETURNING id`,
    [artworkId, orderId, String(minutes), todayIso()],
  );

  if (rows.length === 1) return { ok: true };

  // Distinguish "somebody else is buying it" from "it is not for sale", because the two
  // deserve different words in front of a buyer.
  const { rows: state } = await pool.query(
    `SELECT availability, reserved_until FROM artworks WHERE id = $1`, [artworkId],
  );
  const row = state[0];
  if (row && row.availability === "available" && row.reserved_until && new Date(row.reserved_until) > new Date()) {
    return { ok: false, reason: "already-reserved" };
  }
  return { ok: false, reason: "not-available" };
}

/**
 * Release a hold this order owns.
 *
 * Scoped to `reserved_by_order_id` so a late cancellation of an abandoned checkout can never
 * release a hold that a DIFFERENT, live checkout has since taken. Idempotent: releasing twice
 * updates zero rows the second time and is not an error.
 */
export async function releaseReservation(artworkId: number, orderId: number): Promise<void> {
  if (!hasDatabase) return;
  await pool.query(
    `UPDATE artworks
        SET reserved_until = NULL, reserved_by_order_id = NULL
      WHERE id = $1 AND reserved_by_order_id = $2`,
    [artworkId, orderId],
  );
}

/**
 * Payment landed: the hold becomes ownership.
 *
 * ONE ROW, ONCE. The `availability = 'available'` guard means a replayed webhook — Stripe
 * retries, and it delivers duplicates — updates nothing the second time, so a painting cannot
 * be "sold" twice and no second fulfilment is triggered. Returns whether THIS call was the one
 * that did it, which the webhook uses to decide whether to act.
 */
export async function markSold(artworkId: number, orderId: number): Promise<boolean> {
  if (!hasDatabase) return false;
  const { rows } = await pool.query(
    `UPDATE artworks
        SET availability = 'sold', reserved_until = NULL, reserved_by_order_id = NULL
      WHERE id = $1
        AND availability = 'available'
        AND (reserved_by_order_id = $2 OR reserved_by_order_id IS NULL)
      RETURNING id`,
    [artworkId, orderId],
  );
  return rows.length === 1;
}

/**
 * THE SWEEPER — PART 18 and PART 32.
 *
 * Releases every hold whose deadline has passed and cancels the checkout that owned it. Set
 * theory, not iteration: one statement for the artworks, one for the orders, both scoped so a
 * concurrent payment cannot be caught by either.
 *
 * IDEMPOTENT BY CONSTRUCTION. A second run finds nothing expired and does nothing. Safe to
 * call on a timer, on boot, and from a request path — all three happen.
 *
 * The orders update deliberately excludes anything already paid: a webhook that arrives while
 * the sweep is running must win, and `payment_status = 'unpaid'` is what guarantees the sweep
 * cannot cancel an order that has just been paid for.
 */
export async function releaseExpiredReservations(): Promise<{ artworksReleased: number; ordersCancelled: number }> {
  if (!hasDatabase) return { artworksReleased: 0, ordersCancelled: 0 };

  const { rowCount: artworksReleased } = await pool.query(
    `UPDATE artworks
        SET reserved_until = NULL, reserved_by_order_id = NULL
      WHERE reserved_until IS NOT NULL
        AND reserved_until <= now()`,
  );

  const { rowCount: ordersCancelled } = await pool.query(
    `UPDATE orders
        SET status = 'cancelled', updated_at = now()
      WHERE status IN ('pending', 'checkout_created')
        AND payment_status = 'unpaid'
        AND reservation_expires_at IS NOT NULL
        AND reservation_expires_at <= now()`,
  );

  return { artworksReleased: artworksReleased ?? 0, ordersCancelled: ordersCancelled ?? 0 };
}

/** Today in UTC as 'YYYY-MM-DD', for the lexicographic commitment comparison above. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
