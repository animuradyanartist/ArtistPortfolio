import { db } from "./db";
import { artworks } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  scrapeAllArtworks,
  fetchSingulartPage,
  parseArtworkImages,
  type ScrapedArtwork,
} from "./singulart-scraper";

/**
 * Singulart → local artworks sync (INCREMENTAL images).
 *
 * The gallery pages give the artwork LIST + one thumbnail each. The full
 * per-artwork image set lives on each artwork's DETAIL page. Fetching every
 * detail page on every sync is wasteful, so image fetching is incremental:
 *   - New artwork          → fetch its detail page, store [MAIN, ...ALTs].
 *   - Existing, >1 image    → preserve as-is; never re-fetch, never downgrade.
 *   - Existing, ≤1 image    → fetch the detail page ONCE; if it yields more
 *                             images, enrich (upgrade to the full ordered set).
 *
 * Metadata (title, price, dimensions, slug, buyLink) is always refreshed from
 * the gallery pages. Admin-owned fields (description, year, availability,
 * featured, position, print fields) are preserved. Nothing is ever deleted.
 * The MAIN image stays first, so images[0] remains the cover.
 */

// Rough per-request price for Zyte's browser + anti-bot tier (USD). Used only to
// estimate a sync's cost for the report — not billing-accurate.
export const ZYTE_COST_PER_REQUEST = 0.016;
const GALLERY_PAGE_REQUESTS = 2; // scrapeAllArtworks fetches page 1 + page 2

export type SyncResult = {
  scrapedCount: number;
  inserted: number; // new artworks
  updated: number; // existing artworks whose metadata was refreshed
  detailPagesFetched: number; // detail pages fetched (new + enrichment attempts)
  existingSkipped: number; // existing multi-image artworks left untouched
  enriched: number; // existing artworks upgraded to a multi-image set
  estimatedZyteCostUsd: number;
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

/**
 * Decide what to do about an artwork's images this sync (pure + testable):
 *  - "insert"   — brand-new artwork: fetch detail, store its images.
 *  - "preserve" — existing with >1 image: leave alone, do NOT fetch the detail.
 *  - "enrich"   — existing with ≤1 image: fetch the detail page once and maybe
 *                 upgrade it to the full set.
 */
export function decideImageAction(
  isNew: boolean,
  currentImageCount: number,
): "insert" | "preserve" | "enrich" {
  if (isNew) return "insert";
  return currentImageCount > 1 ? "preserve" : "enrich";
}

/**
 * Given the action + the fetched detail images (null if not fetched / failed),
 * return the images array to WRITE, or null to leave the stored images
 * untouched. Guarantees a multi-image array is never replaced by fewer images.
 */
export function resolveImages(
  action: "insert" | "preserve" | "enrich",
  currentImages: string[],
  scrapedCover: string,
  detailImages: string[] | null,
): string[] | null {
  if (action === "preserve") return null;
  if (action === "insert") {
    return detailImages && detailImages.length > 0 ? detailImages : [scrapedCover];
  }
  // enrich: only upgrade when the detail page genuinely adds images.
  if (detailImages && detailImages.length > currentImages.length) return detailImages;
  return null;
}

async function defaultFetchDetailImages(s: ScrapedArtwork): Promise<string[]> {
  const html = await fetchSingulartPage(s.singulartUrl);
  return parseArtworkImages(html, s.id);
}

/**
 * Minimal persistence surface the sync needs, so the incremental logic can be
 * tested end-to-end with an in-memory store (the default wraps Drizzle).
 */
export interface ArtworkStore {
  findBySingulartId(id: string): Promise<{ images: string[] } | undefined>;
  insertArtwork(row: typeof artworks.$inferInsert): Promise<void>;
  updateBySingulartId(id: string, set: Partial<typeof artworks.$inferInsert>): Promise<void>;
}

const drizzleStore: ArtworkStore = {
  async findBySingulartId(id) {
    const rows = await db
      .select()
      .from(artworks)
      .where(eq(artworks.singulartId, id))
      .limit(1);
    return rows[0];
  },
  async insertArtwork(row) {
    await db.insert(artworks).values(row);
  },
  async updateBySingulartId(id, set) {
    await db.update(artworks).set(set).where(eq(artworks.singulartId, id));
  },
};

export async function runSingulartSync(
  scraper: () => Promise<ScrapedArtwork[]> = () =>
    scrapeAllArtworks(process.env.SINGULART_ARTIST_URL || DEFAULT_ARTIST_URL),
  fetchDetailImages: (s: ScrapedArtwork) => Promise<string[]> = defaultFetchDetailImages,
  store: ArtworkStore = drizzleStore,
): Promise<SyncResult> {
  const base = {
    scrapedCount: 0,
    inserted: 0,
    updated: 0,
    detailPagesFetched: 0,
    existingSkipped: 0,
    enriched: 0,
    estimatedZyteCostUsd: 0,
  };
  try {
    const scraped = await scraper();
    if (scraped.length === 0) {
      return { ...base, error: "Scrape returned zero artworks — aborting" };
    }

    let inserted = 0;
    let updated = 0;
    let detailPagesFetched = 0;
    let existingSkipped = 0;
    let enriched = 0;
    const currentYear = new Date().getFullYear();

    for (const s of scraped) {
      const dims = formatDimensions(s.widthCm, s.heightCm);
      // Sync-managed metadata, always refreshed from the gallery pages.
      const metadata = {
        title: s.title,
        slug: s.slug,
        medium: s.medium ?? "Oil on Canvas",
        dimensions: dims || "Unknown",
        price: s.priceUsd ?? 0,
        buyLink: s.singulartUrl,
      };

      const existing = await store.findBySingulartId(s.id);
      const isNew = !existing;
      const currentImages: string[] = existing?.images ?? [];
      const action = decideImageAction(isNew, currentImages.length);

      // Only "insert" and "enrich" touch the detail page.
      let detailImages: string[] | null = null;
      if (action === "insert" || action === "enrich") {
        try {
          detailImages = await fetchDetailImages(s);
          detailPagesFetched++;
        } catch {
          detailImages = null; // detail fetch failed — degrade gracefully
        }
      }
      const imagesToWrite = resolveImages(action, currentImages, s.imageUrl, detailImages);

      if (isNew) {
        await store.insertArtwork({
          ...metadata,
          description: "", // admin can edit
          year: currentYear, // admin can edit
          images: imagesToWrite ?? [s.imageUrl],
          type: deriveType(s.medium),
          size: deriveSize(s.widthCm, s.heightCm),
          availability: "available",
          singulartId: s.id,
          source: "singulart",
        });
        inserted++;
      } else {
        const set: Partial<typeof artworks.$inferInsert> = { ...metadata };
        if (imagesToWrite) {
          set.images = imagesToWrite;
          if (action === "enrich") enriched++;
        } else if (action === "preserve") {
          existingSkipped++;
        }
        await store.updateBySingulartId(s.id, set);
        updated++;
      }
    }

    const estimatedZyteCostUsd = Number(
      ((GALLERY_PAGE_REQUESTS + detailPagesFetched) * ZYTE_COST_PER_REQUEST).toFixed(3),
    );

    const result: SyncResult = {
      scrapedCount: scraped.length,
      inserted,
      updated,
      detailPagesFetched,
      existingSkipped,
      enriched,
      estimatedZyteCostUsd,
      error: null,
    };
    console.log("[singulart-sync]", JSON.stringify(result));
    return result;
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }
}
