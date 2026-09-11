/**
 * META PIXEL WRAPPER + TEST-SCOPED ACTIVATION.
 *   - The wrapper must be a SILENT no-op when the pixel is absent (ad blocker, private window, or a
 *     non-campaign session where index.html never loaded it) — it must never throw inside a page.
 *   - `metaCampaignActive` is the activation rule (mirrored inline in index.html): only a session that
 *     landed from the Meta paid test ad (utm_source=meta & utm_campaign=us_print_test_sep2026), or one
 *     already flagged this session, activates the pixel. Normal visitors never do.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { metaTrack, metaPageView, metaPixelReady, metaCampaignActive } from "./metaPixel";

describe("metaCampaignActive — test-scoped activation (Meta ad UTM only)", () => {
  const LANDING = "?utm_source=meta&utm_medium=paid_social&utm_campaign=us_print_test_sep2026&utm_content=road_through_gold";

  it("ACTIVATES a session landing from the Meta test ad", () => {
    expect(metaCampaignActive(LANDING, null)).toBe(true);
  });

  it("stays active for the rest of the session via the stored flag (later pages have no UTM)", () => {
    expect(metaCampaignActive("", "1")).toBe(true);
    expect(metaCampaignActive("?variant=28&qty=1", "1")).toBe(true); // e.g. /checkout
    expect(metaCampaignActive("", "1")).toBe(true); // e.g. /order/:reference after Stripe
  });

  it("does NOT activate a normal (non-ad) visitor — no fbevents.js will load", () => {
    expect(metaCampaignActive("", null)).toBe(false);
    expect(metaCampaignActive("?utm_source=google&utm_campaign=us_print_test_sep2026", null)).toBe(false); // wrong source
    expect(metaCampaignActive("?utm_source=meta&utm_campaign=other", null)).toBe(false); // wrong campaign
    expect(metaCampaignActive("?utm_source=meta", null)).toBe(false); // missing campaign
    expect(metaCampaignActive("?utm_campaign=us_print_test_sep2026", null)).toBe(false); // missing source
  });

  it("does not throw on a malformed query string", () => {
    expect(metaCampaignActive("%E0%A4%A", null)).toBe(false);
  });
});

describe("metaTrack / metaPageView — no-op-safe wrapper", () => {
  let calls: unknown[][];

  beforeEach(() => {
    calls = [];
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("does NOT throw and sends nothing when fbq is absent (ad blocker / EU / private window)", () => {
    (globalThis as { window?: unknown }).window = {}; // no fbq
    expect(metaPixelReady()).toBe(false);
    expect(() => metaTrack("ViewContent", { content_ids: ["19"] })).not.toThrow();
    expect(() => metaPageView()).not.toThrow();
  });

  it("fires a Meta track call when fbq is present", () => {
    (globalThis as { window?: unknown }).window = { fbq: (...a: unknown[]) => calls.push(a) };
    expect(metaPixelReady()).toBe(true);
    metaTrack("AddToCart", { content_ids: ["19"], value: 69, currency: "USD" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(["track", "AddToCart", { content_ids: ["19"], value: 69, currency: "USD" }]);
  });

  it("passes eventID as the 4th argument (enables Purchase dedup)", () => {
    (globalThis as { window?: unknown }).window = { fbq: (...a: unknown[]) => calls.push(a) };
    metaTrack("Purchase", { value: 69, currency: "USD" }, { eventID: "AM-2026-000123" });
    expect(calls[0]).toEqual(["track", "Purchase", { value: 69, currency: "USD" }, { eventID: "AM-2026-000123" }]);
  });

  it("PageView is sent with no params", () => {
    (globalThis as { window?: unknown }).window = { fbq: (...a: unknown[]) => calls.push(a) };
    metaPageView();
    expect(calls[0]).toEqual(["track", "PageView"]);
  });
});
