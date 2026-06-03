import { db } from "./db";
import { artworks } from "@shared/schema";
import { eq } from "drizzle-orm";
import { scrapeAllArtworks, type ScrapedArtwork } from "./singulart-scraper";

/**
 * Singulart → local artworks sync.
 *
 * - Scrape the artist's Singulart gallery (one network round-trip per call).
 * - For each scraped artwork (keyed by Singulart's stable numeric `id`):
 *     - INSERT if no local row exists with that singulartId.
 *     - UPDATE only sync-managed fields (title, slug, medium, dimensions,
 *       price, images, buyLink). Admin-owned fields (description, year,
 *       availability, featured, position, print fields) are preserved.
 * - We never delete locally — if a piece disappears from Singulart, the local
 *   row stays. Admin can manually delete from the existing admin UI.
 *
 * Safety:
 * - A scrape returning zero artworks is treated as an error (likely a markup
 *   change on Singulart's side). We abort without touching the DB.
 * - All exceptions are caught and surfaced via `SyncResult.error` so the
 *   endpoint can return a 5xx without crashing the server.
 */

export type SyncResult = {
  scrapedCount: number;
  inserted: number;
  updated: number;
  error: string | null;
};

const DEFAULT_ARTIST_URL =
  "https://www.singulart.com/en/artist/ani-muradyan-62448";

function deriveType(medium: string | null): string {
  if (!medium) return "oil";
  const m = medium.toLowerCase();
  if (m.includes("acrylic")) return "acrylic";
  if (m.includes("mixed") || m.includes("pastel") || m.includes("pen")) return "mixed";
  return "oil";
}

function deriveSize(widthCm: number | null, heightCm: number | null): string {
  const max = Math.max(widthCm ?? 0, heightCm ?? 0);
  if (max === 0) return "medium";
  if (max <= 50) return "small";
  if (max <= 90) return "medium";
  return "large";
}

function formatDimensions(w: number | null, h: number | null): string {
  if (w && h) return `${w}x${h}cm`;
  if (w) return `${w}cm`;
  if (h) return `${h}cm`;
  return "";
}

export async function runSingulartSync(
  scraper: () => Promise<ScrapedArtwork[]> = () =>
    scrapeAllArtworks(process.env.SINGULART_ARTIST_URL || DEFAULT_ARTIST_URL),
): Promise<SyncResult> {
  try {
    const scraped = await scraper();
    if (scraped.length === 0) {
      return {
        scrapedCount: 0,
        inserted: 0,
        updated: 0,
        error: "Scrape returned zero artworks — aborting",
      };
    }

    let inserted = 0;
    let updated = 0;
    const currentYear = new Date().getFullYear();

    for (const s of scraped) {
      const dims = formatDimensions(s.widthCm, s.heightCm);
      const mapped = {
        title: s.title,
        slug: s.slug,
        description: "", // admin can edit
        medium: s.medium ?? "Oil on Canvas",
        dimensions: dims || "Unknown",
        year: currentYear, // admin can edit
        price: s.priceUsd ?? 0,
        images: [s.imageUrl],
        type: deriveType(s.medium),
        size: deriveSize(s.widthCm, s.heightCm),
        availability: "available" as const,
        buyLink: s.singulartUrl,
        singulartId: s.id,
        source: "singulart" as const,
      };

      const existing = await db
        .select()
        .from(artworks)
        .where(eq(artworks.singulartId, s.id))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(artworks).values(mapped);
        inserted++;
      } else {
        // Update only sync-managed fields. Admin owns the rest.
        await db
          .update(artworks)
          .set({
            title: mapped.title,
            slug: mapped.slug,
            medium: mapped.medium,
            dimensions: mapped.dimensions,
            price: mapped.price,
            images: mapped.images,
            buyLink: mapped.buyLink,
          })
          .where(eq(artworks.singulartId, s.id));
        updated++;
      }
    }

    return {
      scrapedCount: scraped.length,
      inserted,
      updated,
      error: null,
    };
  } catch (err) {
    return {
      scrapedCount: 0,
      inserted: 0,
      updated: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
