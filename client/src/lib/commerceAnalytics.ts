/**
 * COMMERCE EVENTS, ON THE ANALYTICS THIS SITE ALREADY HAS.
 *
 * GA4 is already loaded in client/index.html (G-J1RN8P4KHY), so this adds events rather than
 * a second stack. Every call is a no-op when gtag is absent — an ad blocker must not throw
 * inside a checkout.
 *
 * NO BUYER PII EVER. Name, email, phone and address are deliberately not passed: they are not
 * needed to judge a channel and sending them would put personal data in a third party's logs
 * for no analytical gain.
 *
 * `purchase` FIRES ONCE PER ORDER, not once per page view. The confirmation page is a URL a
 * person can refresh, bookmark and share, and every one of those would otherwise report a new
 * sale. The order reference is recorded in localStorage the first time and checked before
 * firing — see `trackPurchaseOnce`.
 */
type Gtag = (...args: unknown[]) => void;

function gtag(): Gtag | null {
  const g = (window as unknown as { gtag?: Gtag }).gtag;
  return typeof g === "function" ? g : null;
}

interface ItemInput { id: number; title: string; priceMinor?: number | null; currency?: string }

const toItem = (i: ItemInput) => ({
  item_id: String(i.id),
  item_name: i.title,
  item_category: "original-artwork",
  price: typeof i.priceMinor === "number" ? i.priceMinor / 100 : undefined,
  quantity: 1,
});

export function trackViewItem(i: ItemInput): void {
  gtag()?.("event", "view_item", {
    currency: i.currency ?? "EUR",
    value: typeof i.priceMinor === "number" ? i.priceMinor / 100 : undefined,
    items: [toItem(i)],
  });
}

export function trackAddToCart(i: ItemInput): void {
  gtag()?.("event", "add_to_cart", {
    currency: i.currency ?? "EUR",
    value: typeof i.priceMinor === "number" ? i.priceMinor / 100 : undefined,
    items: [toItem(i)],
  });
}

export function trackBeginCheckout(items: ItemInput[], totalMinor: number, currency: string): void {
  gtag()?.("event", "begin_checkout", {
    currency, value: totalMinor / 100, items: items.map(toItem),
  });
}

const PURCHASED_KEY = "am.purchases.v1";

function alreadyReported(reference: string): boolean {
  try {
    const raw = localStorage.getItem(PURCHASED_KEY);
    const seen = raw ? (JSON.parse(raw) as string[]) : [];
    if (seen.includes(reference)) return true;
    // Keep the list short; a person does not need a permanent purchase ledger in their browser.
    localStorage.setItem(PURCHASED_KEY, JSON.stringify([...seen, reference].slice(-25)));
    return false;
  } catch {
    // With no storage the safe direction is NOT firing: a missing conversion is a reporting
    // gap, a duplicated one is a wrong number somebody will make a decision on.
    return true;
  }
}

export function trackPurchaseOnce(args: {
  reference: string; totalMinor: number; shippingMinor: number; currency: string; items: ItemInput[];
}): void {
  if (!args.reference || alreadyReported(args.reference)) return;
  gtag()?.("event", "purchase", {
    transaction_id: args.reference,
    currency: args.currency,
    value: args.totalMinor / 100,
    shipping: args.shippingMinor / 100,
    items: args.items.map(toItem),
  });
}

/**
 * UTM and landing path, captured on first arrival and kept for the session.
 *
 * Stored so an order can record where the buyer came from even though checkout happens
 * several pages later. Nothing identifying, and nothing that survives the tab.
 */
const ATTRIBUTION_KEY = "am.attr.v1";

export function captureAttribution(): void {
  try {
    if (sessionStorage.getItem(ATTRIBUTION_KEY)) return;
    const p = new URLSearchParams(window.location.search);
    const attr: Record<string, string> = {};
    for (const [param, key] of [["utm_source","source"],["utm_medium","medium"],["utm_campaign","campaign"],["utm_term","term"],["utm_content","content"]] as const) {
      const v = p.get(param); if (v) attr[key] = v.slice(0, 200);
    }
    attr.landingPath = window.location.pathname.slice(0, 200);
    sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attr));
  } catch { /* private mode */ }
}

export function readAttribution(): Record<string, string> | null {
  try {
    const raw = sessionStorage.getItem(ATTRIBUTION_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : null;
  } catch { return null; }
}
