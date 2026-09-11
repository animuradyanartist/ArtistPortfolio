/**
 * META PIXEL — a thin, no-op-safe wrapper (same shape as commerceAnalytics's `gtag()` accessor).
 *
 * TEST-SCOPED ACTIVATION. The pixel snippet in client/index.html loads ONLY for a session that
 * arrived from the Meta paid TEST ad — detected from the landing-page UTMs and remembered for the
 * session (see `metaCampaignActive`, whose rule is mirrored inline in index.html). A normal visitor
 * never loads fbevents.js, so `window.fbq` is undefined, NO `_fbp` cookie is set and NO event is sent.
 * This module adds a second, independent guard (`typeof window.fbq === "function"`) so an ad blocker,
 * a private window, or a non-campaign session can never throw inside a page — every call is a no-op.
 *
 * NO BUYER PII EVER. Callers pass only product ids / value / currency. Name, email, address and phone
 * are never sent, and Advanced Matching is intentionally not enabled.
 *
 * GA4 AND MICROSOFT CLARITY ARE UNTOUCHED — this only adds Meta, and only where GA4 already fires.
 */
type Fbq = (...args: unknown[]) => void;

function fbq(): Fbq | null {
  if (typeof window === "undefined") return null;
  const f = (window as unknown as { fbq?: Fbq }).fbq;
  return typeof f === "function" ? f : null;
}

/** True once the pixel is actually present (permitted region + not blocked by an ad blocker). */
export function metaPixelReady(): boolean {
  return fbq() !== null;
}

/**
 * Fire a standard Meta event. `opts.eventID` (the order reference for Purchase) lets Meta dedupe a
 * refresh/re-share and pre-wires server-side (CAPI) dedup for a future phase. No-op when fbq absent.
 */
export function metaTrack(event: string, params?: Record<string, unknown>, opts?: { eventID?: string }): void {
  const f = fbq();
  if (!f) return;
  const body = params ?? {};
  if (opts?.eventID) f("track", event, body, { eventID: opts.eventID });
  else if (params) f("track", event, body);
  else f("track", event);
}

/** SPA PageView (the INITIAL load's PageView is fired once by the snippet in index.html). */
export function metaPageView(): void {
  metaTrack("PageView");
}

/** sessionStorage key set once a session has been activated for the Meta test campaign. */
export const META_OPTIN_KEY = "am.meta.optin.v1";

/** The UTMs that identify our Meta paid TEST ad. Both must match to activate (kept narrow on purpose). */
export const META_TEST_CAMPAIGN = { source: "meta", campaign: "us_print_test_sep2026" } as const;

/**
 * TEST-SCOPED ACTIVATION — NOT consent management. Returns true when the Meta pixel should be active
 * for this session: either the visitor landed from the Meta paid test ad (landing UTMs
 * utm_source=meta & utm_campaign=us_print_test_sep2026) OR the session was already activated earlier
 * (the `META_OPTIN_KEY` flag), so events keep flowing across SPA navigation and the Stripe return.
 * A normal visitor (no campaign UTM, no stored flag) is never activated and never loads fbevents.js.
 *
 * Pure so it is unit-tested; the SAME rule is mirrored inline in index.html (which decides whether the
 * pixel loads and sets the session flag). Deliberately scoped to the $10 US test — site-wide Meta
 * tracking would need real consent management first.
 */
export function metaCampaignActive(search: string, storedFlag: string | null): boolean {
  if (storedFlag === "1") return true;
  try {
    const p = new URLSearchParams(search || "");
    return p.get("utm_source") === META_TEST_CAMPAIGN.source && p.get("utm_campaign") === META_TEST_CAMPAIGN.campaign;
  } catch {
    return false;
  }
}
