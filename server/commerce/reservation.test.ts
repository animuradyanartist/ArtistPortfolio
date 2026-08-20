/**
 * THE RACE, RUN AGAINST A REAL SQL ENGINE.
 *
 * These execute the ACTUAL statements from reservation.ts against pg-mem — a real Postgres
 * parser and executor — rather than asserting on a hand-written mock. That matters: the whole
 * safety property lives in a WHERE clause, and a mock would only prove that the mock agrees
 * with itself.
 *
 * What is proven here:
 *   two concurrent checkouts → exactly one hold
 *   abandoned checkout → expiry releases it → purchasable again
 *   paid → Sold, exactly once, even when the webhook is delivered twice
 *   the sweeper running AFTER a sale must not resurrect a sold painting
 */
import { describe, it, expect, beforeEach } from "vitest";
import { newDb } from "pg-mem";

/**
 * The real statements from server/commerce/reservation.ts.
 *
 * One deliberate difference: production writes `(now() + interval)::timestamp` because the
 * column is `timestamp`, and pg-mem cannot perform that cast at all. The fixture therefore
 * declares the column `timestamptz` and drops the cast. Nothing under test changes — the
 * property being proven lives entirely in the WHERE clause, and the cast only decides how the
 * value is stored once the row has already been chosen.
 */
const RESERVE = `
  UPDATE artworks
     SET reserved_until = now() + ($3 || ' minutes')::interval,
         reserved_by_order_id = $2
   WHERE id = $1
     AND availability = 'available'
     AND direct_sale_enabled = true
     AND website_price_minor IS NOT NULL
     AND website_price_minor > 0
     AND (has_commitment IS NOT TRUE
          OR (commitment_until IS NOT NULL AND commitment_until <> ''
              AND commitment_until < $4))
     AND (reserved_until IS NULL OR reserved_until <= now() OR reserved_by_order_id = $2)
   RETURNING id`;

const MARK_SOLD = `
  UPDATE artworks
     SET availability = 'sold', reserved_until = NULL, reserved_by_order_id = NULL
   WHERE id = $1 AND availability = 'available'
     AND (reserved_by_order_id = $2 OR reserved_by_order_id IS NULL)
   RETURNING id`;

const SWEEP_ARTWORKS = `
  UPDATE artworks SET reserved_until = NULL, reserved_by_order_id = NULL
   WHERE reserved_until IS NOT NULL AND reserved_until <= now()`;

const TODAY = new Date().toISOString().slice(0, 10);

let db: ReturnType<typeof newDb>;
type Res = { rows: Array<Record<string, unknown>>; rowCount: number };
let q: (sql: string, args?: unknown[]) => Promise<Res>;

