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

// Photo Rag is RETIRED from new selection (owner decision, 2026-09): the store offers ONE fine-art
// paper (German Etching). `photo-rag` remains in the union ONLY so historical variants/orders that
// reference it still resolve, render, and fulfil (backward compatibility). `stretched-canvas` is the
// canvas material (Prodigi GLOBAL-CAN); its SKU rows are added ONLY after sandbox verification.
export type PrintMaterial = "german-etching" | "photo-rag" | "stretched-canvas";

export interface ProdigiLaunchProduct {
  /** The exact Prodigi SKU. Verified via GET /products/{sku} in the sandbox. */
  sku: string;
  material: PrintMaterial;
  /** Prodigi product/substrate code as returned by the API (HGE / HPR paper; CAN canvas). */
  paperType: "HGE" | "HPR" | "CAN";
  /** Substrate weight the API reported (gsm). 0 when not paper (canvas). */
  substrateGsm: number;
  /** Customer-facing size label, e.g. "12×16 in (30×40 cm)". */
  displayName: string;
  /** Short, clean size label for the storefront (never shows pixels), e.g. "30 × 40 cm" or "A2". */
  friendlyLabel: string;
  /** Physical print size, cm (rounded to 1 dp). Portrait orientation as Prodigi lists it. */
  widthCm: number;
  heightCm: number;
  /** REQUIRED print-area resolution, in pixels, exactly as the sandbox returned it. */
  printAreaWidthPx: number;
  printAreaHeightPx: number;
  /** Whether this SKU is part of the current launch (eligibility/checkout gate). */
  activeForLaunch: boolean;
  /**
   * Whether this SKU may be chosen for a NEW variant in the admin. German Etching + Canvas: true.
   * Photo Rag: FALSE — it stays verified (so historical rows resolve) but is no longer offered.
   * Defaults to `activeForLaunch` when omitted.
   */
  offeredForNewVariants?: boolean;
  /**
   * REQUIRED Prodigi order/quote attributes for this SKU that come from the CATALOGUE, not the buyer —
   * e.g. canvas `{ wrap: "MirrorWrap" }`. Merged (server-side, authoritative) into every quote and
   * fulfilment order for this SKU. Omitted for paper (no required attribute).
   */
  requiredAttributes?: Record<string, string>;
}

/**
 * DEFAULT CANVAS WRAP — how the artwork meets the ~38mm depth of the stretcher bar edges.
 *
 * Chosen: MirrorWrap. The customer never sees or picks this. Rationale:
 *   • ImageWrap would fold the OUTER ~38mm of the artwork itself around the sides — that pushes real
 *     composition off the visible face and can slice important edge content onto the frame edges.
 *   • Black/White impose a solid border that changes the presentation of a fine-art image.
 *   • MirrorWrap keeps the FULL composition on the visible face and fills the sides with a mirror of
 *     the edge — nothing important is lost from the face and nothing is cropped onto the sides.
 * It is therefore the best "preserve the visible artwork composition" default. "MirrorWrap" was
 * verified as a valid wrap option for all five launch GLOBAL-CAN SKUs in the Prodigi sandbox.
 */
export const DEFAULT_CANVAS_WRAP = "MirrorWrap";

/**
 * VERIFIED canvas SKUs — Prodigi Stretched Canvas (400gsm Standard Canvas, 38mm standard stretcher
 * bar). The five GLOBAL-CAN SKUs + their print-area PIXEL dimensions below were verified in the real
 * Prodigi sandbox (GET /products/{sku}); MirrorWrap was confirmed as a valid wrap option for all five.
 * The print-area pixels are the sandbox values EXACTLY (they include the wrap bleed, so they are
 * slightly larger than the nominal face size). `widthCm`/`heightCm`/`displayName` are the customer-
 * facing NOMINAL face size, matching the paper naming. Each row carries the required wrap attribute.
 */
