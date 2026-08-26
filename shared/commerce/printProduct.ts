/**
 * PRINT PRODUCT DOMAIN — the ONE rule that decides whether a print variant may be shown as
 * buyable, offered in the configurator as provisional, or hidden entirely. Pure and unit-tested,
 * so the storefront, the configurator, the checkout route, the feed and the sitemap all answer
 * the question the same way and can never drift.
 *
 * A print is only PUBLICLY PURCHASABLE when EVERY one of these holds:
 *   1. a real high-resolution master exists and is verified ready (`master.status === 'ready'`),
 *   2. the variant cleared the resolution/eligibility engine (`eligible`),
 *   3. an admin turned it on (`enabled`),
 *   4. it carries a real own-site print price (`retailMinor > 0`),
 *   5. there is a print-ready asset to actually send to the printer.
 *
 * Today the whole catalogue's only image is the ~1280px web file, which is NOT a master, so
 * every master is `status: 'missing'` and NOTHING is purchasable. That is the correct, safe
 * default — this module fails closed. When a real master is added later, the same rule turns the
 * product on with no storefront change.
 *
 * PRICE COMES FROM THE VARIANT, NEVER FROM THE CLIENT. `resolveVariantPrice` is the only price a
 * checkout may charge; a Singulart/original-artwork price is never a substitute here.
 */

import { isActiveLaunchSku } from "./prodigiProducts";

export type MasterStatus = "missing" | "provisional" | "ready";

export interface PrintMasterView {
  status: MasterStatus;
  widthPx: number | null;
  heightPx: number | null;
  printReadyAssetUrl: string | null;
  checksumMd5: string | null;
}

export interface PrintVariantView {
  id: number;
  printId: number;
  material: string; // 'german-etching' | 'photo-rag'
  prodigiSku: string;
  sizeLabel: string; // 'S' | 'M' | 'L'
  widthCm: number;
  heightCm: number;
  framed: boolean;
  frameColour: string | null;
  retailMinor: number | null;
  currency: string;
  printReadyAssetUrl: string | null;
  mockups: string[] | null;
  effectiveDpi: number | null;
  eligible: boolean;
  enabled: boolean;
  /** Whether the SKU/attributes were reconciled against a live Prodigi product response. */
  prodigiVerified: boolean;
}

/** One of: buyable now, offered but provisional (not yet buyable), or hidden. */
export type VariantSaleState = "purchasable" | "provisional" | "unavailable";

export interface VariantAssessment {
  state: VariantSaleState;
  /** Human reason for the state — null when purchasable. */
  reason: string | null;
  /** Whether a real master is ready (surfaced separately so UI can explain provisional clearly). */
  masterReady: boolean;
  /** Whether the Prodigi SKU has been confirmed against the live catalogue. */
  prodigiVerified: boolean;
}

/** The print-ready asset the printer would actually receive: the variant's, else the master's. */
export function printReadyAssetOf(v: PrintVariantView, master: PrintMasterView | null): string | null {
  return v.printReadyAssetUrl || master?.printReadyAssetUrl || null;
}

/**
 * Assess a single variant against its master. NEVER throws; a missing master, a disabled variant,
 * an unpriced variant and an ineligible variant each resolve to an explicit, honest state.
 */