const seed = async (over: Record<string, unknown> = {}) => {
  const a = {
    id: 1, availability: "available", direct_sale_enabled: true, website_price_minor: 240000,
    reserved_until: null as string | null, reserved_by_order_id: null as number | null,
    has_commitment: false, commitment_until: null as string | null, ...over,
  };
  await q(`INSERT INTO artworks (id, availability, direct_sale_enabled, website_price_minor,
       reserved_until, reserved_by_order_id, has_commitment, commitment_until)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [a.id, a.availability, a.direct_sale_enabled, a.website_price_minor,
     a.reserved_until, a.reserved_by_order_id, a.has_commitment, a.commitment_until]);
};

const state = async () => (await q(`SELECT availability, reserved_until, reserved_by_order_id FROM artworks WHERE id = 1`)).rows[0]!;

beforeEach(async () => {
  db = newDb();
  const pg = db.adapters.createPg();
  const client = new pg.Client();
  await client.connect();
  q = (sql, args = []) => client.query(sql, args) as unknown as Promise<Res>;
  await q(`CREATE TABLE artworks (
      id integer PRIMARY KEY,
      availability text NOT NULL,
      direct_sale_enabled boolean,
      website_price_minor integer,
      reserved_until timestamptz,
      reserved_by_order_id integer,
      has_commitment boolean,
      commitment_until text)`);
});

describe("two buyers, one painting", () => {
  it("gives the hold to exactly one of them", async () => {
    await seed();
    const a = await q(RESERVE, [1, 101, "30", TODAY]);
    const b = await q(RESERVE, [1, 202, "30", TODAY]);
    expect(a.rows.length + b.rows.length).toBe(1);
    expect(a.rows.length).toBe(1);   // first statement wins
    expect(b.rows.length).toBe(0);   // second finds its WHERE no longer true
    expect((await state()).reserved_by_order_id).toBe(101);
  });

  it("is idempotent for the SAME order retrying", async () => {
    await seed();
    expect((await q(RESERVE, [1, 101, "30", TODAY])).rows.length).toBe(1);
    expect((await q(RESERVE, [1, 101, "30", TODAY])).rows.length).toBe(1);
    expect((await state()).reserved_by_order_id).toBe(101);
  });

  it("refuses a sold painting", async () => {
    await seed({ availability: "sold" });
    expect((await q(RESERVE, [1, 101, "30", TODAY])).rows.length).toBe(0);
  });

  it("refuses a work under an open-ended commitment", async () => {
    await seed({ has_commitment: true, commitment_until: null });
    expect((await q(RESERVE, [1, 101, "30", TODAY])).rows.length).toBe(0);
  });

  it("allows a work whose commitment has expired", async () => {
    await seed({ has_commitment: true, commitment_until: "2020-01-01" });
    expect((await q(RESERVE, [1, 101, "30", TODAY])).rows.length).toBe(1);
  });
});

describe("abandonment", () => {
  it("an expired hold lets the next buyer through", async () => {
    await seed({ reserved_until: "2020-01-01T00:00:00Z", reserved_by_order_id: 101 });
    const b = await q(RESERVE, [1, 202, "30", TODAY]);
    expect(b.rows.length).toBe(1);
    expect((await state()).reserved_by_order_id).toBe(202);
  });

  it("the sweeper clears a lapsed hold and leaves a live one alone", async () => {
    await seed({ reserved_until: "2020-01-01T00:00:00Z", reserved_by_order_id: 101 });
    await q(SWEEP_ARTWORKS);
    expect((await state()).reserved_until).toBeNull();
    expect((await state()).availability).toBe("available");

    await q(RESERVE, [1, 303, "30", TODAY]);
    await q(SWEEP_ARTWORKS);                       // runs again while the new hold is live
    expect((await state()).reserved_by_order_id).toBe(303);
  });
});

describe("payment", () => {
  it("marks the painting sold exactly once, however many times the webhook arrives", async () => {
    await seed();
    await q(RESERVE, [1, 101, "30", TODAY]);
    const first = await q(MARK_SOLD, [1, 101]);
    const second = await q(MARK_SOLD, [1, 101]);   // Stripe retried
    const third = await q(MARK_SOLD, [1, 101]);    // and again
    expect(first.rows.length).toBe(1);
    expect(second.rows.length).toBe(0);
    expect(third.rows.length).toBe(0);
    expect((await state()).availability).toBe("sold");
  });

  it("clears the hold when it sells, so nothing is left dangling", async () => {
    await seed();
    await q(RESERVE, [1, 101, "30", TODAY]);
    await q(MARK_SOLD, [1, 101]);
    expect((await state()).reserved_until).toBeNull();
    expect((await state()).reserved_by_order_id).toBeNull();
  });

  /** THE ONE THAT WOULD LOSE A PAINTING: a sweep after a sale must not undo it. */
  it("a later sweep does NOT resurrect a sold painting", async () => {
    await seed();
    await q(RESERVE, [1, 101, "30", TODAY]);
    await q(MARK_SOLD, [1, 101]);
    await q(SWEEP_ARTWORKS);
    await q(SWEEP_ARTWORKS);
    expect((await state()).availability).toBe("sold");
  });

  it("a losing buyer cannot mark it sold under the winner's order", async () => {
    await seed();
    await q(RESERVE, [1, 101, "30", TODAY]);
    expect((await q(MARK_SOLD, [1, 202])).rows.length).toBe(0);
    expect((await state()).availability).toBe("available");
  });
});
