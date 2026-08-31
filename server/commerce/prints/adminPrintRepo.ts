/**
 * ADMIN PRINT REPOSITORY — the DB writes behind print-variant + master management. Raw SQL against
 * pool, matching the rest of commerce (these tables are created by the boot self-heal). Every
 * physical/eligibility field written here comes from `adminPrintService` (SKU-driven), never from
 * the request body.
 */

import { pool, hasDatabase } from "../../db";
import { deriveVariantFields } from "./adminPrintService";
import type { DerivedVariantFields, VariantSaveInput, MasterDims, NormalizedCrop } from "./adminPrintService";

export interface AdminVariantRow {
  id: number;
  print_id: number;
  material: string;
  prodigi_sku: string;
  size_label: string;
  width_cm: number;
  height_cm: number;
  framed: boolean;
  frame_colour: string | null;
  retail_minor: number | null;
  currency: string;
  print_ready_asset_url: string | null;
  effective_dpi: number | null;
  min_dpi: number | null;
  eligible: boolean;
  enabled: boolean;
  prodigi_verified: boolean;
  crop_x: number | null;
  crop_y: number | null;
  crop_w: number | null;
  crop_h: number | null;
}

/** The normalized crop for a variant row, or null when no crop is stored. */
export function cropFromRow(r: Pick<AdminVariantRow, "crop_x" | "crop_y" | "crop_w" | "crop_h">): NormalizedCrop | null {
  if (r.crop_x == null || r.crop_y == null || r.crop_w == null || r.crop_h == null) return null;
  return { x: Number(r.crop_x), y: Number(r.crop_y), w: Number(r.crop_w), h: Number(r.crop_h) };
}

export interface MasterMeta extends MasterDims {
  note: string | null;
  assetKey: string | null;
  assetFilename: string | null;
  contentType: string | null;
  byteSize: number | null;
  checksumMd5: string | null;
  hasAsset: boolean;
}