export const CANVAS_LAUNCH_PRODUCTS: readonly ProdigiLaunchProduct[] = [
  { sku: "GLOBAL-CAN-A3", material: "stretched-canvas", paperType: "CAN", substrateGsm: 400, displayName: "A3 (29.7×42 cm)", friendlyLabel: "A3", widthCm: 29.7, heightCm: 42.0, printAreaWidthPx: 3561, printAreaHeightPx: 5013, activeForLaunch: true, offeredForNewVariants: true, requiredAttributes: { wrap: DEFAULT_CANVAS_WRAP } },
  { sku: "GLOBAL-CAN-12X16", material: "stretched-canvas", paperType: "CAN", substrateGsm: 400, displayName: "12×16 in (30×40 cm)", friendlyLabel: "30 × 40 cm", widthCm: 30.5, heightCm: 40.6, printAreaWidthPx: 3654, printAreaHeightPx: 4854, activeForLaunch: true, offeredForNewVariants: true, requiredAttributes: { wrap: DEFAULT_CANVAS_WRAP } },
  { sku: "GLOBAL-CAN-16X20", material: "stretched-canvas", paperType: "CAN", substrateGsm: 400, displayName: "16×20 in (40×50 cm)", friendlyLabel: "40 × 50 cm", widthCm: 40.6, heightCm: 50.8, printAreaWidthPx: 4854, printAreaHeightPx: 6054, activeForLaunch: true, offeredForNewVariants: true, requiredAttributes: { wrap: DEFAULT_CANVAS_WRAP } },
  { sku: "GLOBAL-CAN-18X24", material: "stretched-canvas", paperType: "CAN", substrateGsm: 400, displayName: "18×24 in (45×60 cm)", friendlyLabel: "45 × 60 cm", widthCm: 45.7, heightCm: 61.0, printAreaWidthPx: 5454, printAreaHeightPx: 7254, activeForLaunch: true, offeredForNewVariants: true, requiredAttributes: { wrap: DEFAULT_CANVAS_WRAP } },
  { sku: "GLOBAL-CAN-24X36", material: "stretched-canvas", paperType: "CAN", substrateGsm: 400, displayName: "24×36 in (60×90 cm)", friendlyLabel: "60 × 90 cm", widthCm: 61.0, heightCm: 91.4, printAreaWidthPx: 7254, printAreaHeightPx: 10854, activeForLaunch: true, offeredForNewVariants: true, requiredAttributes: { wrap: DEFAULT_CANVAS_WRAP } },
];

/**
 * ONE fine-art paper (Hahnemühle German Etching) is OFFERED for new variants. Photo Rag rows remain
 * (verified, `activeForLaunch: true`) purely for BACKWARD COMPATIBILITY — historical variants/orders
 * that reference an HPR SKU still resolve, render and fulfil — but they are `offeredForNewVariants:
 * false`, so the admin can no longer add a new Photo Rag variant.
 *
 * ALL VALUES sandbox-verified. Enhanced Matte (GLOBAL-FAP-*) is a real Prodigi product but is
 * deliberately NOT in the launch catalogue (owner decision). GLOBAL-PR-* returned 404 and is excluded.
 *
 * CANVAS (GLOBAL-CAN) rows are added to CANVAS_LAUNCH_PRODUCTS below ONLY after sandbox verification
 * (run `npm run prodigi:discover-canvas`). Until then canvas has no verified SKU and is not sellable.
 */
