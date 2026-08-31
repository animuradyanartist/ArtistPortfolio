/**
 * PER-VARIANT CROP + CROP-AWARE ELIGIBILITY.
 *
 * PRODUCT MODEL: standard verified Prodigi sizes are kept, but an aspect-ratio mismatch no longer makes
 * a variant permanently ineligible. The artist may intentionally crop the master for THAT size. Each
 * variant carries its OWN non-destructive crop (normalized rectangle over the master); the original
 * master is never modified. A cropped variant becomes eligible only if the CROPPED region still clears
 * the DPI floor at the SKU's print area (never upscaling).
 *
 * The crop is a NORMALIZED rectangle in the master's coordinate space — independent of the master's pixel
 * dimensions, so it survives a master of any resolution and is the single canonical representation.
 *
 * Pure + shared (no DB, no sharp, no network) so the admin editor, the eligibility gate, the fulfilment
 * derivative and the tests all agree on the same geometry and the same state machine.
 */
import {
  getProdigiProduct,
  skuAspect,
  DEFAULT_SKU_POLICY,
  type ProdigiLaunchProduct,
  type SkuEligibilityPolicy,
} from "./prodigiProducts";

/** Normalized crop rectangle over the master: x/y = top-left, w/h = size, all in [0,1] of the master. */
export interface NormalizedCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MasterPixels {
  widthPx: number | null;
  heightPx: number | null;
  status: string; // 'missing' | 'provisional' | 'ready'
}

/** Every distinct reason a variant is not (yet) sellable — a stable code the UI maps to a short label. */
export type VariantReasonCode =
  | "unverified-sku"
  | "no-master"
  | "not-ready"
  | "crop-required"   // aspect mismatch, no crop configured yet — NOT permanently ineligible
  | "crop-invalid"    // a stored crop no longer fits the SKU's aspect (e.g. after a master change)
  | "resolution"      // clears aspect (via match or crop) but the (cropped) pixels are below the floor
  | null;

export interface VariantAssessment {
  verifiedSku: boolean;
  masterReady: boolean;
  /** The FULL master's aspect ratio matches the SKU (no crop needed). */
  ratioMatches: boolean;
  /** A crop is needed to print this size (the full master's ratio differs). */
  cropRequired: boolean;
  /** A valid crop is configured for this variant. */
  cropConfigured: boolean;
  /** Effective DPI at the SKU's physical size, computed from the ACTUAL (cropped, if any) pixel area. */
  effectiveDpi: number | null;
  meetsFloor: boolean;
  eligible: boolean;
  reason: string | null;
  reasonCode: VariantReasonCode;
}

const EPS = 1e-6;

/** Is this a structurally valid, fully-inside-the-master crop rectangle? (Not yet aspect-checked.) */
export function isValidCropShape(c: NormalizedCrop | null | undefined): c is NormalizedCrop {
  if (!c) return false;
  const nums = [c.x, c.y, c.w, c.h];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return false;
  if (c.w <= 0 || c.h <= 0) return false;
  if (c.x < -EPS || c.y < -EPS) return false;
  if (c.x + c.w > 1 + EPS || c.y + c.h > 1 + EPS) return false;
  return true;
}

/** The cropped region's pixel dimensions in the master (rounded). Full master when no crop. */
export function croppedPixels(masterW: number, masterH: number, crop: NormalizedCrop | null): { widthPx: number; heightPx: number } {
  if (!crop) return { widthPx: masterW, heightPx: masterH };
  return { widthPx: Math.max(1, Math.round(crop.w * masterW)), heightPx: Math.max(1, Math.round(crop.h * masterH)) };
}

/** Orientation-agnostic long/short aspect ratio of a pixel region. */
function ratioOf(w: number, h: number): number {
  const a = Math.max(w, h), b = Math.min(w, h);
  return b > 0 ? a / b : Infinity;
}

/** The SKU print area's aspect as WIDTH/HEIGHT (orientation-specific, e.g. 0.75 for a portrait 3600×4800).
 *  The crop must match THIS so the fulfilment derivative resizes to the exact print-area pixels with no
 *  rotation and no distortion. */
export function skuFrameAspect(product: ProdigiLaunchProduct): number {
  return product.printAreaWidthPx / product.printAreaHeightPx;
}

/** Does the cropped region's WIDTH/HEIGHT match the SKU print area's orientation-specific aspect (within
 *  tolerance)? The crop editor produces a frame at exactly this aspect, so a valid crop always passes;
 *  this also guards a stored crop that has gone stale after a master change. */
export function cropFitsSku(
  masterW: number, masterH: number, crop: NormalizedCrop, product: ProdigiLaunchProduct,
  tolerance: number = DEFAULT_SKU_POLICY.ratioTolerance,
): boolean {
  if (!isValidCropShape(crop)) return false;
  const { widthPx, heightPx } = croppedPixels(masterW, masterH, crop);
  const cropWH = heightPx > 0 ? widthPx / heightPx : Infinity;
  const skuWH = skuFrameAspect(product);
  return Number.isFinite(cropWH) && Math.abs(cropWH - skuWH) / skuWH <= tolerance;
}

/** The DEFAULT (centered, maximal) crop rectangle for a SKU over a master — the starting point the crop
 *  editor opens with. Never a silent commit: the artist must still confirm it. Matches the SKU's
 *  orientation-specific aspect and is the largest such rectangle centered in the master (most resolution). */
export function defaultCropForSku(masterW: number, masterH: number, product: ProdigiLaunchProduct): NormalizedCrop {
  return normalizedCenteredForFrame(masterW, masterH, skuFrameAspect(product));
}

