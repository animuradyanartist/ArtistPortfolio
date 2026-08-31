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

import { isActiveLaunchSku, isSkuOfferedForNewVariant } from "./prodigiProducts";

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

/**
 * The variants a NEW public purchase may SELECT on the storefront PDP. Two gates:
 *   1. not 'unavailable' — disabled or resolution-failing variants are hidden (unchanged behaviour), and
 *   2. OFFERED for new variants — the retired Photo Rag stock is NEVER offered again publicly (historical
 *      orders still fulfil; only *new* selection is blocked).
 * Pure, so the PDP route and its tests judge "what the customer may pick" identically. This does NOT
 * change the purchasability/pricing gate itself (isPubliclyPurchasable / startingPriceMinor) — it is only
 * the public *selectable* set, so an offered German Etching / Canvas variant behaves exactly as before.
 */
export function publicSelectableVariants(
  variants: PrintVariantView[],
  master: PrintMasterView | null,
): PrintVariantView[] {
  return variants.filter(
    (v) => assessVariant(v, master).state !== "unavailable" && isSkuOfferedForNewVariant(v.prodigiSku),
  );
}

/**
 * The admin list status of a print product — the ONE label the management table shows. It is
 * DERIVED from the real data and can never lie: "Published" means the fail-closed purchasability
 * gate genuinely passes for at least one variant, so a print cannot look live because someone typed
 * a label. The ladder, hidden → live:
 *   - "draft"      — the product row is not active (hidden from the storefront regardless of variants).
 *   - "not-ready"  — active, but no master is ready yet → nothing can be sold (the honest default today).
 *   - "ready"      — active + a ready master + an eligible, priced, verified variant EXISTS, but none is
 *                    enabled yet → the admin can turn it on, but the public sees nothing.
 *   - "published"  — active + at least one genuinely purchasable variant → it is on the storefront.
 */
export type PrintAdminStatus = "draft" | "not-ready" | "ready" | "published";

export interface PrintAdminSummary {
  status: PrintAdminStatus;
  /** Distinct materials across the product's variants, in first-seen order (e.g. ["photo-rag", ...]). */
  materials: string[];
  variantCount: number;
  enabledCount: number;
  /** Lowest own-site price among genuinely purchasable variants, or null when nothing is buyable. */
  startingPriceMinor: number | null;
  /**
   * Lowest CONFIGURED variant price, regardless of whether it is purchasable yet — the price the
   * admin has set. Non-null as soon as any variant carries a price, so the admin table shows the
   * intended price on a Draft/Ready row (unlike `startingPriceMinor`, which the storefront uses and
   * which stays null until the print is genuinely buyable).
   */
  lowestPriceMinor: number | null;
  currency: string;
}

/**
 * Summarise a print product for the admin management table — every field derived, none stored. The
 * caller passes the product's own `status` (active/hidden) plus its variants and master; nothing here
 * trusts a manual "starting price" or "is live" flag.
 */
export function printAdminSummary(
  productStatus: string,
  variants: PrintVariantView[],
  master: PrintMasterView | null,
): PrintAdminSummary {
  const materials: string[] = [];
  for (const v of variants) if (!materials.includes(v.material)) materials.push(v.material);
  const enabledCount = variants.filter((v) => v.enabled).length;
  const purchasable = hasPurchasableVariant(variants, master);
  // A variant that could be sold the moment an admin enables it: the master is ready, it cleared
  // eligibility, carries a verified launch SKU and a real price — everything but the `enabled` flag.
  const sellableIfEnabled = variants.some(
    (v) => isActiveLaunchSku(v.prodigiSku) && v.eligible && master?.status === "ready" && (v.retailMinor ?? 0) > 0,
  );

  let status: PrintAdminStatus;
  if (productStatus !== "active") status = "draft";
  else if (purchasable) status = "published";
  else if (sellableIfEnabled) status = "ready";
  else status = "not-ready";

  const currency = variants.find((v) => isPubliclyPurchasable(v, master))?.currency
    ?? variants[0]?.currency
    ?? "USD";

  const configuredPrices = variants
    .map((v) => v.retailMinor)
    .filter((n): n is number => n != null && n > 0);
  const lowestPriceMinor = configuredPrices.length ? Math.min(...configuredPrices) : null;

  return {
    status,
    materials,
    variantCount: variants.length,
    enabledCount,
    startingPriceMinor: startingPriceMinor(variants, master),
    lowestPriceMinor,
    currency,
  };
}

/**
 * PRINT READINESS — the checklist the unified admin editor shows, and the SAME gate the publish
 * action is held to. Every check is derived from the real product/master/variant data. `canPublish`
 * is true only when a genuinely purchasable variant exists (master ready + eligible + enabled +
 * priced + verified launch SKU + asset) AND the product is presentable (title, description, artwork,
 * a public image) — so "Publish" can never make an unready print live. Pure and unit-tested; both
 * the client panel and the server publish guard call it, so they can never disagree.
 */
export interface PrintReadinessInput {
  title: string;
  description: string;
  artworkId: number | null;
  imageCount: number;
  master: PrintMasterView | null;
  variants: PrintVariantView[];
}

export interface PrintReadinessCheck {
  key: string;
  label: string;
  ok: boolean;
  /** Shown when the check fails. */
  hint: string;
}

export interface PrintReadiness {
  checks: PrintReadinessCheck[];
  /** Labels of the failed checks, for a "Cannot publish yet" explanation. */
  missing: string[];
  /** True only when every required check passes — the fail-closed publish gate. */
  canPublish: boolean;
  state: PrintAdminStatus;
}

export function printReadiness(input: PrintReadinessInput, productStatus: string): PrintReadiness {
  const { master, variants } = input;
  const checks: PrintReadinessCheck[] = [
    {
      key: "details",
      label: "Print details complete",
      ok: input.title.trim().length > 0 && input.description.trim().length > 0 && input.artworkId != null,
      hint: "Add a title, a description and the source artwork.",
    },
    {
      key: "image",
      label: "Public image added",
      ok: input.imageCount > 0,
      hint: "Add at least one storefront image.",
    },
    {
      key: "master",
      label: "High-resolution master uploaded",
      ok: !!(master && master.printReadyAssetUrl && master.widthPx && master.heightPx),
      hint: "Upload a high-resolution print file.",
    },
    {
      key: "master-eligible",
      label: "Master resolution eligible",
      ok: master?.status === "ready",
      hint: "The uploaded file's resolution must clear the print floor.",
    },
    {
      key: "option",
      label: "At least one material/size option configured",
      ok: variants.length > 0,
      hint: "Add a print option (material + size).",
    },
    {
      key: "price",
      label: "Selling price added",
      ok: variants.some((v) => (v.retailMinor ?? 0) > 0),
      hint: "Set a price on at least one option.",
    },
    {
      key: "sku",
      label: "Verified Prodigi product",
      ok: variants.some((v) => isActiveLaunchSku(v.prodigiSku)),
      hint: "Each option must map to a verified Prodigi size.",
    },
    {
      key: "enabled",
      label: "Option enabled and purchasable",
      ok: hasPurchasableVariant(variants, master),
      hint: "Enable an eligible, priced option.",
    },
  ];
  const missing = checks.filter((c) => !c.ok).map((c) => c.label);
  return {
    checks,
    missing,
    canPublish: checks.every((c) => c.ok),
    state: printAdminSummary(productStatus, variants, master).status,
  };
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