export async function getMaster(artworkId: number): Promise<MasterMeta | null> {
  if (!hasDatabase) return null;
  // Reference + metadata only — the master BYTES live on the persistent disk, never in this row.
  const { rows } = await pool.query(
    `SELECT width_px, height_px, status, print_ready_asset_url, note,
            asset_key, asset_filename, content_type, byte_size, checksum_md5
       FROM print_masters WHERE artwork_id = $1 LIMIT 1`,
    [artworkId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    widthPx: r.width_px ?? null,
    heightPx: r.height_px ?? null,
    status: r.status ?? "missing",
    printReadyAssetUrl: r.print_ready_asset_url ?? null,
    note: r.note ?? null,
    assetKey: r.asset_key ?? null,
    assetFilename: r.asset_filename ?? null,
    contentType: r.content_type ?? null,
    byteSize: r.byte_size != null ? Number(r.byte_size) : null,
    checksumMd5: r.checksum_md5 ?? null,
    hasAsset: Boolean(r.asset_key),
  };
}

/** Store the REFERENCE + metadata for a master whose bytes were just written to the persistent disk.
 *  `print_ready_asset_url` is a stable, token-gated relative path (a "master exists" marker) — the
 *  real signed download URL is generated fresh at fulfilment time, never stored. asset_data is left
 *  untouched/NULL: bytes never go into Postgres. */
export async function upsertMasterFile(
  artworkId: number,
  m: {
    widthPx: number; heightPx: number; assetKey: string; assetFilename: string;
    contentType: string; byteSize: number; checksumMd5: string; status: string; markerUrl: string;
  },
): Promise<void> {
  if (!hasDatabase) return; // local preview has no commerce DB; the file still lands on disk
  await pool.query(
    `INSERT INTO print_masters
       (artwork_id, width_px, height_px, print_ready_asset_url, asset_key, asset_filename, content_type, byte_size, checksum_md5, status, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
     ON CONFLICT (artwork_id) DO UPDATE SET
       width_px = EXCLUDED.width_px, height_px = EXCLUDED.height_px,
       print_ready_asset_url = EXCLUDED.print_ready_asset_url, asset_key = EXCLUDED.asset_key,
       asset_filename = EXCLUDED.asset_filename, content_type = EXCLUDED.content_type,
       byte_size = EXCLUDED.byte_size, checksum_md5 = EXCLUDED.checksum_md5,
       asset_data = NULL, status = EXCLUDED.status, updated_at = now()`,
    [artworkId, m.widthPx, m.heightPx, m.markerUrl, m.assetKey, m.assetFilename, m.contentType, m.byteSize, m.checksumMd5, m.status],
  );
}

/** Clear a master back to 'missing' (the editor's "remove" action). File deletion is done by the route. */
export async function clearMaster(artworkId: number): Promise<void> {
  if (!hasDatabase) return;
  await pool.query(
    `UPDATE print_masters SET width_px = NULL, height_px = NULL, print_ready_asset_url = NULL,
       asset_key = NULL, asset_filename = NULL, content_type = NULL, byte_size = NULL, checksum_md5 = NULL,
       asset_data = NULL, status = 'missing', updated_at = now()
     WHERE artwork_id = $1`,
    [artworkId],
  );
}

// ── PRINT-OWNED master (the ACTIVE model): the master lives on the `prints` row (master_* columns),
//    keyed by printId. Two prints of the same artwork have independent masters. ──

/** The print's own master, or null. Reads reference + metadata from the prints row (never bytes). */
export async function getPrintMaster(printId: number): Promise<MasterMeta | null> {
  if (!hasDatabase) return null;
  const { rows } = await pool.query(
    `SELECT master_width_px, master_height_px, master_status, master_asset_key,
            master_filename, master_content_type, master_byte_size, master_checksum_md5
       FROM prints WHERE id = $1 LIMIT 1`,
    [printId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    widthPx: r.master_width_px ?? null,
    heightPx: r.master_height_px ?? null,
    status: r.master_status ?? "missing",
    // A stable, token-gated relative marker so the purchasability gate sees an asset when one exists;
    // the real signed URL is minted fresh at fulfilment. Null when there is no master.
    printReadyAssetUrl: r.master_asset_key ? `/api/commerce/prints/master-file/${printId}` : null,
    note: null,
    assetKey: r.master_asset_key ?? null,
    assetFilename: r.master_filename ?? null,
    contentType: r.master_content_type ?? null,
    byteSize: r.master_byte_size != null ? Number(r.master_byte_size) : null,
    checksumMd5: r.master_checksum_md5 ?? null,
    hasAsset: Boolean(r.master_asset_key),
  };
}

/** Store the reference + metadata of a master whose bytes were just written to disk under this print. */
export async function upsertPrintMasterFile(
  printId: number,
  m: { widthPx: number; heightPx: number; assetKey: string; assetFilename: string;
       contentType: string; byteSize: number; checksumMd5: string; status: string },
): Promise<void> {
  if (!hasDatabase) return;
  await pool.query(
    `UPDATE prints SET
       master_width_px = $2, master_height_px = $3, master_asset_key = $4, master_filename = $5,
       master_content_type = $6, master_byte_size = $7, master_checksum_md5 = $8, master_status = $9,
       updated_at = now()
     WHERE id = $1`,
    [printId, m.widthPx, m.heightPx, m.assetKey, m.assetFilename, m.contentType, m.byteSize, m.checksumMd5, m.status],
  );
}

/** Clear the print's master back to 'missing' (file deletion is done by the route). */
export async function clearPrintMaster(printId: number): Promise<void> {
  if (!hasDatabase) return;
  await pool.query(
    `UPDATE prints SET master_width_px = NULL, master_height_px = NULL, master_asset_key = NULL,
       master_filename = NULL, master_content_type = NULL, master_byte_size = NULL,
       master_checksum_md5 = NULL, master_status = 'missing', updated_at = now()
     WHERE id = $1`,
    [printId],
  );
}

/** The print's disk reference (key + metadata) for the fulfilment-facing download route. No bytes. */
export async function getPrintMasterRef(printId: number): Promise<{ assetKey: string; filename: string | null; contentType: string | null } | null> {
  if (!hasDatabase) return null;
  const { rows } = await pool.query(`SELECT master_asset_key, master_filename, master_content_type FROM prints WHERE id = $1 LIMIT 1`, [printId]);
  const r = rows[0];
  if (!r || !r.master_asset_key) return null;
  return { assetKey: r.master_asset_key as string, filename: r.master_filename ?? null, contentType: r.master_content_type ?? null };
}

/** The disk REFERENCE (key + metadata) for the fulfilment-facing download route. No bytes. */
export async function getMasterRef(artworkId: number): Promise<{ assetKey: string; filename: string | null; contentType: string | null } | null> {
  if (!hasDatabase) return null;
  const { rows } = await pool.query(`SELECT asset_key, asset_filename, content_type FROM print_masters WHERE artwork_id = $1 LIMIT 1`, [artworkId]);
  const r = rows[0];
  if (!r || !r.asset_key) return null;
  return { assetKey: r.asset_key as string, filename: r.asset_filename ?? null, contentType: r.content_type ?? null };
}

export async function upsertMaster(
  artworkId: number,
  m: { widthPx: number | null; heightPx: number | null; printReadyAssetUrl: string | null; checksumMd5: string | null; status: string; note: string | null },
): Promise<void> {
  await pool.query(
    `INSERT INTO print_masters (artwork_id, width_px, height_px, print_ready_asset_url, checksum_md5, status, note, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (artwork_id) DO UPDATE SET
       width_px = EXCLUDED.width_px, height_px = EXCLUDED.height_px,
       print_ready_asset_url = EXCLUDED.print_ready_asset_url, checksum_md5 = EXCLUDED.checksum_md5,
       status = EXCLUDED.status, note = EXCLUDED.note, updated_at = now()`,
    [artworkId, m.widthPx, m.heightPx, m.printReadyAssetUrl, m.checksumMd5, m.status, m.note],
  );
}

export async function listVariants(printId: number): Promise<AdminVariantRow[]> {
  if (!hasDatabase) return [];
  const { rows } = await pool.query(
    `SELECT * FROM print_variants WHERE print_id = $1 ORDER BY material, width_cm, framed, id`, [printId],
  );
  return rows as AdminVariantRow[];
}

export async function getVariant(id: number): Promise<AdminVariantRow | null> {
  if (!hasDatabase) return null;
  const { rows } = await pool.query(`SELECT * FROM print_variants WHERE id = $1 LIMIT 1`, [id]);
  return (rows[0] as AdminVariantRow) ?? null;
}

type PersistRow = DerivedVariantFields & VariantSaveInput & { minDpi: number };

/** Persist a validated, server-derived variant. `prodigi_verified` is true — the SKU is from the
 *  sandbox-verified catalogue (validation guarantees it). */
export async function createVariant(printId: number, row: PersistRow): Promise<AdminVariantRow> {
  const { rows } = await pool.query(
    `INSERT INTO print_variants
       (print_id, material, prodigi_sku, size_label, width_cm, height_cm, framed, frame_colour,
        retail_minor, currency, print_ready_asset_url, effective_dpi, min_dpi, eligible, enabled, prodigi_verified)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true)
     RETURNING *`,
    [
      printId, row.material, row.sku, row.sizeLabel, Math.round(row.widthCm), Math.round(row.heightCm),
      row.framed, row.frameColour, row.retailMinor, row.currency, row.printReadyAssetUrl,
      row.effectiveDpi, row.minDpi, row.eligible, row.enabled,
    ],
  );
  return rows[0] as AdminVariantRow;
}

export async function updateVariant(id: number, row: PersistRow): Promise<AdminVariantRow | null> {
  const { rows } = await pool.query(
    `UPDATE print_variants SET
       material=$2, prodigi_sku=$3, size_label=$4, width_cm=$5, height_cm=$6, framed=$7, frame_colour=$8,
       retail_minor=$9, currency=$10, print_ready_asset_url=$11, effective_dpi=$12, min_dpi=$13,
       eligible=$14, enabled=$15, prodigi_verified=true, updated_at=now()
     WHERE id=$1 RETURNING *`,
    [
      id, row.material, row.sku, row.sizeLabel, Math.round(row.widthCm), Math.round(row.heightCm),
      row.framed, row.frameColour, row.retailMinor, row.currency, row.printReadyAssetUrl,
      row.effectiveDpi, row.minDpi, row.eligible, row.enabled,
    ],
  );
  return (rows[0] as AdminVariantRow) ?? null;
}

export async function deleteVariant(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM print_variants WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

/** Does this print already have a variant for this SKU? (Prevents duplicate material+size options —
 *  a print SKU is 1:1 with a physical product, so two rows for the same SKU are always a mistake.) */
export async function printHasVariantForSku(printId: number, sku: string): Promise<boolean> {
  if (!hasDatabase) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM print_variants WHERE print_id = $1 AND upper(prodigi_sku) = upper($2) LIMIT 1`,
    [printId, sku],
  );
  return rows.length > 0;
}

/**
 * RE-DERIVE + PERSIST every variant's eligibility against the CURRENT master. Eligibility was cached
 * at variant-save time, so a later master upload/replace/removal would otherwise leave stale `eligible`
 * / `effective_dpi` on the rows — which both the admin editor and the fail-closed publish/storefront
 * gates trust. Called whenever the master changes. Additive UPDATEs only (never touches `enabled`); a
 * variant that becomes ineligible stays enabled but is unpurchasable (fail-closed), and the admin sees
 * the live "Not eligible". The SKU is left untouched. */
export async function reassessVariantsForMaster(printId: number, master: MasterDims | null): Promise<void> {
  if (!hasDatabase) return;
  const variants = await listVariants(printId);
  for (const v of variants) {
    // Recompute against THIS variant's stored crop — a crop that no longer fits the (changed) master
    // becomes ineligible ("crop-invalid"), never silently applied. The crop rectangle is left in place
    // so the admin can re-confirm it; only the derived eligibility flags are refreshed.
    const d = deriveVariantFields(v.prodigi_sku, master, cropFromRow(v));
    if (!d.ok) continue; // an unverified SKU can't be recomputed — leave the row as-is
    await pool.query(
      `UPDATE print_variants SET eligible = $2, effective_dpi = $3, updated_at = now() WHERE id = $1`,
      [v.id, d.fields.eligible, d.fields.effectiveDpi],
    );
  }
}

/** Persist a variant's crop (or clear it) and re-derive its eligibility against the print's master. The
 *  caller validates the crop shape/aspect first. Returns the updated row, or null if the variant is gone. */
export async function setVariantCrop(id: number, crop: NormalizedCrop | null, master: MasterDims | null): Promise<AdminVariantRow | null> {
  if (!hasDatabase) return null;
  const existing = await getVariant(id);
  if (!existing) return null;
  const d = deriveVariantFields(existing.prodigi_sku, master, crop);
  const eligible = d.ok ? d.fields.eligible : false;
  const effectiveDpi = d.ok ? d.fields.effectiveDpi : null;
  const { rows } = await pool.query(
    `UPDATE print_variants SET crop_x = $2, crop_y = $3, crop_w = $4, crop_h = $5,
        eligible = $6, effective_dpi = $7, updated_at = now() WHERE id = $1 RETURNING *`,
    [id, crop?.x ?? null, crop?.y ?? null, crop?.w ?? null, crop?.h ?? null, eligible, effectiveDpi],
  );
  return (rows[0] as AdminVariantRow) ?? null;
}

/** The print product's artwork id, so variant validation can find the master behind it. */
export async function printArtworkId(printId: number): Promise<number | null> {
  if (!hasDatabase) return null;
  const { rows } = await pool.query(`SELECT artwork_id FROM prints WHERE id = $1 LIMIT 1`, [printId]);
  return rows[0]?.artwork_id ?? null;
}
