/**
 * CANONICAL PRODIGI LAUNCH PRODUCTS — VERIFIED DATA ONLY.
 *
 * Every row here was confirmed against the REAL Prodigi SANDBOX API (GET /v4.0/products/{sku})
 * on the print-business feature branch. Nothing is invented: the SKUs, paper codes, weights,
 * physical sizes and — critically — the print-area PIXEL requirements are exactly what the
 * sandbox returned. If a size, material or framing option is not in this table, it has NOT been
 * verified and must not be sold.
 *
 * The print-area pixel counts ARE the eligibility requirement. Prodigi defines each print area at
 * 300 DPI, so `printAreaLongPx / 300 = the physical long edge in inches`. A master that supplies
 * at least that many pixels prints at 300 DPI; half of them is the 150 DPI floor. We NEVER upscale
 * to reach a size — a master short of the floor simply disqualifies that variant.
 *
 * Pure + shared (no secret, no network) so the eligibility engine, the storefront, the feed and
 * the checkout all judge a variant against the same verified facts. A wrong number here would be a
 * silent, favourable lie about what can be printed, so this file changes only when a NEW sandbox
 * verification confirms a NEW row.
 */

export type PrintMaterial = "german-etching" | "photo-rag";

export interface ProdigiLaunchProduct {
  /** The exact Prodigi SKU. Verified via GET /products/{sku} in the sandbox. */
  sku: string;
  material: PrintMaterial;
  /** Prodigi paper code as returned by the API (HGE / HPR). */
  paperType: "HGE" | "HPR";
  /** Substrate weight the API reported (gsm). */
  substrateGsm: number;
  /** Customer-facing size label. */
  displayName: string;
  /** Physical print size, cm (rounded to 1 dp). Portrait orientation as Prodigi lists it. */
  widthCm: number;
  heightCm: number;
  /** REQUIRED print-area resolution, in pixels, exactly as the sandbox returned it. */
  printAreaWidthPx: number;
  printAreaHeightPx: number;
  /** Whether this SKU is part of the v1 launch. German Etching + Photo Rag are; Canvas is wave 2. */
  activeForLaunch: boolean;
}

/**
 * Hahnemühle German Etching (flagship) + Photo Rag (selective, for detailed figurative works).
 * ALL VALUES sandbox-verified. Enhanced Matte (GLOBAL-FAP-*) is a real Prodigi product but is
 * deliberately NOT in the launch catalogue (owner decision) and its pixel requirements were not
 * captured, so it is omitted rather than half-recorded. GLOBAL-PR-* returned 404 and is excluded.
 */
export const PRODIGI_LAUNCH_PRODUCTS: readonly ProdigiLaunchProduct[] = [
  // ── Hahnemühle German Etching · HGE · 310gsm ──
  { sku: "GLOBAL-HGE-12X16", material: "german-etching", paperType: "HGE", substrateGsm: 310, displayName: "12×16 in (30×40 cm)", widthCm: 30.5, heightCm: 40.6, printAreaWidthPx: 3600, printAreaHeightPx: 4800, activeForLaunch: true },
  { sku: "GLOBAL-HGE-16X20", material: "german-etching", paperType: "HGE", substrateGsm: 310, displayName: "16×20 in (40×50 cm)", widthCm: 40.6, heightCm: 50.8, printAreaWidthPx: 4800, printAreaHeightPx: 6000, activeForLaunch: true },
  { sku: "GLOBAL-HGE-18X24", material: "german-etching", paperType: "HGE", substrateGsm: 310, displayName: "18×24 in (45×60 cm)", widthCm: 45.7, heightCm: 61.0, printAreaWidthPx: 5400, printAreaHeightPx: 7200, activeForLaunch: true },
  { sku: "GLOBAL-HGE-A3", material: "german-etching", paperType: "HGE", substrateGsm: 310, displayName: "A3 (29.7×42 cm)", widthCm: 29.7, heightCm: 42.0, printAreaWidthPx: 3578, printAreaHeightPx: 5031, activeForLaunch: true },
  { sku: "GLOBAL-HGE-A2", material: "german-etching", paperType: "HGE", substrateGsm: 310, displayName: "A2 (42×59.4 cm)", widthCm: 42.0, heightCm: 59.4, printAreaWidthPx: 4960, printAreaHeightPx: 7015, activeForLaunch: true },

  // ── Hahnemühle Photo Rag · HPR · 308gsm ──
  { sku: "GLOBAL-HPR-16X20", material: "photo-rag", paperType: "HPR", substrateGsm: 308, displayName: "16×20 in (40×50 cm)", widthCm: 40.6, heightCm: 50.8, printAreaWidthPx: 4800, printAreaHeightPx: 6000, activeForLaunch: true },
  { sku: "GLOBAL-HPR-A3", material: "photo-rag", paperType: "HPR", substrateGsm: 308, displayName: "A3 (29.7×42 cm)", widthCm: 29.7, heightCm: 42.0, printAreaWidthPx: 3507, printAreaHeightPx: 4960, activeForLaunch: true },
];

const BY_SKU = new Map(PRODIGI_LAUNCH_PRODUCTS.map((p) => [p.sku.toUpperCase(), p]));

