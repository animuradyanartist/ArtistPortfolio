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
 *
 * META PIXEL RIDES ALONG. Where GA4 fires view_item / add_to_cart / begin_checkout / purchase, the
 * matching Meta standard event (ViewContent / AddToCart / InitiateCheckout / Purchase) fires from the
 * SAME place via `metaTrack`, so the two never drift. Meta is a no-op unless its pixel loaded (US /
 * non-EU only — see metaPixel.ts). Still NO PII: only product ids / value / currency reach Meta.
 */
import { metaTrack } from "./metaPixel";

type Gtag = (...args: unknown[]) => void;

function gtag(): Gtag | null {
  const g = (window as unknown as { gtag?: Gtag }).gtag;
  return typeof g === "function" ? g : null;
}

interface ItemInput {
  id: number;
  title: string;
  priceMinor?: number | null;
  currency?: string;
  /** Defaults to "original-artwork"; a print passes "fine-art-print". */
  category?: string;
  quantity?: number;
  // ── print-only enrichment (all optional; ignored for originals) ──
  printProductId?: number;
  printVariantId?: number;
  artworkId?: number | null;
  material?: string;
  size?: string;
  frame?: string;
}

const toItem = (i: ItemInput) => ({
  item_id: String(i.printVariantId ?? i.id),
  item_name: i.title,
  item_category: i.category ?? "original-artwork",
  price: typeof i.priceMinor === "number" ? i.priceMinor / 100 : undefined,
  quantity: i.quantity ?? 1,
  // GA4 recognises item_variant; the rest are custom params kept intentionally flat.
  ...(i.size || i.frame ? { item_variant: [i.size, i.frame].filter(Boolean).join(" · ") } : {}),
  ...(i.category === "fine-art-print"
    ? {
        item_type: "print",
        print_product_id: i.printProductId,
        print_variant_id: i.printVariantId,
        artwork_id: i.artworkId ?? undefined,
        material: i.material,
        size: i.size,
        frame: i.frame,
      }
    : {}),
});

/** Marker for a print item, so callers don't have to remember the category string. */
export function printItem(i: Omit<ItemInput, "category">): ItemInput {
  return { ...i, category: "fine-art-print" };
}

// ── Meta Pixel params from the SAME items GA4 uses — product ids / value / currency only, no PII.
//    The Meta content id matches GA4's item_id (printVariantId ?? id), so the two systems agree. ──
const metaContentIds = (items: ItemInput[]): string[] => items.map((i) => String(i.printVariantId ?? i.id));
const metaContents = (items: ItemInput[]): Array<{ id: string; quantity: number }> =>
  items.map((i) => ({ id: String(i.printVariantId ?? i.id), quantity: i.quantity ?? 1 }));
const minorToMajor = (minor?: number | null): number | undefined =>
  typeof minor === "number" ? minor / 100 : undefined;

/** ViewContent / AddToCart share this single-item body (mirrors the GA4 value: unit price). */
function metaProductBody(i: ItemInput): Record<string, unknown> {
  return {
    content_type: "product",
    content_ids: metaContentIds([i]),
    content_name: i.title,
    contents: metaContents([i]),
    value: minorToMajor(i.priceMinor),
    currency: i.currency ?? "EUR",
  };
}

export function trackViewItem(i: ItemInput): void {
  gtag()?.("event", "view_item", {
    currency: i.currency ?? "EUR",
    value: typeof i.priceMinor === "number" ? i.priceMinor / 100 : undefined,
    items: [toItem(i)],
  });
  metaTrack("ViewContent", metaProductBody(i));
}

export function trackAddToCart(i: ItemInput): void {
  gtag()?.("event", "add_to_cart", {
    currency: i.currency ?? "EUR",
    value: typeof i.priceMinor === "number" ? i.priceMinor / 100 : undefined,
    items: [toItem(i)],
  });
  metaTrack("AddToCart", metaProductBody(i));
}

