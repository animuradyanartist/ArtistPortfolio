/**
 * ADMIN PRINT SERVICE — the SKU-driven derivation that stops an admin from inventing physical
 * facts about a print. The admin chooses a VERIFIED Prodigi SKU (+ a price, an asset, a frame);
 * EVERYTHING physical — material, size, print-area pixels, effective DPI, eligibility — is derived
 * here from the sandbox-verified catalogue and the artwork's master. Nothing physical is trusted
 * from the admin form, exactly as nothing is trusted from a buyer at checkout.
 *
 * Pure + unit-tested; the admin routes call this and persist the result.
 */

import {
  getProdigiProduct,
  assessMasterForSku,
  DEFAULT_SKU_POLICY,
  type PrintMaterial,
  type SkuEligibilityPolicy,
} from "../prodigi/prodigiProducts";

/** Why a variant is not eligible, as a stable code the admin UI maps to a short label. Null = eligible. */
export type VariantReasonCode =
  | "aspect-ratio"       // master ratio ≠ this size's — would crop/stretch
  | "resolution"         // below the DPI floor (no upscaling)
  | "no-master"          // master has no pixel dimensions yet
  | "not-ready"          // master exists but is not marked print-ready
  | "unverified-sku"     // SKU is not a verified Prodigi launch product
  | null;

export interface MasterDims {
  widthPx: number | null;
  heightPx: number | null;
  status: string; // 'missing' | 'provisional' | 'ready'
  printReadyAssetUrl?: string | null;
}

export interface DerivedVariantFields {
  material: PrintMaterial;
  sizeLabel: string;
  widthCm: number;
  heightCm: number;
  printAreaWidthPx: number;
  printAreaHeightPx: number;
  /** DPI at this SKU's physical size for the given master; null when the master has no dimensions. */
  effectiveDpi: number | null;
  /** eligible = a ready master, matching ratio, clearing the DPI floor. False if any is missing. */
  eligible: boolean;
  reason: string | null;
  /** Stable code for the reason (for the admin UI). Null when eligible. */
  reasonCode: VariantReasonCode;
}

export type DeriveResult =
  | { ok: true; fields: DerivedVariantFields }
  | { ok: false; error: string };

/**
 * Derive a variant's physical fields from a VERIFIED SKU + the artwork master. Refuses an unknown
 * SKU outright (no invented products). Eligibility requires a master with real pixel dimensions
 * AND `status === 'ready'` — a web-resolution or unverified master never yields an eligible variant.
 */
export function deriveVariantFields(
  sku: string,
  master: MasterDims | null,
  policy: SkuEligibilityPolicy = DEFAULT_SKU_POLICY,
): DeriveResult {
  const product = getProdigiProduct(sku);
  if (!product) {
    return { ok: false, error: `"${sku}" is not a verified Prodigi launch SKU — it cannot be sold.` };
  }

  const base: DerivedVariantFields = {
    material: product.material,
    sizeLabel: product.displayName,
    widthCm: product.widthCm,
    heightCm: product.heightCm,
    printAreaWidthPx: product.printAreaWidthPx,
    printAreaHeightPx: product.printAreaHeightPx,
    effectiveDpi: null,
    eligible: false,
    reason: null,
    reasonCode: null,
  };

  if (!master || master.widthPx == null || master.heightPx == null) {
    return { ok: true, fields: { ...base, reason: "No master dimensions yet — awaiting a print-ready master.", reasonCode: "no-master" } };
  }

  const e = assessMasterForSku({ widthPx: master.widthPx, heightPx: master.heightPx }, sku, policy);
  if (!e) {
    return { ok: false, error: `Eligibility could not be computed for "${sku}".` };
  }

  const masterReady = master.status === "ready";
  const eligible = e.eligible && masterReady;
  const reason = !masterReady
    ? "Master is not marked print-ready yet."
    : e.reason; // ratio/resolution reason, or null when eligible
  const reasonCode: VariantReasonCode = eligible ? null : (!masterReady ? "not-ready" : e.reasonCode);

  return {
    ok: true,
    fields: { ...base, effectiveDpi: e.effectiveDpi, eligible, reason, reasonCode },
  };
}

export interface VariantSaveInput {
  sku: string;
  framed: boolean;
  frameColour: string | null;
  retailMinor: number | null;
  currency: string;
  printReadyAssetUrl: string | null;
  enabled: boolean;
}

export interface ValidatedVariantSave {
  ok: boolean;
  errors?: Record<string, string>;
  /** The row to persist, with server-derived physical fields merged in. */
  row?: DerivedVariantFields & VariantSaveInput & { minDpi: number };
}

const ALLOWED_FRAME_COLOURS = new Set(["natural", "black", "white"]);

/**
 * Validate + assemble a variant row for persistence. Frames are architected but NOT yet verified
 * against Prodigi framed SKUs, so a framed variant may be stored (natural/black/white only) but is
 * never eligible on its own here — enabling a purchasable frame stays blocked until framed SKUs are
 * verified. Enabling a variant requires it to be eligible AND priced AND asset-backed.
 */
export function validateVariantSave(
  input: VariantSaveInput,
  master: MasterDims | null,
  policy: SkuEligibilityPolicy = DEFAULT_SKU_POLICY,
): ValidatedVariantSave {
  const errors: Record<string, string> = {};

  const derived = deriveVariantFields(input.sku, master, policy);
  if (!derived.ok) {
    errors.sku = derived.error;
    return { ok: false, errors };
  }

  if (input.framed && input.frameColour && !ALLOWED_FRAME_COLOURS.has(input.frameColour)) {
    errors.frameColour = "Frame colour must be natural, black or white.";
  }
  if (input.retailMinor != null && (!Number.isInteger(input.retailMinor) || input.retailMinor <= 0)) {
    errors.retailMinor = "Price must be a positive whole number of minor units, or empty.";
  }
  if (input.printReadyAssetUrl && !/^https:\/\//i.test(input.printReadyAssetUrl)) {
    errors.printReadyAssetUrl = "The print-ready asset must be a stable HTTPS URL.";
  }

  // A variant may only be ENABLED for sale when it is genuinely sellable.
  if (input.enabled) {
    if (!derived.fields.eligible) errors.enabled = "Cannot enable: the master is not eligible for this size yet.";
    else if (input.retailMinor == null || input.retailMinor <= 0) errors.enabled = "Cannot enable: set a price first.";
    else if (!input.printReadyAssetUrl && !master?.printReadyAssetUrl) errors.enabled = "Cannot enable: a print-ready asset URL is required.";
    else if (input.framed) errors.enabled = "Framed SKUs are not verified yet — a framed variant cannot be enabled for sale.";
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    row: {
      ...derived.fields,
      ...input,
      minDpi: policy.minimumDpi,
    },
  };
}
