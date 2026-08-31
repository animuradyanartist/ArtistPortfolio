/**
 * ██ DEVELOPMENT / PREVIEW ONLY — NOT A PRODUCT SYSTEM ██
 *
 * This module exists so the storefront UI (shop layout, PDP, size/material selectors, quantity,
 * price presentation, responsive behaviour, original ↔ print navigation) can be SEEN and tested
 * using the existing medium-resolution portfolio images BEFORE real high-resolution masters exist.
 *
 * HARD ISOLATION — a preview product can NEVER become a real sale:
 *   • It has NO row in `print_variants` and NO `print_masters` record, so the real checkout
 *     (`getVariantForCheckout` → DB) can't resolve it, and the Pinterest feed (DB-only) can't emit it.
 *   • It never passes through `assessVariant` / `assessMasterForSku`, so it can't satisfy real
 *     eligibility. A medium-res web image is never a master.
 *   • Its prices are DEV PLACEHOLDERS (see DEMO_PRICE_MINOR) and must NEVER reach real checkout,
 *     the feed, GA purchase/revenue events, Prodigi, or production sellability logic.
 *
 * It is surfaced ONLY when the server flag PRINT_PREVIEW_MODE is on (see server previewProducts.ts).
 * Production/default is off and fail-closed. Everything here is pure + unit-tested.
 */

import { PRODIGI_LAUNCH_PRODUCTS, productsForMaterial, type PrintMaterial } from "./prodigiProducts";

export interface PreviewProductSpec {
  /** Matched case-insensitively against a REAL portfolio artwork (image URLs are reused, not copied). */
  artworkTitle: string;
  /** The /prints/:slug the demo product lives at. */
  slug: string;
  material: PrintMaterial;
}

/**
 * DEV PLACEHOLDER PRICES (minor units) per verified SKU. NOT real pricing. Used only to render the
 * price/CTA UI in preview mode. Never sent to checkout, the feed, GA revenue, Prodigi, or the DB.
 */
export const DEMO_PRICE_MINOR: Record<string, number> = {
  "GLOBAL-HGE-A3": 7500,
  "GLOBAL-HGE-12X16": 6500, // 30×40 cm
  "GLOBAL-HGE-16X20": 9500, // 40×50 cm
  "GLOBAL-HGE-18X24": 13500, // 45×60 cm
  "GLOBAL-HGE-A2": 15500,
  "GLOBAL-HPR-A3": 8000,
  "GLOBAL-HPR-16X20": 10500,
};

export const DEMO_CURRENCY = "EUR";

/** Three Tier-A works, chosen for the demo. German Etching only (the flagship, fully verified). */
export const PREVIEW_PRODUCTS: readonly PreviewProductSpec[] = [
  { artworkTitle: "Road to Tuscany", slug: "road-to-tuscany", material: "german-etching" },
  { artworkTitle: "No Measure for Distance", slug: "no-measure-for-distance", material: "german-etching" },
  { artworkTitle: "A Sign in the Distance", slug: "a-sign-in-the-distance", material: "german-etching" },
];

export interface PreviewArtworkRef {
  id: number;
  title: string;
  /** The stable existing image URL to reuse (e.g. "/img/artwork/69/0"). */
  image: string;
  /** Path to the original artwork page, for the "View original artwork" link. */
  artworkPath: string;
}

export interface PreviewSizeOption {
  /** Internal only — a stable key for the selector. NEVER shown to customers. */
  sku: string;
  /** Customer-facing size label, e.g. "30 × 40 cm" or "A2". No pixels, ever. */
  sizeLabel: string;
  priceMinor: number;
  currency: string;
}

export interface PreviewProduct {
  /** Always true — the client uses this to disable checkout and show the preview CTA. */
  preview: true;
  slug: string;
  artworkId: number;
  artworkPath: string;
  title: string;
  image: string;
  material: PrintMaterial;
  materialLabel: string;
  currency: string;
  startingPriceMinor: number | null;
  sizes: PreviewSizeOption[];
}

const MATERIAL_DISPLAY: Record<PrintMaterial, string> = {
  "german-etching": "Hahnemühle German Etching",
  "photo-rag": "Hahnemühle Photo Rag",
  "stretched-canvas": "Stretched Canvas",
};

/** Build a demo product from a spec + the resolved real artwork. Sizes come from the VERIFIED
 *  catalogue (never invented); prices are DEV placeholders. Returns null if the artwork is absent. */
export function buildPreviewProduct(spec: PreviewProductSpec, artwork: PreviewArtworkRef | null): PreviewProduct | null {
  if (!artwork) return null;
  const sizes: PreviewSizeOption[] = productsForMaterial(spec.material)
    .map((p) => {
      const priceMinor = DEMO_PRICE_MINOR[p.sku];
      if (priceMinor == null) return null;
      return { sku: p.sku, sizeLabel: p.friendlyLabel, priceMinor, currency: DEMO_CURRENCY };
    })
    .filter((s): s is PreviewSizeOption => s !== null);

  const startingPriceMinor = sizes.length ? Math.min(...sizes.map((s) => s.priceMinor)) : null;

  return {
    preview: true,
    slug: spec.slug,
    artworkId: artwork.id,
    artworkPath: artwork.artworkPath,
    title: artwork.title,
    image: artwork.image,
    material: spec.material,
    materialLabel: MATERIAL_DISPLAY[spec.material],
    currency: DEMO_CURRENCY,
    startingPriceMinor,
    sizes,
  };
}

/** All demo products, given a resolver from a spec's artworkTitle to a real artwork ref. */
export function buildPreviewCatalogue(resolve: (title: string) => PreviewArtworkRef | null): PreviewProduct[] {
  return PREVIEW_PRODUCTS
    .map((spec) => buildPreviewProduct(spec, resolve(spec.artworkTitle)))
    .filter((p): p is PreviewProduct => p !== null);
}

export function findPreviewSpecBySlug(slug: string): PreviewProductSpec | null {
  return PREVIEW_PRODUCTS.find((p) => p.slug === slug.trim().toLowerCase()) ?? null;
}

export function isPreviewArtworkTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  return PREVIEW_PRODUCTS.some((p) => p.artworkTitle.toLowerCase() === t);
}

/** Sanity guard used by tests: every demo SKU is a real catalogue SKU (no invented sizes). */
export function demoSkusAreAllVerified(): boolean {
  const known = new Set(PRODIGI_LAUNCH_PRODUCTS.map((p) => p.sku));
  return Object.keys(DEMO_PRICE_MINOR).every((sku) => known.has(sku));
}
