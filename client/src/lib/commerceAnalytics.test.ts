/**
 * PINTEREST SAVE ANALYTICS — locks the `pinterest_save_click` payload contract and the "fires
 * exactly once per click" guarantee, on the site's existing GA4 gtag. Focus: `artwork_id` must be
 * the SOURCE original artwork for a print (never the print product id), while an original is
 * unchanged. No PII, no ecommerce items array — it stays a flat engagement event.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  trackPinterestSaveClick,
  trackViewItemPrint,
  trackAddToCartPrint,
  trackBeginCheckout,
  trackPurchaseOnce,
  printItem,
} from "./commerceAnalytics";

let calls: unknown[][];

beforeEach(() => {
  calls = [];
  // The module's gtag() reads window.gtag; define a capturing stub (node has no window).
  (globalThis as { window?: unknown }).window = { gtag: (...args: unknown[]) => calls.push(args) };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("trackPinterestSaveClick", () => {
  it("PRINT: fires once with item_id = print id and artwork_id = source artwork id", () => {
    trackPinterestSaveClick({
      itemId: 19, // print product id
      itemName: "Road Through Gold",
      itemType: "print",
      artworkId: 59, // source original artwork
      pageLocation: "https://animuradyan.com/prints/road_through_gold",
    });

    expect(calls).toHaveLength(1); // exactly once
    const [event, name, params] = calls[0] as [string, string, Record<string, unknown>];
    expect(event).toBe("event");
    expect(name).toBe("pinterest_save_click");
    expect(params).toMatchObject({
      item_id: "19",
      artwork_id: 59,
      item_name: "Road Through Gold",
      item_type: "print",
      page_location: "https://animuradyan.com/prints/road_through_gold",
    });
  });

  it("ORIGINAL: unchanged — artwork_id is the artwork's own numeric id", () => {
    trackPinterestSaveClick({
      itemId: 59,
      itemName: "Road Through Gold",
      itemType: "original",
      pageLocation: "https://animuradyan.com/artworks/road-through-gold-59",
    });

    expect(calls).toHaveLength(1);
    const params = (calls[0] as [string, string, Record<string, unknown>])[2];
    expect(params).toMatchObject({ item_id: "59", artwork_id: 59, item_type: "original" });
  });

  it("PRINT with no linked original: artwork_id is omitted (never the print id)", () => {
    trackPinterestSaveClick({
      itemId: 20,
      itemName: "Standalone print",
      itemType: "print",
      artworkId: null,
      pageLocation: "https://animuradyan.com/prints/standalone",
    });

    const params = (calls[0] as [string, string, Record<string, unknown>])[2];
    expect(params.item_id).toBe("20");
    expect(params.artwork_id).toBeUndefined();
  });

  it("is a no-op (no throw) when gtag is absent, e.g. an ad blocker", () => {
    (globalThis as { window?: unknown }).window = {}; // no gtag
    expect(() =>
      trackPinterestSaveClick({ itemId: 1, itemName: "x", itemType: "original", pageLocation: "u" }),
    ).not.toThrow();
    expect(calls).toHaveLength(0);
  });
});

/**
 * META PIXEL EVENTS ride the SAME functions as GA4. These lock: each funnel step emits its Meta
 * standard event, Purchase fires once with the order reference as eventID, only product data (never
 * PII) reaches Meta, and an absent fbq (ad blocker / EU) is a silent no-op that doesn't stop GA4.
 */
function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

