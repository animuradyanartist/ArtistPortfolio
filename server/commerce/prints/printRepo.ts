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
  type PrintAdminSummary,
  assessVariant,
  isPubliclyPurchasable,
  hasPurchasableVariant,
  startingPriceMinor,
  printAdminSummary,
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

/** The PRINT-OWNED master, mapped from a `prints` row's master_* columns. Null when the print has no
 *  master. The asset URL is a stable token-gated marker (the real signed URL is minted at fulfilment). */
function masterFromRow(r: any): PrintMasterView | null {
  if (!r || !r.master_asset_key) return null;
  return {
    status: (r.master_status as PrintMasterView["status"]) ?? "missing",
    widthPx: r.master_width_px ?? null,
    heightPx: r.master_height_px ?? null,
    printReadyAssetUrl: `/api/commerce/prints/master-file/${r.id}`,
    checksumMd5: r.master_checksum_md5 ?? null,
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
  const variants = await variantsFor(print.id);
  const master = masterFromRow(printRow);
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
    const variants = await variantsFor(print.id);
    const master = masterFromRow(r);
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

export interface AdminPrintOverviewRow {
  id: number;
  title: string;
  slug: string;
  image: string | null;
  imageCount: number;
  artworkId: number | null;
  artworkTitle: string | null;
  productStatus: string;
  summary: PrintAdminSummary;
}

/**
 * The ADMIN management-table read: every print product (all statuses, not just active) with its
 * DERIVED summary — materials, variant/enabled counts, starting price and the fail-closed status —
 * plus the source artwork's title. Nothing here is a stored "is live" or "starting price" flag; the
 * table cannot show a print as Published unless the same gate that guards checkout genuinely passes.
 */
export async function getAdminPrintsOverview(): Promise<AdminPrintOverviewRow[]> {
  // Local preview (no SQL) — read the same in-memory prints the legacy admin used, so a print created
  // in preview mode still appears in the admin list (commerce variants/masters live only in the DB, so
  // preview rows are summarised with none → correctly "draft"/"not-ready").
  if (!hasDatabase) {
    const { storage } = await import("../../storage");
    const all = await storage.getAllPrints();
    return all.map((p) => ({
      id: p.id,
      title: p.title,
      slug: printSlugOf({ slug: p.slug ?? null, title: p.title }),
      image: p.images?.[0] ?? null,
      imageCount: p.images?.length ?? 0,
      artworkId: p.artworkId ?? null,
      artworkTitle: null,
      productStatus: p.status,
      summary: printAdminSummary(p.status, [], null),
    }));
  }
  const { rows } = await pool.query(`SELECT * FROM prints ORDER BY position ASC, id ASC`);
  const out: AdminPrintOverviewRow[] = [];
  const titleCache = new Map<number, string | null>();
  for (const r of rows) {
    // PER-ROW resilience: one malformed row (or a transient sub-query failure) must NEVER blank the
    // whole admin list. A failed row is logged and skipped; every other print still lists.
    try {
      const print = mapPrint(r);
      const variants = await variantsFor(print.id);
      const master = masterFromRow(r);
      let artworkTitle: string | null = null;
      if (print.artworkId != null) {
        if (!titleCache.has(print.artworkId)) {
          const a = await pool.query(`SELECT title FROM artworks WHERE id = $1 LIMIT 1`, [print.artworkId]);
          titleCache.set(print.artworkId, a.rows[0]?.title ?? null);
        }
        artworkTitle = titleCache.get(print.artworkId) ?? null;
      }
      out.push({
        id: print.id,
        title: print.title,
        slug: printSlugOf(print),
        image: print.images[0] ?? null,
        imageCount: print.images.length,
        artworkId: print.artworkId,
        artworkTitle,
        productStatus: print.status,
        summary: printAdminSummary(print.status, variants, master),
      });
    } catch (err) {
      console.error(`[prints] overview row ${r?.id} failed, skipping:`, err instanceof Error ? err.message : err);
    }
  }
  return out;
}

/** The slug of a PURCHASABLE print product for a given artwork, or null. Powers the original →
 *  "Available as a fine-art print" cross-link — which only appears when a print can actually be bought. */
export async function purchasablePrintSlugForArtwork(artworkId: number): Promise<string | null> {
  if (!hasDatabase) return null;
  const { rows } = await pool.query(`SELECT * FROM prints WHERE status = 'active' AND artwork_id = $1`, [artworkId]);
  for (const r of rows) {
    const print = mapPrint(r);
    const variants = await variantsFor(print.id);
    const master = masterFromRow(r);
    if (hasPurchasableVariant(variants, master)) return printSlugOf(print);
  }
  return null;
}

/**
 * A print product + its variants + master in the SHARED shapes, by print id — for the admin editor's
 * readiness/publish logic. Unlike the public reads this does NOT filter by status (a draft must load).
 */
export async function getPrintAdminDetail(printId: number): Promise<PrintProductDetail | null> {
  if (!hasDatabase) return null;
  const { rows } = await pool.query(`SELECT * FROM prints WHERE id = $1 LIMIT 1`, [printId]);
  if (!rows[0]) return null;
  const print = mapPrint(rows[0]);
  const variants = await variantsFor(print.id);
  const master = masterFromRow(rows[0]);
  return { print, variants, master };
}

/** Set a print product's status (publish → 'active', unpublish → 'draft'). Returns false if absent. */
export async function setPrintStatus(printId: number, status: string): Promise<boolean> {
  if (!hasDatabase) return false;
  const { rowCount } = await pool.query(
    `UPDATE prints SET status = $2, updated_at = now() WHERE id = $1`,
    [printId, status],
  );
  return (rowCount ?? 0) > 0;
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
  const master = masterFromRow(printRows[0]);
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
    `SELECT pv.*, p.id AS product_print_id, p.title AS artwork_title, p.slug AS print_slug,
            p.artwork_id AS product_artwork_id,
            p.master_asset_key, p.master_status, p.master_width_px, p.master_height_px, p.master_checksum_md5
       FROM print_variants pv
       JOIN prints p ON p.id = pv.print_id AND p.status = 'active'`,
  );
  const inputs: FeedVariantInput[] = [];
  for (const r of rows) {
    // The master is the PRINT's own (from the joined prints row), not the artwork's.
    const master = masterFromRow({
      id: r.product_print_id, master_asset_key: r.master_asset_key, master_status: r.master_status,
      master_width_px: r.master_width_px, master_height_px: r.master_height_px, master_checksum_md5: r.master_checksum_md5,
    });
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