/** Largest centered rectangle of aspect `frameWH` (width/height) inside master WxH. */
function normalizedCenteredForFrame(masterW: number, masterH: number, frameWH: number): NormalizedCrop {
  const masterWH = masterW / masterH;
  let regionW: number, regionH: number;
  if (masterWH >= frameWH) {
    // Master is relatively wider than the frame → keep full height, shrink width.
    regionH = masterH;
    regionW = masterH * frameWH;
  } else {
    // Master is relatively taller → keep full width, shrink height.
    regionW = masterW;
    regionH = masterW / frameWH;
  }
  const w = regionW / masterW;
  const h = regionH / masterH;
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/**
 * THE ELIGIBILITY STATE MACHINE (§3). Separates: verified SKU · master ready · aspect fit · crop required ·
 * crop configured · purchasability. Aspect mismatch alone is NOT ineligible — it means "crop required".
 * DPI is always computed from the ACTUAL pixels that will be printed (cropped region when a crop exists).
 */
export function assessVariantEligibility(
  master: MasterPixels | null,
  sku: string,
  crop: NormalizedCrop | null,
  policy: SkuEligibilityPolicy = DEFAULT_SKU_POLICY,
): VariantAssessment {
  const base: VariantAssessment = {
    verifiedSku: false, masterReady: false, ratioMatches: false, cropRequired: false,
    cropConfigured: isValidCropShape(crop), effectiveDpi: null, meetsFloor: false, eligible: false,
    reason: null, reasonCode: null,
  };

  const product = getProdigiProduct(sku);
  if (!product) {
    return { ...base, reason: `"${sku}" is not a verified Prodigi launch SKU.`, reasonCode: "unverified-sku" };
  }
  if (!master || master.widthPx == null || master.heightPx == null) {
    return { ...base, verifiedSku: true, reason: "No master dimensions yet — upload a print-ready master.", reasonCode: "no-master" };
  }

  const masterReady = master.status === "ready";
  const masterW = master.widthPx, masterH = master.heightPx;
  const skuRatio = skuAspect(product);
  const masterRatio = ratioOf(masterW, masterH);
  const ratioMatches = Number.isFinite(masterRatio) && Math.abs(masterRatio - skuRatio) / skuRatio <= policy.ratioTolerance;
  const skuLong = Math.max(product.printAreaWidthPx, product.printAreaHeightPx);

  // The pixels that will actually be printed: the cropped region if a valid, fitting crop exists,
  // otherwise the full master (only meaningful when the ratio matches).
  const cropConfigured = isValidCropShape(crop);
  const cropRequired = !ratioMatches;

  // ── Aspect matches: no crop needed. DPI from the full master. ──
  if (ratioMatches) {
    const effectiveDpi = Math.floor((300 * Math.max(masterW, masterH)) / skuLong);
    const meetsFloor = effectiveDpi >= policy.minimumDpi;
    const eligible = masterReady && meetsFloor;
    const reasonCode: VariantReasonCode = eligible ? null : (!masterReady ? "not-ready" : "resolution");
    const reason = reasonCode === "not-ready" ? "Master is not marked print-ready yet."
      : reasonCode === "resolution" ? `Effective ${effectiveDpi} DPI is below the ${policy.minimumDpi} DPI floor.` : null;
    return { ...base, verifiedSku: true, masterReady, ratioMatches: true, cropRequired: false, cropConfigured, effectiveDpi, meetsFloor, eligible, reason, reasonCode };
  }

  // ── Aspect mismatch: a crop is required. ──
  if (!cropConfigured) {
    return { ...base, verifiedSku: true, masterReady, ratioMatches: false, cropRequired: true, cropConfigured: false,
      reason: "This size needs a crop — set the crop to choose what prints.", reasonCode: "crop-required" };
  }

  // A crop is configured — it must still fit the SKU aspect (guards a stale crop after a master change).
  const fits = cropFitsSku(masterW, masterH, crop!, product, policy.ratioTolerance);
  if (!fits) {
    return { ...base, verifiedSku: true, masterReady, ratioMatches: false, cropRequired: true, cropConfigured: true,
      reason: "The saved crop no longer fits this size — re-set the crop.", reasonCode: "crop-invalid" };
  }

  // DPI FROM THE CROPPED PIXELS (never the full master).
  const { widthPx: cw, heightPx: ch } = croppedPixels(masterW, masterH, crop!);
  const croppedLong = Math.max(cw, ch);
  const effectiveDpi = Math.floor((300 * croppedLong) / skuLong);
  const meetsFloor = effectiveDpi >= policy.minimumDpi;
  const eligible = masterReady && meetsFloor && fits;
  const reasonCode: VariantReasonCode = eligible ? null : (!masterReady ? "not-ready" : (!meetsFloor ? "resolution" : "crop-invalid"));
  const reason = reasonCode === "not-ready" ? "Master is not marked print-ready yet."
    : reasonCode === "resolution" ? `After cropping, ${effectiveDpi} DPI is below the ${policy.minimumDpi} DPI floor — crop less or use a higher-resolution master.` : null;

  return { ...base, verifiedSku: true, masterReady, ratioMatches: false, cropRequired: true, cropConfigured: true, effectiveDpi, meetsFloor, eligible, reason, reasonCode };
}

/** Absolute pixel extract rectangle in the master (for sharp), from the normalized crop. Clamped inside. */
export function cropExtractPx(masterW: number, masterH: number, crop: NormalizedCrop): { left: number; top: number; width: number; height: number } {
  const left = Math.min(masterW - 1, Math.max(0, Math.round(crop.x * masterW)));
  const top = Math.min(masterH - 1, Math.max(0, Math.round(crop.y * masterH)));
  const width = Math.max(1, Math.min(masterW - left, Math.round(crop.w * masterW)));
  const height = Math.max(1, Math.min(masterH - top, Math.round(crop.h * masterH)));
  return { left, top, width, height };
}
