/**
 * PRINT REPOSITORY — the ONLY place that reads print products, variants and masters from the
 * database for commerce. Raw SQL against pool for the same reason orders.ts / reservation.ts are:
 * these tables are created by the boot self-heal and the app may never have seen a migration.
 *
 * Every public read is gated through the pure `printProduct` rules, so the storefront, the PDP,
 * the sitemap and the feed cannot disagree about what is sellable. Fails closed with no database.
 */

import { pool, hasDatabase } from "../../db";
import {
  type PrintVariantView,
  type PrintMasterView,
  assessVariant,
  isPubliclyPurchasable,
  hasPurchasableVariant,
  startingPriceMinor,
} from "@shared/commerce/printProduct";
import type { FeedVariantInput } from "@shared/commerce/printFeed";
import { toSlug } from "@shared/canonical";

export interface PrintProductRow {
  id: number;
  title: string;
  slug: string | null;
  description: string;
  images: string[];
  artworkId: number | null;
  status: string;
}

export interface PrintProductDetail {
  print: PrintProductRow;
  variants: PrintVariantView[];
  master: PrintMasterView | null;
}

function mapVariant(r: any): PrintVariantView {
  return {
    id: r.id,
    printId: r.print_id,
    material: r.material,
    prodigiSku: r.prodigi_sku,
    sizeLabel: r.size_label,
    widthCm: r.width_cm,
    heightCm: r.height_cm,
    framed: r.framed,
    frameColour: r.frame_colour ?? null,
    retailMinor: r.retail_minor ?? null,
    currency: r.currency ?? "EUR",
    printReadyAssetUrl: r.print_ready_asset_url ?? null,
    mockups: r.mockups ?? null,
    effectiveDpi: r.effective_dpi ?? null,
    eligible: Boolean(r.eligible),
    enabled: Boolean(r.enabled),
    prodigiVerified: Boolean(r.prodigi_verified),
  };
}

function mapMaster(r: any): PrintMasterView {
  return {
    status: (r.status as PrintMasterView["status"]) ?? "missing",
    widthPx: r.width_px ?? null,
    heightPx: r.height_px ?? null,
    printReadyAssetUrl: r.print_ready_asset_url ?? null,
    checksumMd5: r.checksum_md5 ?? null,
  };
}

function mapPrint(r: any): PrintProductRow {
  return {
    id: r.id,
    title: r.title,
    slug: r.slug ?? null,
    description: r.description,
    images: r.images ?? [],
    artworkId: r.artwork_id ?? null,
    status: r.status,
  };
}

/** The canonical slug for a print product row (its stored slug, else derived from the title). */
export function printSlugOf(p: { slug: string | null; title: string }): string {
  return (p.slug && p.slug.trim()) || toSlug(p.title);
}

async function variantsFor(printId: number): Promise<PrintVariantView[]> {
  const { rows } = await pool.query(
    `SELECT * FROM print_variants WHERE print_id = $1 ORDER BY width_cm ASC, framed ASC, id ASC`,
    [printId],
  );
  return rows.map(mapVariant);
}

async function masterFor(artworkId: number | null): Promise<PrintMasterView | null> {
  if (artworkId == null) return null;
  const { rows } = await pool.query(`SELECT * FROM print_masters WHERE artwork_id = $1 LIMIT 1`, [artworkId]);
  return rows[0] ? mapMaster(rows[0]) : null;
}

/** A single print product with its variants + the master behind it. Null if not found. */
export async function getPrintDetailBySlug(slug: string): Promise<PrintProductDetail | null> {
  if (!hasDatabase) return null;
  const wanted = slug.trim().toLowerCase();
  // Match either the stored slug or the derived slug (title-based) so links stay stable.
  const { rows } = await pool.query(
    `SELECT * FROM prints WHERE status = 'active' AND (lower(slug) = $1 OR $1 = '')`,
    [wanted],
  );
  let printRow = rows.find((r) => (r.slug ? r.slug.toLowerCase() === wanted : false));
  if (!printRow) {
    // Fall back to a title-derived slug scan (bounded: the catalogue is tiny).
    const all = await pool.query(`SELECT * FROM prints WHERE status = 'active'`);
    printRow = all.rows.find((r) => printSlugOf(mapPrint(r)) === wanted);
  }
  if (!printRow) return null;
  const print = mapPrint(printRow);
  const [variants, master] = await Promise.all([variantsFor(print.id), masterFor(print.artworkId)]);
  return { print, variants, master };
}