export function assessVariant(v: PrintVariantView, master: PrintMasterView | null): VariantAssessment {
  const masterReady = master?.status === "ready";
  const asset = printReadyAssetOf(v, master);
  const priced = v.retailMinor != null && v.retailMinor > 0;

  // Hard exclusions — a variant an admin has not turned on, or that failed the resolution
  // engine, is never even offered as provisional.
  if (!v.enabled) {
    return { state: "unavailable", reason: "Not enabled", masterReady, prodigiVerified: v.prodigiVerified };
  }
  // THE SKU GATE. The variant's Prodigi SKU must be a sandbox-verified, active-launch product.
  // An invented, mistyped, or non-launch SKU (e.g. the 404'd GLOBAL-PR-*, or Enhanced Matte which
  // is not in the launch) can never be sold — this is the single point that enforces it everywhere.
  if (!isActiveLaunchSku(v.prodigiSku)) {
    return { state: "unavailable", reason: "Unverified Prodigi SKU", masterReady, prodigiVerified: v.prodigiVerified };
  }
  if (!v.eligible) {
    return {
      state: "unavailable",
      reason: "Resolution too low for this size",
      masterReady,
      prodigiVerified: v.prodigiVerified,
    };
  }

  // Enabled + eligible but not yet backed by a ready master / price / asset → PROVISIONAL. The
  // configurator may show the size and its indicative price, but it cannot be added to a cart.
  if (!masterReady || !priced || !asset) {
    const missing: string[] = [];
    if (!masterReady) missing.push("awaiting a print-ready master");
    if (!priced) missing.push("no own-site price yet");
    if (!asset) missing.push("no print-ready file");
    return {
      state: "provisional",
      reason: missing.join(" · "),
      masterReady,
      prodigiVerified: v.prodigiVerified,
    };
  }

  return { state: "purchasable", reason: null, masterReady, prodigiVerified: v.prodigiVerified };
}

/** True only when a variant can be added to a cart and bought right now. */
export function isPubliclyPurchasable(v: PrintVariantView, master: PrintMasterView | null): boolean {
  return assessVariant(v, master).state === "purchasable";
}

/** The lowest own-site price (minor units) among genuinely purchasable variants, or null. */
export function startingPriceMinor(
  variants: PrintVariantView[],
  master: PrintMasterView | null,
): number | null {
  const prices = variants
    .filter((v) => isPubliclyPurchasable(v, master))
    .map((v) => v.retailMinor!)
    .filter((n) => n > 0);
  return prices.length ? Math.min(...prices) : null;
}

/** Does this print product have at least one purchasable variant? Gates storefront/sitemap/feed. */
export function hasPurchasableVariant(variants: PrintVariantView[], master: PrintMasterView | null): boolean {
  return variants.some((v) => isPubliclyPurchasable(v, master));
}

export interface PrintItemSnapshot {
  itemType: "print";
  printId: number;
  printVariantId: number;
  artworkId: number | null;
  title: string;
  material: string;
  sizeLabel: string;
  widthCm: number;
  heightCm: number;
  framed: boolean;
  frameColour: string | null;
  prodigiSku: string;
  printReadyAssetUrl: string | null;
  quantity: number;
  unitPriceMinor: number;
  currency: string;
  image: string | null;
}

/**
 * Build the historical snapshot stored on the order so the exact variant can be reconstructed
 * long after the variant row changes — the print equivalent of the artwork snapshot. The server
 * builds this from DB rows at checkout; nothing here is read from the client.
 */
export function buildPrintItemSnapshot(args: {
  print: { id: number; title: string; artworkId: number | null };
  variant: PrintVariantView;
  master: PrintMasterView | null;
  quantity: number;
  image?: string | null;
}): PrintItemSnapshot {
  const { print, variant, master, quantity } = args;
  return {
    itemType: "print",
    printId: print.id,
    printVariantId: variant.id,
    artworkId: print.artworkId,
    title: print.title,
    material: variant.material,
    sizeLabel: variant.sizeLabel,
    widthCm: variant.widthCm,
    heightCm: variant.heightCm,
    framed: variant.framed,
    frameColour: variant.frameColour,
    prodigiSku: variant.prodigiSku,
    printReadyAssetUrl: printReadyAssetOf(variant, master),
    quantity,
    unitPriceMinor: variant.retailMinor ?? 0,
    currency: variant.currency,
    image: args.image ?? (variant.mockups && variant.mockups[0]) ?? null,
  };
}

/** The server price for a quantity of a variant, in minor units. The ONLY price a checkout charges. */
export function resolveVariantPrice(v: PrintVariantView, quantity: number): number | null {
  if (v.retailMinor == null || v.retailMinor <= 0) return null;
  const q = Math.max(1, Math.floor(quantity));
  return v.retailMinor * q;
}

/** Canonical path for a print PDP — distinct namespace from /artworks so no duplicate-content clash. */
export function printCanonicalPath(slug: string): string {
  return `/prints/${slug}`;
}

export function printCanonicalUrl(baseUrl: string, slug: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${printCanonicalPath(slug)}`;
}
