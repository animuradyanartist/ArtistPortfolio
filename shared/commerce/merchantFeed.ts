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
  /** Total stored display images. Images 1..N-1 become additional_image_link (first-party /img/print
   *  refs — the SAME gallery images the PDP shows). Omit/undefined → only the primary image_link. */
  imageCount?: number | null;
}

// Google accepts up to 10 additional_image_link values per item.
const MAX_ADDITIONAL_IMAGES = 10;

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

/**
 * Additional product images (indexes 1..N-1), each the first-party /img/print ref of one of the
 * print's own stored gallery images — the same ones a shopper sees on the PDP. Capped at Google's
 * limit of 10. Empty when the print has one image or the count is unknown. Never the master.
 */
export function merchantAdditionalImageLinks(baseUrl: string, printId: number, imageCount?: number | null): string[] {
  if (typeof imageCount !== "number" || imageCount <= 1) return [];
  const base = baseUrl.replace(/\/+$/, "");
  const extra = Math.min(imageCount - 1, MAX_ADDITIONAL_IMAGES);
  return Array.from({ length: extra }, (_unused, i) => `${base}/img/print/${printId}/${i + 1}`);
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
    ...merchantAdditionalImageLinks(baseUrl, item.id, item.imageCount).map(
      (u) => `      <g:additional_image_link>${e(u)}</g:additional_image_link>`,
    ),
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

// ── ORIGINAL PAINTINGS ─────────────────────────────────────────────────────────────────────────
//
// The SAME feed also carries genuinely purchasable ORIGINAL paintings. Eligibility is decided ONCE
// upstream by the canonical `isPurchasableArtwork` gate (directSale on + a positive website price +
// a currency + availability exactly "available" + not reserved/committed + shipping enabled) — the
// same gate the artwork page, cart revalidation and Stripe checkout use, so the feed can never
// advertise a work the site will not sell. A sold or de-listed original simply stops being passed in
// and drops out on the next feed refresh (unique quantity: one work, in_stock while available).
//
// IDs are collision-safe: prints are `print-<id>`, originals are `original-<id>`. An original's price
// is its OWN website price (websitePriceMinor/websiteCurrency) — the exact figure the PDP shows and
// Stripe charges — NOT the marketplace `price`. Images are the first-party /img/artwork route (no
// print master exists for an artwork; nothing private is ever referenced).

const MERCHANT_ORIGINAL_PRODUCT_TYPE = "Original Paintings";

/** One per-destination shipping rate for a feed item — Google's RSS `g:shipping` shape. */
export interface MerchantShipping {
  /** ISO-2 destination (e.g. "DE"). */
  country: string;
  /** Shipping cost in minor units — the SAME figure the checkout estimator charges for this work. */
  priceMinor: number;
  /** ISO 4217 code (e.g. "EUR"). */
  currency: string;
}

export interface MerchantOriginalItem {
  /** The artwork's stable database id — the feed id is `original-<id>`. */
  id: number;
  title: string;
  /** The FULL canonical PDP path, already leading-slashed — `/{seoSlug}` or `/artworks/{slug}-{id}`
   *  (from artworkCanonicalPath). Used verbatim as the landing page, so it always matches the site. */
  path: string;
  /** The artist's own published description for the work, already plain text. Optional. */
  description?: string | null;
  /** "Oil" | "Acrylic" | "Mixed-Media" — the medium word placed in the title. */
  typeLabel: string;
  /** The WEBSITE sale price in minor units — what the PDP shows and Stripe charges. */
  priceMinor: number;
  /** ISO 4217 code of the website price (e.g. "EUR"). */
  currency: string;
  /** Total stored images → additional_image_link for 1..N-1 (first-party /img/artwork refs). */
  imageCount?: number | null;
  /** Per-destination shipping rates, one per launch country — each the checkout estimator's exact
   *  figure for this work. Emitted as g:shipping so Google shows the true shipping, never a flat guess. */
  shipping?: MerchantShipping[];
  /** OPTIONAL: the exact Merchant Center return-policy label to map this work to a non-default return
   *  policy (originals use a different policy from made-to-order prints). Emitted as g:return_policy_label
   *  ONLY when set to a real, existing Merchant-side label; empty/undefined → the account default policy.
   *  Never hard-coded here — the value comes from config once the owner creates the policy. */
  returnPolicyLabel?: string | null;
}

/** "Blue Drift — Original Oil Painting". */
export function merchantOriginalTitle(title: string, typeLabel: string): string {
  const label = typeLabel.trim();
  return label ? `${title} — Original ${label} Painting` : `${title} — Original Painting`;
}

/** A factual description — never invented visual detail. Uses the artist's own copy when present. */
export function merchantOriginalDescription(item: MerchantOriginalItem): string {
  const own = (item.description ?? "").replace(/\s+/g, " ").trim();
  if (own) return own;
  const label = item.typeLabel.trim().toLowerCase();
  return `Original ${label ? `${label} ` : ""}painting "${item.title}" by ${MERCHANT_BRAND} — a unique, one-of-a-kind work.`;
}

/** The public canonical artwork PDP URL — the landing page that states the same website price.
 *  `path` is the full canonical path (`/{seoSlug}` or `/artworks/{slug}-{id}`), used verbatim. */
export function merchantOriginalLink(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

/** First-party artwork display image. Never a print master (artworks have none) or a private asset. */
export function merchantOriginalImageLink(baseUrl: string, artworkId: number): string {
  return `${baseUrl.replace(/\/+$/, "")}/img/artwork/${artworkId}/0`;
}

/** Additional first-party artwork images (indexes 1..N-1), capped at Google's limit of 10. */
export function merchantOriginalAdditionalImageLinks(baseUrl: string, artworkId: number, imageCount?: number | null): string[] {
  if (typeof imageCount !== "number" || imageCount <= 1) return [];
  const base = baseUrl.replace(/\/+$/, "");
  const extra = Math.min(imageCount - 1, MAX_ADDITIONAL_IMAGES);
  return Array.from({ length: extra }, (_unused, i) => `${base}/img/artwork/${artworkId}/${i + 1}`);
}

function originalItemXml(item: MerchantOriginalItem, baseUrl: string): string {
  const e = xmlEscape;
  return [
    "    <item>",
    `      <g:id>original-${item.id}</g:id>`,
    `      <g:title>${e(merchantOriginalTitle(item.title, item.typeLabel))}</g:title>`,
    `      <g:description>${e(merchantOriginalDescription(item))}</g:description>`,
    `      <g:link>${e(merchantOriginalLink(baseUrl, item.path))}</g:link>`,
    `      <g:image_link>${e(merchantOriginalImageLink(baseUrl, item.id))}</g:image_link>`,
    ...merchantOriginalAdditionalImageLinks(baseUrl, item.id, item.imageCount).map(
      (u) => `      <g:additional_image_link>${e(u)}</g:additional_image_link>`,
    ),
    // A unique original is a single, brand-new work by the artist. It is in_stock while available;
    // once sold it is not passed to this builder at all, so it never advertises as buyable.
    `      <g:availability>in_stock</g:availability>`,
    `      <g:price>${e(merchantPrice(item.priceMinor, item.currency))}</g:price>`,
    // Exact per-destination shipping — the SAME figure the checkout estimator charges for THIS work,
    // so Google never shows a shipping cost lower than checkout. One block per launch country.
    ...(item.shipping ?? []).flatMap((s) => [
      "      <g:shipping>",
      `        <g:country>${e(s.country)}</g:country>`,
      `        <g:price>${e(merchantPrice(s.priceMinor, s.currency))}</g:price>`,
      "      </g:shipping>",
    ]),
    `      <g:brand>${e(MERCHANT_BRAND)}</g:brand>`,
    `      <g:condition>new</g:condition>`,
    `      <g:identifier_exists>no</g:identifier_exists>`,
    `      <g:google_product_category>${e(MERCHANT_GOOGLE_CATEGORY)}</g:google_product_category>`,
    `      <g:product_type>${e(MERCHANT_ORIGINAL_PRODUCT_TYPE)}</g:product_type>`,
    // Maps originals to their own Merchant return policy — emitted ONLY when a real label is configured;
    // otherwise nothing is written and Google applies the account default policy.
    ...((item.returnPolicyLabel ?? "").trim()
      ? [`      <g:return_policy_label>${e((item.returnPolicyLabel ?? "").trim())}</g:return_policy_label>`]
      : []),
    "    </item>",
  ].join("\n");
}

/**
 * Build the RSS 2.0 product feed. ONLY genuinely purchasable, priced items become entries — anything
 * without a positive price or slug is dropped rather than advertised as buyable. The caller passes the
 * already-filtered purchasable print collection and (optionally) the already-filtered purchasable
 * originals; this function never decides purchasability itself. Prints and originals share ONE feed
 * with collision-safe ids (`print-<id>` / `original-<id>`); the print output is byte-for-byte
 * unchanged when no originals are passed.
 */
export function buildMerchantFeed(
  items: MerchantFeedItem[],
  baseUrl: string,
  originals: MerchantOriginalItem[] = [],
): string {
  const base = baseUrl.replace(/\/+$/, "");
  const sellablePrints = items.filter((i) => Number.isFinite(i.priceMinor) && i.priceMinor > 0 && i.slug);
  const sellableOriginals = originals.filter((i) => Number.isFinite(i.priceMinor) && i.priceMinor > 0 && i.path);
  const printBody = sellablePrints.map((i) => feedItemXml(i, base)).join("\n");
  const originalBody = sellableOriginals.map((i) => originalItemXml(i, base)).join("\n");
  const body = [printBody, originalBody].filter(Boolean).join("\n");
  const hasOriginals = sellableOriginals.length > 0;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n` +
    `  <channel>\n` +
    `    <title>Ani Muradyan — ${hasOriginals ? "Fine Art Prints &amp; Original Paintings" : "Fine Art Prints"}</title>\n` +
    `    <link>${xmlEscape(base)}/prints</link>\n` +
    `    <description>${hasOriginals
      ? "Original oil paintings and museum-quality giclée fine-art prints by Armenian contemporary artist Ani Muradyan."
      : "Museum-quality giclée fine-art prints of original oil paintings by Ani Muradyan."}</description>\n` +
    (body ? `${body}\n` : "") +
    `  </channel>\n` +
    `</rss>\n`
  );
}