export interface PrintCollectionCard {
  id: number;
  title: string;
  slug: string;
  image: string | null;
  artworkId: number | null;
  startingPriceMinor: number | null;
  currency: string;
}

/**
 * The storefront collection — ONLY print products that have at least one genuinely purchasable
 * variant. Today that is none (no master is ready), so the collection is correctly empty and the
 * page shows its "coming soon" state rather than exposing unready products.
 */
export async function getPurchasablePrintCollection(): Promise<PrintCollectionCard[]> {
  if (!hasDatabase) return [];
  const { rows } = await pool.query(`SELECT * FROM prints WHERE status = 'active' ORDER BY position ASC, id ASC`);
  const cards: PrintCollectionCard[] = [];
  for (const r of rows) {
    const print = mapPrint(r);
    const [variants, master] = await Promise.all([variantsFor(print.id), masterFor(print.artworkId)]);
    if (!hasPurchasableVariant(variants, master)) continue;
    const currency = variants.find((v) => isPubliclyPurchasable(v, master))?.currency ?? "EUR";
    cards.push({
      id: print.id,
      title: print.title,
      slug: printSlugOf(print),
      image: print.images[0] ?? (variants.find((v) => v.mockups?.length)?.mockups?.[0] ?? null),
      artworkId: print.artworkId,
      startingPriceMinor: startingPriceMinor(variants, master),
      currency,
    });
  }
  return cards;
}

export interface CheckoutVariant {
  print: PrintProductRow;
  variant: PrintVariantView;
  master: PrintMasterView | null;
}

/**
 * Resolve a variant for CHECKOUT — the server's authoritative read. Returns the variant, its
 * print and its master together with the pure assessment, so the checkout route can refuse a
 * disabled, ineligible, unpriced or master-less variant without trusting anything from the client.
 */
export async function getVariantForCheckout(variantId: number): Promise<CheckoutVariant | null> {
  if (!hasDatabase) return null;
  const { rows } = await pool.query(`SELECT * FROM print_variants WHERE id = $1 LIMIT 1`, [variantId]);
  if (!rows[0]) return null;
  const variant = mapVariant(rows[0]);
  const { rows: printRows } = await pool.query(
    `SELECT * FROM prints WHERE id = $1 AND status = 'active' LIMIT 1`,
    [variant.printId],
  );
  if (!printRows[0]) return null;
  const print = mapPrint(printRows[0]);
  const master = await masterFor(print.artworkId);
  return { print, variant, master };
}

export { assessVariant };

/**
 * Every variant, as feed input rows. The pure feed builder filters these to only the genuinely
 * sellable ones — so the feed is correct even while this returns provisional rows.
 */
export async function getPrintFeedInputs(): Promise<FeedVariantInput[]> {
  if (!hasDatabase) return [];
  const { rows } = await pool.query(
    `SELECT pv.*, p.title AS artwork_title, p.slug AS print_slug, p.artwork_id AS product_artwork_id
       FROM print_variants pv
       JOIN prints p ON p.id = pv.print_id AND p.status = 'active'`,
  );
  const inputs: FeedVariantInput[] = [];
  // Cache masters per artwork so a big catalogue doesn't re-query.
  const masterCache = new Map<number, PrintMasterView | null>();
  for (const r of rows) {
    const artworkId = r.product_artwork_id ?? null;
    let master: PrintMasterView | null = null;
    if (artworkId != null) {
      if (!masterCache.has(artworkId)) masterCache.set(artworkId, await masterFor(artworkId));
      master = masterCache.get(artworkId) ?? null;
    }
    const v = mapVariant(r);
    const assessment = assessVariant(v, master);
    inputs.push({
      variantId: v.id,
      printSlug: printSlugOf({ slug: r.print_slug ?? null, title: r.artwork_title }),
      artworkTitle: r.artwork_title,
      material: v.material,
      sizeLabel: v.sizeLabel,
      widthCm: v.widthCm,
      heightCm: v.heightCm,
      framed: v.framed,
      frameColour: v.frameColour,
      retailMinor: v.retailMinor,
      currency: v.currency,
      printReadyAssetUrl: v.printReadyAssetUrl || master?.printReadyAssetUrl || null,
      mockupUrl: v.mockups?.[0] ?? null,
      // The feed's own gate is enabled + eligible + priced + asset; we additionally require a
      // ready master so a low-res product can never leak in even if flags were set by hand.
      eligible: v.eligible && assessment.state === "purchasable",
      enabled: v.enabled,
    });
  }
  return inputs;
}
