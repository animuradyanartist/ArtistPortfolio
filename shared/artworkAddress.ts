/**
 * WHICH ADDRESSES BELONG TO AN ARTWORK.
 *
 * A painting has accumulated several legitimate addresses: the canonical one the page
 * declares, the marketplace slug it was imported under, an optional seoSlug, and the bare
 * numeric id. All of those should resolve. Nothing else should.
 *
 * The distinction was missing. The resolver accepted any path ending in `-<id>`, so
 * /artworks/total-nonsense-40 and /completely-made-up-40 both served Blue Drift with full
 * VisualArtwork markup — an unbounded family of near-duplicates per painting. Google
 * discovers such URLs, queues them, and declines to spend crawl budget: which is what
 * "Discovered – currently not indexed" says.
 *
 * PURE, and shared, so the redirect, the resolver and the tests cannot disagree about what
 * counts as an address.
 */
import { toSlug } from "./canonical";

export interface AddressableArtwork {
  id: number;
  title: string;
  slug?: string | null;
  seoSlug?: string | null;
}

/** Every path segment that legitimately identifies this work. */
export function knownAddresses(a: AddressableArtwork): string[] {
  return [
    `${toSlug(a.title)}-${a.id}`,   // canonical
    a.slug?.trim() || null,          // marketplace slug it was imported under
    a.seoSlug?.trim() || null,       // explicit SEO slug, when one exists
    String(a.id),                    // bare id
  ].filter((v): v is string => Boolean(v));
}

/** Case-insensitive, because a crawler will try both and only one may be linked. */
export function isKnownAddressFor(a: AddressableArtwork, param: string): boolean {
  const p = param.trim().toLowerCase();
  return knownAddresses(a).some((k) => k.toLowerCase() === p);
}
