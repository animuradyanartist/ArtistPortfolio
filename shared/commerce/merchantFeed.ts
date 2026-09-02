/**
 * GOOGLE MERCHANT CENTER product data source — a server-generated RSS 2.0 feed of the print shop.
 *
 * ONE SOURCE OF TRUTH. Every item is derived from the SAME purchasable-print collection the /prints
 * storefront and the print PDPs read (getPurchasablePrintCollection → its gate is isPubliclyPurchasable),
 * so the feed can never advertise a print the site does not sell, and the feed price is the SAME
 * starting price the PDP and its Product JSON-LD show. No duplicate catalogue, no hardcoded inventory.
 *
 * PRODUCT-LEVEL, NOT PER-VARIANT (deliberate). A print has several material×size variants at different
 * prices, but the current PDP does not resolve a variant from the URL — it shows the STARTING price.
 * Submitting per-variant items would land each on a page showing a different price and fail Google's
 * price-consistency check. So each print is ONE item at its starting price, which the landing page and
 * the Product JSON-LD state identically. (Per-variant items with item_group_id are a future step that
 * requires variant-aware SSR — see the PR notes.)
 *
 * NO GTIN. These are original artist-made fine-art prints; Google's rules say custom/handmade/art goods
 * legitimately have no GTIN, so `identifier_exists = no` with `brand = Ani Muradyan`. Nothing is invented.
 *
 * SAFE IMAGES ONLY. image_link is the first-party /img/print/:id/0 route — never a base64 blob and NEVER
 * the token-gated print master. The master URL is not an input to this module.
 *
 * Pure string work over a minimal item shape, so it is unit-tested directly without a database.
 */

export interface MerchantFeedItem {
  /** The print's stable database id — the feed id is `print-<id>`, unchanged across rebuilds. */
  id: number;
  title: string;
  slug: string;
  /** The starting price in minor units (cents) — the SAME value the PDP + Product JSON-LD show. */
  priceMinor: number;
  /** ISO 4217 code, e.g. "USD" — the currency of the starting-price variant. */
  currency: string;
}

export const MERCHANT_BRAND = "Ani Muradyan";

// Verified Google product taxonomy: 500044 — Home & Garden > Decor > Artwork > Posters, Prints, &
// Visual Artwork. The text path is used (Google accepts the path or the id); it is factual, not invented.
export const MERCHANT_GOOGLE_CATEGORY =
  "Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork";

const MERCHANT_PRODUCT_TYPE = "Fine Art Prints";

function xmlEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** "69.00 USD" — numeric value with two decimals + the ISO currency code, per Google's price format. */
export function merchantPrice(priceMinor: number, currency: string): string {
  return `${(priceMinor / 100).toFixed(2)} ${currency}`;
}

/** A factual description — giclée, archival paper, open edition; the original stays unique. No claims
 *  the site does not already make on every print page. */
export function merchantDescription(title: string): string {
  return (
    `Museum-quality giclée fine-art print of "${title}" by ${MERCHANT_BRAND} on archival ` +
    `Hahnemühle paper, printed to order with archival pigment inks. Open edition — the original ` +
    `painting remains a unique, one-of-a-kind work.`
  );
}

/** The public canonical PDP URL for a print — the landing page that states the same starting price. */
export function merchantLink(baseUrl: string, slug: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/prints/${slug}`;
}

/** The first-party display image — never base64, never the private master. */
export function merchantImageLink(baseUrl: string, printId: number): string {
  return `${baseUrl.replace(/\/+$/, "")}/img/print/${printId}/0`;
}

function feedItemXml(item: MerchantFeedItem, baseUrl: string): string {
  const e = xmlEscape;
  return [
    "    <item>",
    `      <g:id>print-${item.id}</g:id>`,
    `      <g:title>${e(`${item.title} — Fine Art Print`)}</g:title>`,
    `      <g:description>${e(merchantDescription(item.title))}</g:description>`,
    `      <g:link>${e(merchantLink(baseUrl, item.slug))}</g:link>`,
    `      <g:image_link>${e(merchantImageLink(baseUrl, item.id))}</g:image_link>`,
    `      <g:availability>in_stock</g:availability>`,
    `      <g:price>${e(merchantPrice(item.priceMinor, item.currency))}</g:price>`,
    `      <g:brand>${e(MERCHANT_BRAND)}</g:brand>`,
    `      <g:condition>new</g:condition>`,
    `      <g:identifier_exists>no</g:identifier_exists>`,
    `      <g:google_product_category>${e(MERCHANT_GOOGLE_CATEGORY)}</g:google_product_category>`,
    `      <g:product_type>${e(MERCHANT_PRODUCT_TYPE)}</g:product_type>`,
    "    </item>",
  ].join("\n");
}

/**
 * Build the RSS 2.0 product feed. ONLY genuinely purchasable, priced prints become items — an item
 * with no positive price is dropped rather than advertised as buyable. The caller passes the
 * purchasable-print collection; this function never decides purchasability itself.
 */
export function buildMerchantFeed(items: MerchantFeedItem[], baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const sellable = items.filter((i) => Number.isFinite(i.priceMinor) && i.priceMinor > 0 && i.slug);
  const body = sellable.map((i) => feedItemXml(i, base)).join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n` +
    `  <channel>\n` +
    `    <title>Ani Muradyan — Fine Art Prints</title>\n` +
    `    <link>${xmlEscape(base)}/prints</link>\n` +
    `    <description>Museum-quality giclée fine-art prints of original oil paintings by Ani Muradyan.</description>\n` +
    (body ? `${body}\n` : "") +
    `  </channel>\n` +
    `</rss>\n`
  );
}
