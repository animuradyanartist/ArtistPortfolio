/**
 * getPurchasablePrintCollection — behaviour + the N+1 guarantee.
 *
 * The storefront collection endpoint was doing 1 (prints) + N (one variant query per print) serial
 * queries. These tests mock the DB pool, assert the collection still filters/prices/labels exactly as
 * before, AND assert the query pattern is now BOUNDED: one prints query + one BATCHED variants query
 * (`WHERE print_id = ANY(...)`), with zero per-print (`WHERE print_id = $1`) variant queries — no matter
 * how many prints there are.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted so the vi.mock factory (also hoisted) can close over the same query spy.
const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("../../db", () => ({ pool: { query: queryMock }, hasDatabase: true }));

import { getPurchasablePrintCollection } from "./printRepo";

// ── fixtures ──────────────────────────────────────────────────────────────────────────────────
const readyMasterCols = {
  master_asset_key: "key", master_status: "ready", master_width_px: 6000, master_height_px: 8000, master_checksum_md5: "md5",
};
// The collection query now returns a NARROW projection: `images[1] AS primary_image` (the first image
// only) instead of the whole `images` array, and no large/unused columns. Fixtures mirror that shape.
function printRow(over: Record<string, any> = {}) {
  return {
    id: 1, title: "Blue Hour", slug: null, artwork_id: 42, primary_image: "/img/1.jpg",
    ...readyMasterCols, ...over,
  };
}
// A genuinely PURCHASABLE variant: enabled + eligible + verified launch SKU + priced (+ master ready).
function purchasableVariant(over: Record<string, any> = {}) {
  return {
    id: 100, print_id: 1, material: "german-etching", prodigi_sku: "GLOBAL-HGE-A3", size_label: "A3",
    width_cm: 29.7, height_cm: 42, framed: false, frame_colour: null, retail_minor: 12000, currency: "EUR",
    print_ready_asset_url: null, mockups: ["/mock/1.jpg"], effective_dpi: 300, eligible: true, enabled: true,
    prodigi_verified: true, ...over,
  };
}

/** Route mocked queries by SQL, and record each call so we can count query patterns. Whitespace-
 *  tolerant so the multi-line projected prints query still matches. */
function installDb(prints: any[], variants: any[]) {
  queryMock.mockImplementation(async (sql: string, _params?: any[]) => {
    if (/from\s+prints\b/i.test(sql)) return { rows: prints };
    if (/from\s+print_variants/i.test(sql)) {
      // Emulate the batch WHERE print_id = ANY($1) semantics against the provided ids.
      const ids: number[] = _params?.[0] ?? [];
      return { rows: variants.filter((v) => ids.includes(v.print_id)) };
    }
    return { rows: [] };
  });
}
function callsMatching(re: RegExp): number {
  return queryMock.mock.calls.filter((c) => re.test(String(c[0]))).length;
}

beforeEach(() => queryMock.mockReset());

