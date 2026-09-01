/**
 * PROMO AT CHECKOUT — the server-side bridge both the "Apply" preview and the checkout POST use.
 *
 * These prove the properties that protect the charge: the discount is computed from the SERVER's
 * item subtotal (the function has no client-price input), the code is looked up server-side and
 * case-insensitively, an invalid code is refused rather than silently dropped, currency is enforced,
 * and the order snapshot carries exactly the promo columns (nothing Prodigi/fulfilment-related).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./promoRepo", () => ({ getPromoByCode: vi.fn() }));
import { getPromoByCode } from "./promoRepo";
import { resolvePromoForOrder, promoOrderSnapshot } from "./promoCheckout";
import type { PromoRecord } from "@shared/commerce/promo";

const mockGet = getPromoByCode as unknown as ReturnType<typeof vi.fn>;
const AT = new Date("2026-06-15T12:00:00Z");

const promo = (over: Partial<PromoRecord> = {}): PromoRecord => ({
  code: "SAVE10", codeNormalized: "SAVE10", discountType: "percentage", discountValue: 10,
  currency: null, appliesTo: "all", active: true, validFrom: null, expiresAt: null, ...over,
});

beforeEach(() => mockGet.mockReset());

describe("resolvePromoForOrder", () => {
  it("an empty code is a normal no-promo checkout (never an error), and looks nothing up", async () => {
    const r = await resolvePromoForOrder("", { itemType: "originals", currency: "EUR", itemsMinor: 10000, now: AT });
    expect(r).toEqual({ status: "none" });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("looks the code up SERVER-SIDE and case-insensitively", async () => {
    mockGet.mockResolvedValue({ id: 7, ...promo() });
    await resolvePromoForOrder("  save10 ", { itemType: "originals", currency: "EUR", itemsMinor: 10000, now: AT });
    expect(mockGet).toHaveBeenCalledWith("SAVE10"); // trimmed + uppercased
  });

  it("prices the discount from the SERVER item subtotal (a percentage of itemsMinor)", async () => {
    mockGet.mockResolvedValue({ id: 7, ...promo({ discountValue: 10 }) });
    const r = await resolvePromoForOrder("SAVE10", { itemType: "originals", currency: "EUR", itemsMinor: 24000, now: AT });
    expect(r.status).toBe("applied");
    if (r.status === "applied") {
      expect(r.applied.discountMinor).toBe(2400);
      expect(r.applied.discountedItemsMinor).toBe(21600);
      expect(r.promoId).toBe(7);
    }
  });

  it("refuses an invalid (expired) code instead of applying it", async () => {
    mockGet.mockResolvedValue({ id: 7, ...promo({ expiresAt: "2026-01-01T00:00:00Z" }) });
    const r = await resolvePromoForOrder("SAVE10", { itemType: "originals", currency: "EUR", itemsMinor: 10000, now: AT });
    expect(r.status).toBe("error");
    if (r.status === "error") { expect(r.error).toBe("expired"); expect(r.message).toBe("This promo code has expired"); }
  });

  it("a code the DB does not have is not-found", async () => {
    mockGet.mockResolvedValue(null);
    const r = await resolvePromoForOrder("NOPE", { itemType: "prints", currency: "USD", itemsMinor: 8900, now: AT });
    expect(r).toMatchObject({ status: "error", error: "not-found" });
  });

  it("enforces currency: a fixed EUR code is refused on a USD (print) order", async () => {
    mockGet.mockResolvedValue({ id: 9, ...promo({ discountType: "fixed", discountValue: 1000, currency: "EUR" }) });
    const r = await resolvePromoForOrder("TENOFF", { itemType: "prints", currency: "USD", itemsMinor: 8900, now: AT });
    expect(r).toMatchObject({ status: "error", error: "wrong-currency" });
  });

  it("the discount can never exceed the item subtotal (fixed larger than the order)", async () => {
    mockGet.mockResolvedValue({ id: 9, ...promo({ discountType: "fixed", discountValue: 999999, currency: "EUR" }) });
    const r = await resolvePromoForOrder("BIG", { itemType: "originals", currency: "EUR", itemsMinor: 5000, now: AT });
    expect(r.status).toBe("applied");
    if (r.status === "applied") { expect(r.applied.discountMinor).toBe(5000); expect(r.applied.discountedItemsMinor).toBe(0); }
  });

  it("uses ONLY the server-supplied itemsMinor — there is no client-price parameter to trust", async () => {
    mockGet.mockResolvedValue({ id: 7, ...promo({ discountValue: 50 }) });
    // Whatever the client might have claimed, the discount is 50% of the server number we pass here.
    const r = await resolvePromoForOrder("HALF", { itemType: "originals", currency: "EUR", itemsMinor: 30000, now: AT });
    if (r.status === "applied") expect(r.applied.discountMinor).toBe(15000);
  });
});

describe("promoOrderSnapshot", () => {
  it("captures exactly the five promo columns for an applied code (nothing Prodigi/fulfilment)", async () => {
    mockGet.mockResolvedValue({ id: 7, ...promo({ discountValue: 10 }) });
    const r = await resolvePromoForOrder("SAVE10", { itemType: "originals", currency: "EUR", itemsMinor: 10000, now: AT });
    const snap = promoOrderSnapshot(r);
    expect(Object.keys(snap).sort()).toEqual(
      ["promo_code", "promo_code_id", "promo_discount_minor", "promo_discount_type", "promo_discount_value"],
    );
    expect(snap).toEqual({
      promo_code: "SAVE10", promo_discount_minor: 1000, promo_discount_type: "percentage",
      promo_discount_value: 10, promo_code_id: 7,
    });
  });

  it("is all-null for a no-promo order (old/plain checkout is unchanged)", () => {
    expect(promoOrderSnapshot({ status: "none" })).toEqual({
      promo_code: null, promo_discount_minor: null, promo_discount_type: null,
      promo_discount_value: null, promo_code_id: null,
    });
  });

  it("is all-null when the code errored (nothing is snapshotted from a rejected code)", () => {
    expect(promoOrderSnapshot({ status: "error", error: "expired", message: "x" }))
      .toMatchObject({ promo_code: null, promo_discount_minor: null, promo_code_id: null });
  });
});