export function trackBeginCheckout(items: ItemInput[], totalMinor: number, currency: string): void {
  gtag()?.("event", "begin_checkout", {
    currency, value: totalMinor / 100, items: items.map(toItem),
  });
  metaTrack("InitiateCheckout", {
    content_type: "product",
    content_ids: metaContentIds(items),
    contents: metaContents(items),
    num_items: items.reduce((n, i) => n + (i.quantity ?? 1), 0),
    value: totalMinor / 100,
    currency,
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
  // Meta Purchase fires from the SAME once-per-order guard above (localStorage `am.purchases.v1`),
  // so it can never double-count a refresh/re-share. The order reference is passed as `eventID` for
  // Meta's own dedup and to pre-wire server-side (CAPI) dedup later. Only reached because the caller
  // (OrderConfirmationPage) already confirmed paymentStatus === "paid" — see that page.
  metaTrack(
    "Purchase",
    {
      content_type: "product",
      content_ids: metaContentIds(args.items),
      contents: metaContents(args.items),
      value: args.totalMinor / 100,
      currency: args.currency,
    },
    { eventID: args.reference },
  );
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

// ── PRINT ecommerce events. Same GA4, same `toItem`, so the print funnel reports beside the
//    originals'. `purchase` is NOT re-implemented here — a print purchase reuses
//    `trackPurchaseOnce` (with `printItem(...)`) so it can never double-fire. ─────────────────

/** view_item on a print PDP. */
export function trackViewItemPrint(i: Omit<ItemInput, "category">): void {
  const item = printItem(i);
  gtag()?.("event", "view_item", {
    currency: i.currency ?? "EUR",
    value: typeof i.priceMinor === "number" ? i.priceMinor / 100 : undefined,
    items: [toItem(item)],
  });
  metaTrack("ViewContent", metaProductBody(item));
}

/** select_item when a shopper picks a material/size/frame in the configurator. */
export function trackSelectItemPrint(i: Omit<ItemInput, "category">): void {
  gtag()?.("event", "select_item", {
    item_list_id: "print-configurator",
    item_list_name: "Print configurator",
    items: [toItem(printItem(i))],
  });
}

/** add_to_cart when a shopper adds a print to the cart. Mirrors `trackAddToCart` for the print funnel. */
export function trackAddToCartPrint(i: Omit<ItemInput, "category">): void {
  const item = printItem(i);
  gtag()?.("event", "add_to_cart", {
    currency: i.currency ?? "EUR",
    value: typeof i.priceMinor === "number" ? i.priceMinor / 100 : undefined,
    items: [toItem(item)],
  });
  metaTrack("AddToCart", metaProductBody(item));
}

/** begin_checkout when a shopper starts buying a print. */
export function trackBeginCheckoutPrint(i: Omit<ItemInput, "category">, totalMinor: number, currency: string): void {
  const item = printItem(i);
  gtag()?.("event", "begin_checkout", {
    currency, value: totalMinor / 100, items: [toItem(item)],
  });
  metaTrack("InitiateCheckout", {
    content_type: "product",
    content_ids: metaContentIds([item]),
    contents: metaContents([item]),
    num_items: item.quantity ?? 1,
    value: totalMinor / 100,
    currency,
  });
}

/**
 * PINTEREST SAVE — a lightweight engagement event on the SAME GA4 the site already loads. It is
 * not an ecommerce/`items` event: saving a Pin is a share intent, not a cart action, so it stays a
 * flat custom event and never touches value/currency/purchase. No cookie, no PII — the same rules
 * as every other call here. Fired when a visitor clicks "Save to Pinterest" on an artwork/print PDP.
 */
export function trackPinterestSaveClick(a: {
  itemId: number | string;
  itemName: string;
  /** "original" for an artwork PDP, "print" for a print PDP. */
  itemType: "original" | "print";
  /**
   * The SOURCE original artwork id. A print passes its `data.artworkId` here so `artwork_id` is the
   * original the print reproduces — matching `toItem`'s convention — never the print product id.
   * Omit for an original: `artwork_id` then falls back to its own (numeric) item id.
   */
  artworkId?: number | null;
  pageLocation: string;
}): void {
  // print → the source artwork id (omitted when the print has no linked original);
  // original → the artwork itself (its numeric item id), unchanged from before.
  const artwork_id =
    a.itemType === "print"
      ? a.artworkId ?? undefined
      : typeof a.itemId === "number"
        ? a.itemId
        : undefined;
  gtag()?.("event", "pinterest_save_click", {
    item_id: String(a.itemId),
    artwork_id,
    item_name: a.itemName,
    item_type: a.itemType,
    page_location: a.pageLocation,
  });
}
