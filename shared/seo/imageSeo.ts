/**
 * GOOGLE IMAGES SEO (Task 8) — a first-class acquisition channel for an artist site, whose whole
 * product is images. This audits each artwork page against the signals that actually move Google
 * Images: descriptive image URLs, honest alt text, ImageObject/VisualArtwork schema with real
 * dimensions, image-sitemap inclusion, unique surrounding copy, internal links, and the
 * original↔print canonical relationship. It recommends NO hacks and NO keyword stuffing — every
 * recommendation is "describe the real work more completely", which is what Images rewards.
 *
 * Pure + shared + unit-tested. The service feeds it real artwork signals; findings surface in admin.
 */

export type ImageSeoIssue =
  | "non-descriptive-image-url"
  | "missing-or-weak-alt"
  | "no-image-schema"
  | "missing-image-dimensions"
  | "not-in-image-sitemap"
  | "thin-page-copy"
  | "few-internal-links"
  | "missing-print-crosslink";

export type Priority = "High" | "Medium" | "Low";
export type ImageSeoCategory = "Image SEO" | "Technical SEO" | "Content" | "Internal linking";

export interface ArtworkImageSignals {
  id: number;
  title: string;
  url: string;
  /** The primary image URL as served (e.g. "/img/artwork/69/0"). */
  imageUrl: string;
  /** Alt text if any (the site generates one from the title). */
  altText?: string | null;
  /** VisualArtwork/ImageObject JSON-LD present on the page. */
  hasImageSchema: boolean;
  /** Explicit image width+height available (on the tag or in schema). */
  hasImageDimensions: boolean;
  /** The image is included in image-sitemap.xml. */
  inImageSitemap: boolean;
  /** Word count of the artwork's own descriptive copy (surrounding semantic text). */
  descriptionWordCount: number;
  /** Count of internal links pointing at this artwork page. */
  internalLinkCount: number;
  availableForPrint: boolean;
  hasPurchasablePrint: boolean;
}

export interface ImageSeoFinding {
  artworkId: number;
  title: string;
  url: string;
  issue: ImageSeoIssue;
  priority: Priority;
  category: ImageSeoCategory;
  reason: string;
  recommendedChange: string;
}

/** A descriptive image URL contains words, not just an id/number path segment. */
export function imageUrlIsDescriptive(imageUrl: string): boolean {
  const last = imageUrl.split("?")[0].split("/").filter(Boolean).pop() ?? "";
  const stem = last.replace(/\.[a-z0-9]+$/i, "");
  // id-only ("0", "69") or short numeric stems are non-descriptive; a slug with letters is.
  return /[a-z]{3,}/i.test(stem) && !/^\d+$/.test(stem);
}

/** Alt is "weak" if absent, very short, or the bare title with no subject/medium context. */
function altIsWeak(alt: string | null | undefined): boolean {
  const a = (alt ?? "").trim();
  if (a.length < 12) return true;
  return a.split(/\s+/).length < 4;
}

/** Audit ONE artwork's image SEO. Returns the concrete findings (never stuffing/hacks). */
export function auditArtworkImageSeo(s: ArtworkImageSignals): ImageSeoFinding[] {
  const out: ImageSeoFinding[] = [];
  const base = { artworkId: s.id, title: s.title, url: s.url };

  if (!imageUrlIsDescriptive(s.imageUrl)) {
    out.push({ ...base, issue: "non-descriptive-image-url", priority: "Medium", category: "Image SEO",
      reason: `The image is served at "${s.imageUrl}" — an id path with no words, which gives Google Images no filename signal.`,
      recommendedChange: `Serve/alias the primary image at a descriptive path (e.g. /img/artwork/${slugish(s.title)}.jpg) while keeping the existing URL working.` });
  }
  if (altIsWeak(s.altText)) {
    out.push({ ...base, issue: "missing-or-weak-alt", priority: "High", category: "Image SEO",
      reason: "Alt text is missing or too thin to describe the work.",
      recommendedChange: `Write honest alt describing the subject, that it is an original oil on canvas by Ani Muradyan, and its mood/palette — e.g. "${s.title} — original contemporary oil landscape by Ani Muradyan". Describe the image, don't stuff keywords.` });
  }
  if (!s.hasImageSchema) {
    out.push({ ...base, issue: "no-image-schema", priority: "Medium", category: "Technical SEO",
      reason: "No VisualArtwork/ImageObject structured data for the image.",
      recommendedChange: "Add VisualArtwork JSON-LD with image, name, creator (Ani Muradyan), artMedium and dimensions." });
  } else if (!s.hasImageDimensions) {
    out.push({ ...base, issue: "missing-image-dimensions", priority: "Low", category: "Technical SEO",
      reason: "Schema/tag lacks explicit image width+height.",
      recommendedChange: "Add width and height to the image (and to the ImageObject) so Google can assess quality and avoid layout shift." });
  }
  if (!s.inImageSitemap) {
    out.push({ ...base, issue: "not-in-image-sitemap", priority: "High", category: "Technical SEO",
      reason: "The artwork's image is not listed in image-sitemap.xml — it may never be discovered by Google Images.",
      recommendedChange: "Ensure this artwork's primary image is emitted in /image-sitemap.xml with its caption/title." });
  }
  if (s.descriptionWordCount < 40) {
    out.push({ ...base, issue: "thin-page-copy", priority: "Medium", category: "Content",
      reason: `Only ~${s.descriptionWordCount} words of copy surround the image; Images ranks partly on the page's real text.`,
      recommendedChange: "Add a short, unique paragraph in Ani's voice — the scene, palette, mood, and why it was painted. Keep it genuine; do not template it across works." });
  }
  if (s.internalLinkCount < 2) {
    out.push({ ...base, issue: "few-internal-links", priority: "Medium", category: "Internal linking",
      reason: `Only ${s.internalLinkCount} internal link(s) point at this artwork, limiting its crawl priority.`,
      recommendedChange: "Link to this artwork from its collection page and 1–2 related works, using the artwork title as anchor text." });
  }
  if (s.availableForPrint && s.hasPurchasablePrint) {
    // (The cross-link is emitted automatically when a purchasable print exists — this is a reminder,
    //  Low, and only when both hold, so it never fabricates a link to a non-purchasable product.)
    out.push({ ...base, issue: "missing-print-crosslink", priority: "Low", category: "Internal linking",
      reason: "This artwork has a purchasable print — the original↔print canonical relationship should be explicit.",
      recommendedChange: "Confirm the 'Available as a fine-art print' link is present on the original and the print links back to the original artwork." });
  }
  return out;
}

function slugish(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

/** Audit many artworks; findings sorted High → Low. */
export function imageSeoFindings(signals: ArtworkImageSignals[]): ImageSeoFinding[] {
  const rank: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };
  return signals.flatMap(auditArtworkImageSeo).sort((a, b) => rank[a.priority] - rank[b.priority]);
}