/** A verified product by SKU (case-insensitive), or undefined if the SKU is not in the catalogue. */
export function getProdigiProduct(sku: string | null | undefined): ProdigiLaunchProduct | undefined {
  if (!sku) return undefined;
  return BY_SKU.get(sku.trim().toUpperCase());
}

/** True only for a SKU that is verified AND part of the current launch. This is THE SKU gate. */
export function isActiveLaunchSku(sku: string | null | undefined): boolean {
  const p = getProdigiProduct(sku);
  return Boolean(p && p.activeForLaunch);
}

/** Every active-launch SKU. */
export function activeLaunchSkus(): string[] {
  return PRODIGI_LAUNCH_PRODUCTS.filter((p) => p.activeForLaunch).map((p) => p.sku);
}

/** Active-launch products for one material. */
export function productsForMaterial(material: PrintMaterial): ProdigiLaunchProduct[] {
  return PRODIGI_LAUNCH_PRODUCTS.filter((p) => p.activeForLaunch && p.material === material);
}

export const MATERIAL_LABEL: Record<PrintMaterial, string> = {
  "german-etching": "Hahnemühle German Etching",
  "photo-rag": "Hahnemühle Photo Rag",
};

// ── ELIGIBILITY AGAINST REAL PRINT-AREA PIXELS ────────────────────────────────────────────

export interface SkuEligibilityPolicy {
  preferredDpi: number;
  minimumDpi: number;
  /** Max allowed aspect-ratio mismatch between master and print area (fraction). Guards no-crop. */
  ratioTolerance: number;
}

/** Premium-leaning, per the product decision: 300 DPI preferred, 150 DPI absolute floor. */
export const DEFAULT_SKU_POLICY: SkuEligibilityPolicy = { preferredDpi: 300, minimumDpi: 150, ratioTolerance: 0.03 };

/** Long/short aspect ratio (orientation-agnostic) of a print area. */
export function skuAspect(p: ProdigiLaunchProduct): number {
  const a = p.printAreaWidthPx, b = p.printAreaHeightPx;
  return Math.max(a, b) / Math.min(a, b);
}

export interface SkuEligibility {
  sku: string;
  /** master and print-area aspect ratios agree within tolerance (so no crop/stretch is needed). */
  ratioMatches: boolean;
  /** Effective DPI if this master is printed at this SKU's physical size (print areas are 300 DPI). */
  effectiveDpi: number;
  meetsPreferred: boolean;
  meetsFloor: boolean;
  /** eligible = ratio matches AND resolution clears the floor. Never upscales. */
  eligible: boolean;
  reason: string | null;
}

/**
 * Judge a real master (its pixel dimensions) against a verified SKU. This is the AUTHORITATIVE
 * real-product eligibility: it uses the SKU's actual print-area pixels, preserves aspect ratio
 * (a ratio mismatch disqualifies rather than crops), and never upscales.
 */
export function assessMasterForSku(
  master: { widthPx: number; heightPx: number },
  sku: string,
  policy: SkuEligibilityPolicy = DEFAULT_SKU_POLICY,
): SkuEligibility | null {
  const p = getProdigiProduct(sku);
  if (!p) return null;

  const masterLong = Math.max(master.widthPx, master.heightPx);
  const masterShort = Math.min(master.widthPx, master.heightPx);
  const skuLong = Math.max(p.printAreaWidthPx, p.printAreaHeightPx);

  const masterRatio = masterShort > 0 ? masterLong / masterShort : Infinity;
  const skuRatio = skuAspect(p);
  const ratioMatches = Number.isFinite(masterRatio) && Math.abs(masterRatio - skuRatio) / skuRatio <= policy.ratioTolerance;

  // Print areas are defined at 300 DPI, so effective DPI scales linearly with pixel supply.
  const effectiveDpi = Math.floor((300 * masterLong) / skuLong);
  const meetsPreferred = effectiveDpi >= policy.preferredDpi;
  const meetsFloor = effectiveDpi >= policy.minimumDpi;
  const eligible = ratioMatches && meetsFloor;

  let reason: string | null = null;
  if (!ratioMatches) reason = `Aspect ratio ${masterRatio.toFixed(3)} does not match this size's ${skuRatio.toFixed(3)} — it would crop or stretch.`;
  else if (!meetsFloor) reason = `Effective ${effectiveDpi} DPI is below the ${policy.minimumDpi} DPI floor — a higher-resolution master is required (no upscaling).`;

  return { sku, ratioMatches, effectiveDpi, meetsPreferred, meetsFloor, eligible, reason };
}

/** Every active-launch SKU a given master can actually be printed at (ratio + resolution ok). */
export function eligibleSkusForMaster(
  master: { widthPx: number; heightPx: number },
  policy: SkuEligibilityPolicy = DEFAULT_SKU_POLICY,
): ProdigiLaunchProduct[] {
  return PRODIGI_LAUNCH_PRODUCTS.filter((p) => {
    if (!p.activeForLaunch) return false;
    const e = assessMasterForSku(master, p.sku, policy);
    return Boolean(e?.eligible);
  });
}
