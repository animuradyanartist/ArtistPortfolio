/**
 * ██ DEVELOPMENT / PREVIEW ONLY ██  — the server surface of the demo storefront.
 *
 * Gated entirely by the env flag PRINT_PREVIEW_MODE (default OFF → production fail-closed). When
 * ON, it builds demo print products from REAL portfolio artworks (reusing their existing image
 * URLs) + the VERIFIED size catalogue + DEV placeholder prices, purely so the storefront UI can be
 * evaluated before real masters exist.
 *
 * It touches NONE of the real sale path: no `print_variants`, no `print_masters`, no
 * `assessVariant`, no checkout resolution, no feed. A preview product literally cannot be bought
 * (the real checkout resolves variants from the DB, which has no preview rows) and cannot be fed.
 */

import { storage } from "../../storage";
import { artworkCanonicalPath } from "@shared/canonical";
import {
  buildPreviewCatalogue,
  buildPreviewProduct,
  findPreviewSpecBySlug,
  isPreviewArtworkTitle,
  PREVIEW_PRODUCTS,
  type PreviewArtworkRef,
  type PreviewProduct,
} from "@shared/commerce/previewCatalogue";

/** THE flag. Only "true"/"1" turns preview on; anything else (incl. unset) is production/off. */
export function isPrintPreviewMode(): boolean {
  const v = process.env.PRINT_PREVIEW_MODE?.trim().toLowerCase();
  return v === "true" || v === "1";
}

/** Reuse the existing image system — a stable app-served ref, never a copied asset. */
function artworkRef(a: { id: number; title: string; seoSlug?: string | null }): PreviewArtworkRef {
  return {
    id: a.id,
    title: a.title,
    image: `/img/artwork/${a.id}/0`,
    artworkPath: artworkCanonicalPath({ id: a.id, title: a.title, seoSlug: a.seoSlug ?? null }),
  };
}

async function resolverByTitle(): Promise<(title: string) => PreviewArtworkRef | null> {
  const artworks = await storage.getAllArtworks();
  const byTitle = new Map(artworks.map((a) => [a.title.trim().toLowerCase(), a]));
  return (title: string) => {
    const a = byTitle.get(title.trim().toLowerCase());
    return a ? artworkRef(a) : null;
  };
}

/** Demo products for the /prints collection. Empty unless preview mode is on. */
export async function getPreviewCatalogue(): Promise<PreviewProduct[]> {
  if (!isPrintPreviewMode()) return [];
  const resolve = await resolverByTitle();
  return buildPreviewCatalogue(resolve);
}

/** A single demo product by slug, or null. Empty unless preview mode is on. */
export async function getPreviewDetail(slug: string): Promise<PreviewProduct | null> {
  if (!isPrintPreviewMode()) return null;
  const spec = findPreviewSpecBySlug(slug);
  if (!spec) return null;
  const resolve = await resolverByTitle();
  return buildPreviewProduct(spec, resolve(spec.artworkTitle));
}

/** The demo print slug for an artwork id (preview mode only) — powers the isolated preview cross-link. */
export async function getPreviewSlugForArtwork(artworkId: number): Promise<string | null> {
  if (!isPrintPreviewMode()) return null;
  const artwork = await storage.getArtwork(artworkId);
  if (!artwork || !isPreviewArtworkTitle(artwork.title)) return null;
  const spec = PREVIEW_PRODUCTS.find((p) => p.artworkTitle.toLowerCase() === artwork.title.trim().toLowerCase());
  return spec?.slug ?? null;
}
