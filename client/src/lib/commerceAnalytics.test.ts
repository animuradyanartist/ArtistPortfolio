/**
 * PINTEREST SAVE ANALYTICS — locks the `pinterest_save_click` payload contract and the "fires
 * exactly once per click" guarantee, on the site's existing GA4 gtag. Focus: `artwork_id` must be
 * the SOURCE original artwork for a print (never the print product id), while an original is
 * unchanged. No PII, no ecommerce items array — it stays a flat engagement event.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { trackPinterestSaveClick } from "./commerceAnalytics";

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