describe("Meta Pixel commerce events (Road Through Gold print, ride alongside GA4)", () => {
  let gtagCalls: unknown[][];
  let fbqCalls: unknown[][];

  beforeEach(() => {
    gtagCalls = [];
    fbqCalls = [];
    (globalThis as { window?: unknown }).window = {
      gtag: (...a: unknown[]) => gtagCalls.push(a),
      fbq: (...a: unknown[]) => fbqCalls.push(a),
    };
    (globalThis as { localStorage?: unknown }).localStorage = memStorage();
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  const metaOf = (event: string) =>
    fbqCalls.filter((c) => c[0] === "track" && c[1] === event).map((c) => c as [string, string, Record<string, unknown>, ...unknown[]]);

  it("print ViewContent carries the REAL product currency to BOTH GA4 and Meta (Road Through Gold: $69 USD)", () => {
    // Currency bug fix: the PDP now passes the catalogue currency; the analytics layer must honour it
    // (not fall back to EUR) on both stacks.
    trackViewItemPrint({ id: 19, title: "Road Through Gold", priceMinor: 6900, currency: "USD", printProductId: 19, artworkId: 59 });

    const ga = gtagCalls.find((c) => c[1] === "view_item") as [string, string, Record<string, unknown>] | undefined;
    expect(ga).toBeDefined();
    expect(ga?.[2]).toMatchObject({ currency: "USD", value: 69 });

    const v = metaOf("ViewContent");
    expect(v).toHaveLength(1);
    expect(v[0][2]).toMatchObject({ content_type: "product", content_ids: ["19"], content_name: "Road Through Gold", value: 69, currency: "USD" });
  });

  it("print ViewContent falls back to EUR ONLY when no currency is supplied (regression guard)", () => {
    trackViewItemPrint({ id: 19, title: "Road Through Gold", priceMinor: 6900, printProductId: 19 }); // no currency
    expect(metaOf("ViewContent")[0][2]).toMatchObject({ currency: "EUR" });
  });

  it("AddToCart fires with the selected variant id", () => {
    trackAddToCartPrint({ id: 19, title: "Road Through Gold", priceMinor: 6900, currency: "USD", printProductId: 19, printVariantId: 101, quantity: 1 });
    const a = metaOf("AddToCart");
    expect(a).toHaveLength(1);
    expect(a[0][2]).toMatchObject({ content_ids: ["101"], contents: [{ id: "101", quantity: 1 }], value: 69, currency: "USD" });
  });

  it("InitiateCheckout fires when checkout starts (order total, num_items)", () => {
    trackBeginCheckout([{ id: 101, title: "Road Through Gold" }], 8900, "USD");
    const c = metaOf("InitiateCheckout");
    expect(c).toHaveLength(1);
    expect(c[0][2]).toMatchObject({ content_ids: ["101"], num_items: 1, value: 89, currency: "USD" });
  });

  it("Purchase fires EXACTLY ONCE with the order reference as eventID (refresh/re-share deduped)", () => {
    const order = {
      reference: "AM-2026-000123",
      totalMinor: 8900,
      shippingMinor: 2000,
      currency: "USD",
      items: [printItem({ id: 19, title: "Road Through Gold", priceMinor: 6900, printVariantId: 101, quantity: 1 })],
    };
    trackPurchaseOnce(order);
    trackPurchaseOnce(order); // page refresh / bookmark / share
    const p = metaOf("Purchase");
    expect(p).toHaveLength(1);
    expect(p[0][2]).toMatchObject({ content_type: "product", content_ids: ["101"], value: 89, currency: "USD" });
    expect(p[0][3]).toEqual({ eventID: "AM-2026-000123" });
    expect(gtagCalls.filter((c) => c[1] === "purchase")).toHaveLength(1); // GA4 also once
  });

  it("sends NO buyer PII to Meta — only whitelisted product keys, no Advanced Matching", () => {
    trackViewItemPrint({ id: 19, title: "Road Through Gold", priceMinor: 6900, currency: "USD", printVariantId: 101 });
    trackAddToCartPrint({ id: 19, title: "Road Through Gold", priceMinor: 6900, currency: "USD", printVariantId: 101, quantity: 1 });
    trackBeginCheckout([{ id: 101, title: "Road Through Gold" }], 8900, "USD");
    trackPurchaseOnce({ reference: "AM-1", totalMinor: 8900, shippingMinor: 2000, currency: "USD", items: [printItem({ id: 19, title: "Road Through Gold", printVariantId: 101 })] });

    const ALLOWED = new Set(["content_type", "content_ids", "content_name", "contents", "value", "currency", "num_items"]);
    for (const [, , params] of fbqCalls.map((c) => c as [string, string, Record<string, unknown>])) {
      if (!params) continue;
      for (const k of Object.keys(params)) expect(ALLOWED.has(k)).toBe(true); // no em/fn/ln/ph/ct/zp/external_id etc.
    }
    // No Advanced Matching: fbq('init', id, {…PII}) is never called from app code.
    expect(fbqCalls.some((c) => c[0] === "init")).toBe(false);
    // No stray email/@ anywhere in what we send to Meta.
    expect(/@|email/i.test(JSON.stringify(fbqCalls))).toBe(false);
  });

  it("no Meta event throws when fbq is absent (ad blocker / EU), and GA4 still fires", () => {
    (globalThis as { window?: unknown }).window = { gtag: (...a: unknown[]) => gtagCalls.push(a) }; // no fbq
    expect(() => trackAddToCartPrint({ id: 19, title: "Road Through Gold", printVariantId: 101 })).not.toThrow();
    expect(gtagCalls.some((c) => c[1] === "add_to_cart")).toBe(true);
    expect(fbqCalls).toHaveLength(0);
  });
});