export const PRODIGI_LAUNCH_PRODUCTS: readonly ProdigiLaunchProduct[] = [
  // ── Hahnemühle German Etching · HGE · 310gsm — the ONE offered fine-art paper ──
  { sku: "GLOBAL-HGE-12X16", material: "german-etching", paperType: "HGE", substrateGsm: 310, displayName: "12×16 in (30×40 cm)", friendlyLabel: "30 × 40 cm", widthCm: 30.5, heightCm: 40.6, printAreaWidthPx: 3600, printAreaHeightPx: 4800, activeForLaunch: true, offeredForNewVariants: true },
  { sku: "GLOBAL-HGE-16X20", material: "german-etching", paperType: "HGE", substrateGsm: 310, displayName: "16×20 in (40×50 cm)", friendlyLabel: "40 × 50 cm", widthCm: 40.6, heightCm: 50.8, printAreaWidthPx: 4800, printAreaHeightPx: 6000, activeForLaunch: true, offeredForNewVariants: true },
  { sku: "GLOBAL-HGE-18X24", material: "german-etching", paperType: "HGE", substrateGsm: 310, displayName: "18×24 in (45×60 cm)", friendlyLabel: "45 × 60 cm", widthCm: 45.7, heightCm: 61.0, printAreaWidthPx: 5400, printAreaHeightPx: 7200, activeForLaunch: true, offeredForNewVariants: true },
  { sku: "GLOBAL-HGE-A3", material: "german-etching", paperType: "HGE", substrateGsm: 310, displayName: "A3 (29.7×42 cm)", friendlyLabel: "A3", widthCm: 29.7, heightCm: 42.0, printAreaWidthPx: 3578, printAreaHeightPx: 5031, activeForLaunch: true, offeredForNewVariants: true },
  { sku: "GLOBAL-HGE-A2", material: "german-etching", paperType: "HGE", substrateGsm: 310, displayName: "A2 (42×59.4 cm)", friendlyLabel: "A2", widthCm: 42.0, heightCm: 59.4, printAreaWidthPx: 4960, printAreaHeightPx: 7015, activeForLaunch: true, offeredForNewVariants: true },

  // ── Hahnemühle Photo Rag · HPR · 308gsm — RETIRED from new selection (historical rows only) ──
  { sku: "GLOBAL-HPR-16X20", material: "photo-rag", paperType: "HPR", substrateGsm: 308, displayName: "16×20 in (40×50 cm)", friendlyLabel: "40 × 50 cm", widthCm: 40.6, heightCm: 50.8, printAreaWidthPx: 4800, printAreaHeightPx: 6000, activeForLaunch: true, offeredForNewVariants: false },
  { sku: "GLOBAL-HPR-A3", material: "photo-rag", paperType: "HPR", substrateGsm: 308, displayName: "A3 (29.7×42 cm)", friendlyLabel: "A3", widthCm: 29.7, heightCm: 42.0, printAreaWidthPx: 3507, printAreaHeightPx: 4960, activeForLaunch: true, offeredForNewVariants: false },

  // ── Stretched Canvas · CAN · GLOBAL-CAN — five sandbox-verified sizes (see CANVAS_LAUNCH_PRODUCTS) ──
  ...CANVAS_LAUNCH_PRODUCTS,
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

/** Whether a SKU may be picked for a NEW variant (retired Photo Rag is excluded; historical stays valid). */
export function isSkuOfferedForNewVariant(sku: string | null | undefined): boolean {
  const p = getProdigiProduct(sku);
  if (!p) return false;
  return p.activeForLaunch && (p.offeredForNewVariants ?? p.activeForLaunch);
}

/** OFFERED products for one material (what the admin's size picker lists). Excludes retired SKUs. */
export function offeredProductsForMaterial(material: PrintMaterial): ProdigiLaunchProduct[] {
  return productsForMaterial(material).filter((p) => isSkuOfferedForNewVariant(p.sku));
}

export const MATERIAL_LABEL: Record<PrintMaterial, string> = {
  "german-etching": "Hahnemühle German Etching",
  "photo-rag": "Hahnemühle Photo Rag",
  "stretched-canvas": "Stretched Canvas",
};

// ── CUSTOMER-FACING PRODUCT CATEGORY (the primary, understandable choice) vs the production STOCK ──
//
// The primary material choice is a plain-language CATEGORY (Fine Art Paper / Canvas). The Hahnemühle
// paper stock is SECONDARY information under it, never a top-level category. Canvas is ARCHITECTED here
// but has NO verified Prodigi SKU yet, so it is never purchasable (see canvas status below).

export type PrintCategory = "fine-art-paper" | "canvas";

export const CATEGORY_LABEL: Record<PrintCategory, string> = {
  "fine-art-paper": "Fine Art Paper",
  "canvas": "Canvas",
};

/** The category each production material belongs to. Both papers are Fine Art Paper; canvas is Canvas. */
export const MATERIAL_CATEGORY: Record<PrintMaterial, PrintCategory> = {
  "german-etching": "fine-art-paper",
  "photo-rag": "fine-art-paper",
  "stretched-canvas": "canvas",
};

export interface MaterialInfo {
  material: PrintMaterial;
  category: PrintCategory;
  /** The production stock name shown as SECONDARY info, e.g. "Hahnemühle German Etching". */
  stockLabel: string;
  /** Short, customer-friendly finish description (no paper-industry jargon needed to understand it). */
  finish: string;
}

export const MATERIAL_INFO: Record<PrintMaterial, MaterialInfo> = {
  "german-etching": { material: "german-etching", category: "fine-art-paper", stockLabel: "Hahnemühle German Etching", finish: "310gsm · Textured matte · Giclée" },
  "photo-rag": { material: "photo-rag", category: "fine-art-paper", stockLabel: "Hahnemühle Photo Rag", finish: "Smooth cotton fine art paper" },
  "stretched-canvas": { material: "stretched-canvas", category: "canvas", stockLabel: "Stretched Canvas", finish: "Artist-grade stretched canvas · Ready to hang" },
};

/** Every category (whether or not it has verified products yet) — for a complete, stable UI order. */
export const ALL_CATEGORIES: readonly PrintCategory[] = ["fine-art-paper", "canvas"];

/** Active-launch materials in a category (empty for a category with no verified SKUs, e.g. canvas). */
export function materialsForCategory(category: PrintCategory): PrintMaterial[] {
  const set = new Set<PrintMaterial>();
  for (const p of PRODIGI_LAUNCH_PRODUCTS) {
    if (p.activeForLaunch && MATERIAL_CATEGORY[p.material] === category) set.add(p.material);
  }
  return Array.from(set);
}

/** True only when a category has at least one VERIFIED, active Prodigi product — the purchasability gate
 *  for the whole category. Canvas is false until a real Prodigi canvas SKU is added to the registry. */
export function categoryHasVerifiedProducts(category: PrintCategory): boolean {
  return materialsForCategory(category).length > 0;
}

/** OFFERED materials in a category — what the admin may add NEW variants for (excludes retired Photo Rag). */
export function offeredMaterialsForCategory(category: PrintCategory): PrintMaterial[] {
  const set = new Set<PrintMaterial>();
  for (const p of PRODIGI_LAUNCH_PRODUCTS) {
    if (isSkuOfferedForNewVariant(p.sku) && MATERIAL_CATEGORY[p.material] === category) set.add(p.material);
  }
  return Array.from(set);
}

/** True when a category has ≥1 OFFERED product — the gate for enabling that category in the admin's
 *  "Add option" picker. Fine Art Paper: true (German Etching). Canvas: true only once a verified
 *  GLOBAL-CAN row exists. */
export function categoryOfferedForNewVariants(category: PrintCategory): boolean {
  return offeredMaterialsForCategory(category).length > 0;
}

// ── SKU ATTRIBUTES THAT COME FROM THE CATALOGUE (server-authoritative), e.g. canvas wrap ──────────

/** The default catalogue attributes for a material — canvas carries the wrap; paper carries none. */
export function defaultAttributesForMaterial(material: PrintMaterial | null | undefined): Record<string, string> {
  if (material === "stretched-canvas") return { wrap: DEFAULT_CANVAS_WRAP };
  return {};
}

/**
 * The REQUIRED Prodigi attributes for a SKU, from the catalogue (NOT the buyer). A verified canvas row
 * carries its own `requiredAttributes`; otherwise we fall back to the material default. Empty for paper.
 * Callers merge this into quote + fulfilment payloads so canvas always ships with the correct wrap.
 */
export function requiredAttributesForSku(sku: string | null | undefined): Record<string, string> {
  const p = getProdigiProduct(sku);
  if (!p) return {};
  if (p.requiredAttributes && Object.keys(p.requiredAttributes).length) return { ...p.requiredAttributes };
  return defaultAttributesForMaterial(p.material);
}

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

/** Machine-readable eligibility outcome, so the admin UI can show a precise reason (not just "Not eligible"). */
export type EligibilityReasonCode = "aspect-ratio" | "resolution" | null;

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
  /** Why it is not eligible, as a stable code the UI maps to a short label. Null when eligible. */
  reasonCode: EligibilityReasonCode;
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

  // A ratio mismatch is reported FIRST because it disqualifies regardless of how high the DPI is — a
  // very high-DPI master (e.g. 620 DPI) is still "Not eligible" for a size whose aspect ratio differs.
  let reason: string | null = null;
  let reasonCode: EligibilityReasonCode = null;
  if (!ratioMatches) {
    reason = `Aspect ratio ${masterRatio.toFixed(3)} does not match this size's ${skuRatio.toFixed(3)} — it would crop or stretch.`;
    reasonCode = "aspect-ratio";
  } else if (!meetsFloor) {
    reason = `Effective ${effectiveDpi} DPI is below the ${policy.minimumDpi} DPI floor — a higher-resolution master is required (no upscaling).`;
    reasonCode = "resolution";
  }

  return { sku, ratioMatches, effectiveDpi, meetsPreferred, meetsFloor, eligible, reason, reasonCode };
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
