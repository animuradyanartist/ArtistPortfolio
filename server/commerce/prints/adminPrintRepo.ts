/**
 * ADMIN PRINT REPOSITORY — the DB writes behind print-variant + master management. Raw SQL against
 * pool, matching the rest of commerce (these tables are created by the boot self-heal). Every
 * physical/eligibility field written here comes from `adminPrintService` (SKU-driven), never from
 * the request body.
 */

import { pool, hasDatabase } from "../../db";
import type { DerivedVariantFields, VariantSaveInput, MasterDims } from "./adminPrintService";

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
}

export async function getMaster(artworkId: number): Promise<MasterDims & { note: string | null } | null> {
  if (!hasDatabase) return null;
  const { rows } = await pool.query(`SELECT * FROM print_masters WHERE artwork_id = $1 LIMIT 1`, [artworkId]);
  const r = rows[0];
  if (!r) return null;
  return {
    widthPx: r.width_px ?? null,
    heightPx: r.height_px ?? null,
    status: r.status ?? "missing",
    printReadyAssetUrl: r.print_ready_asset_url ?? null,
    note: r.note ?? null,
  };
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

/** The print product's artwork id, so variant validation can find the master behind it. */
export async function printArtworkId(printId: number): Promise<number | null> {
  if (!hasDatabase) return null;
  const { rows } = await pool.query(`SELECT artwork_id FROM prints WHERE id = $1 LIMIT 1`, [printId]);
  return rows[0]?.artwork_id ?? null;
}