describe("getPurchasablePrintCollection — bounded queries (no N+1)", () => {
  it("uses ONE prints query + ONE batched variants query, regardless of print count", async () => {
    const prints = [printRow({ id: 1 }), printRow({ id: 2 }), printRow({ id: 3 }), printRow({ id: 4 })];
    const variants = [
      purchasableVariant({ id: 100, print_id: 1 }),
      purchasableVariant({ id: 200, print_id: 2 }),
      purchasableVariant({ id: 300, print_id: 3 }),
      purchasableVariant({ id: 400, print_id: 4 }),
    ];
    installDb(prints, variants);

    const cards = await getPurchasablePrintCollection();

    expect(cards).toHaveLength(4);
    // Exactly 2 queries total for 4 prints — the whole point.
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(callsMatching(/from\s+prints\b/i)).toBe(1);
    // ONE batched variant query using ANY(...) — not one per print.
    expect(callsMatching(/FROM print_variants WHERE print_id = ANY/)).toBe(1);
    // ZERO per-print variant queries (the old N+1 signature).
    expect(callsMatching(/FROM print_variants WHERE print_id = \$1\b/)).toBe(0);
    // The batch query carried every active print id.
    const batchCall = queryMock.mock.calls.find((c) => /print_id = ANY/.test(String(c[0])));
    expect(batchCall?.[1]?.[0]).toEqual([1, 2, 3, 4]);
  });

  it("does NOT grow variant queries as prints grow (10 prints → still 1 variants query)", async () => {
    const prints = Array.from({ length: 10 }, (_, i) => printRow({ id: i + 1 }));
    const variants = prints.map((p) => purchasableVariant({ id: p.id * 100, print_id: p.id }));
    installDb(prints, variants);

    await getPurchasablePrintCollection();

    expect(callsMatching(/FROM print_variants/)).toBe(1); // one batch, not ten
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("makes ZERO variant queries when there are no active prints", async () => {
    installDb([], []);
    const cards = await getPurchasablePrintCollection();
    expect(cards).toEqual([]);
    expect(queryMock).toHaveBeenCalledTimes(1); // only the prints query
    expect(callsMatching(/FROM print_variants/)).toBe(0);
  });
});

describe("getPurchasablePrintCollection — narrow projection (no SELECT *, no 57 MB image blob)", () => {
  function printsSql(): string {
    const sql = queryMock.mock.calls.map((c) => String(c[0])).find((s) => /from\s+prints\b/i.test(s));
    expect(sql, "a prints query was issued").toBeTruthy();
    return sql!;
  }

  it("does NOT use SELECT * and takes only the FIRST image (images[1]), not the whole array", async () => {
    installDb([printRow({ id: 1 })], [purchasableVariant({ id: 100, print_id: 1 })]);
    await getPurchasablePrintCollection();
    const sql = printsSql();
    expect(sql).not.toMatch(/select\s+\*/i);         // never SELECT *
    expect(sql).toMatch(/images\[1\]/);              // only the first array element is transferred
    // The full `images` array is never selected bare (that is the 57 MB transfer). `images[1]` (one
    // element) and `array_length(images, 1)` (an integer computed IN Postgres) do not transfer it.
    expect(sql).not.toMatch(/[\s,]images\b(?!\[)/);
  });

  it("selects exactly the columns the card + gates need", async () => {
    installDb([printRow({ id: 1 })], [purchasableVariant({ id: 100, print_id: 1 })]);
    await getPurchasablePrintCollection();
    const sql = printsSql();
    for (const col of ["id", "title", "slug", "artwork_id", "master_asset_key", "master_status", "master_width_px", "master_height_px", "master_checksum_md5"]) {
      expect(sql, `should select ${col}`).toContain(col);
    }
  });

  it("does NOT transfer large / unused prints columns", async () => {
    installDb([printRow({ id: 1 })], [purchasableVariant({ id: 100, print_id: 1 })]);
    await getPurchasablePrintCollection();
    const sql = printsSql();
    for (const col of ["description", "available_sizes", "preferred_material", "master_byte_size", "master_filename", "master_content_type"]) {
      expect(sql, `should NOT select ${col}`).not.toContain(col);
    }
  });
});

describe("getPurchasablePrintCollection — behaviour preserved exactly", () => {
  it("includes only prints with a purchasable variant; excludes fail-closed ones", async () => {
    const prints = [
      printRow({ id: 1, title: "Has buyable", primary_image: "/img/a.jpg" }),
      printRow({ id: 2, title: "No buyable", primary_image: "/img/b.jpg" }),
      printRow({ id: 3, title: "Master missing", primary_image: "/img/c.jpg", master_status: "provisional" }),
    ];
    const variants = [
      purchasableVariant({ id: 100, print_id: 1 }),
      purchasableVariant({ id: 200, print_id: 2, enabled: false }), // disabled → not purchasable
      purchasableVariant({ id: 300, print_id: 3 }),                 // master provisional → not purchasable
    ];
    installDb(prints, variants);

    const cards = await getPurchasablePrintCollection();
    expect(cards.map((c) => c.id)).toEqual([1]); // only print 1 survives the fail-closed gate
    expect(cards[0]).toMatchObject({ id: 1, title: "Has buyable", currency: "EUR", startingPriceMinor: 12000 });
  });

  it("startingPriceMinor is the lowest purchasable price; currency comes from a purchasable variant", async () => {
    const prints = [printRow({ id: 1 })];
    const variants = [
      purchasableVariant({ id: 100, print_id: 1, width_cm: 29.7, retail_minor: 18000, currency: "USD" }),
      purchasableVariant({ id: 101, print_id: 1, width_cm: 40, retail_minor: 12000, currency: "USD" }),
      purchasableVariant({ id: 102, print_id: 1, width_cm: 50, retail_minor: 9000, enabled: false }), // cheaper but not buyable
    ];
    installDb(prints, variants);

    const [card] = await getPurchasablePrintCollection();
    expect(card.startingPriceMinor).toBe(12000); // 9000 is excluded (disabled)
    expect(card.currency).toBe("USD");
  });

  it("image falls back to a variant mockup when the print has no first image (primary_image null)", async () => {
    const prints = [printRow({ id: 1, primary_image: null })];
    const variants = [purchasableVariant({ id: 100, print_id: 1, mockups: ["/mock/only.jpg"] })];
    installDb(prints, variants);

    const [card] = await getPurchasablePrintCollection();
    expect(card.image).toBe("/mock/only.jpg");
  });

  it("uses the print's own first image when present (not the mockup)", async () => {
    const prints = [printRow({ id: 1, primary_image: "/img/hero.jpg" })];
    const variants = [purchasableVariant({ id: 100, print_id: 1, mockups: ["/mock/x.jpg"] })];
    installDb(prints, variants);

    const [card] = await getPurchasablePrintCollection();
    expect(card.image).toBe("/img/hero.jpg");
  });

  it("derives the slug from the title when the row has no stored slug", async () => {
    const prints = [printRow({ id: 1, title: "Blue Hour", slug: null })];
    const variants = [purchasableVariant({ id: 100, print_id: 1 })];
    installDb(prints, variants);

    const [card] = await getPurchasablePrintCollection();
    expect(card.slug).toBe("blue-hour");
  });
});
