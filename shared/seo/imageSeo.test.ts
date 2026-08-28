import { describe, it, expect } from "vitest";
import { auditArtworkImageSeo, imageUrlIsDescriptive, imageSeoFindings, type ArtworkImageSignals } from "./imageSeo";

function sig(over: Partial<ArtworkImageSignals> = {}): ArtworkImageSignals {
  return {
    id: 69, title: "Road to Tuscany", url: "/artworks/road-to-tuscany-69", imageUrl: "/img/artwork/69/0",
    altText: "Road to Tuscany — original contemporary oil landscape by Ani Muradyan",
    hasImageSchema: true, hasImageDimensions: true, inImageSitemap: true,
    descriptionWordCount: 80, internalLinkCount: 3, availableForPrint: false, hasPurchasablePrint: false, ...over,
  };
}

describe("image URL descriptiveness", () => {
  it("flags id-only image paths and accepts word slugs", () => {
    expect(imageUrlIsDescriptive("/img/artwork/69/0")).toBe(false);
    expect(imageUrlIsDescriptive("/img/artwork/road-to-tuscany.jpg")).toBe(true);
    expect(imageUrlIsDescriptive("/img/69.webp")).toBe(false);
  });
});

describe("auditArtworkImageSeo (Google Images, Task 8) — real signals, no stuffing", () => {
  it("a well-optimised artwork with a descriptive image URL yields no findings", () => {
    expect(auditArtworkImageSeo(sig({ imageUrl: "/img/artwork/road-to-tuscany.jpg" }))).toHaveLength(0);
  });

  it("flags the id-based image URL (the site's current pattern) as an Image-SEO improvement", () => {
    const f = auditArtworkImageSeo(sig());
    expect(f.map((x) => x.issue)).toContain("non-descriptive-image-url");
  });

  it("flags weak/missing alt as HIGH, with an honest (non-stuffed) recommendation", () => {
    const f = auditArtworkImageSeo(sig({ altText: "art", imageUrl: "/img/artwork/x.jpg" }));
    const alt = f.find((x) => x.issue === "missing-or-weak-alt")!;
    expect(alt.priority).toBe("High");
    expect(alt.recommendedChange).toMatch(/don't stuff keywords/i);
  });

  it("flags missing image sitemap inclusion as HIGH (discovery gate for Images)", () => {
    const f = auditArtworkImageSeo(sig({ inImageSitemap: false, imageUrl: "/img/artwork/x.jpg" }));
    expect(f.find((x) => x.issue === "not-in-image-sitemap")?.priority).toBe("High");
  });

  it("flags thin page copy and sparse internal links", () => {
    const f = auditArtworkImageSeo(sig({ descriptionWordCount: 15, internalLinkCount: 0, imageUrl: "/img/artwork/x.jpg" }));
    expect(f.map((x) => x.issue)).toEqual(expect.arrayContaining(["thin-page-copy", "few-internal-links"]));
  });

  it("only reminds about the print cross-link when a PURCHASABLE print exists", () => {
    expect(auditArtworkImageSeo(sig({ availableForPrint: true, hasPurchasablePrint: false, imageUrl: "/img/artwork/x.jpg" })).some((x) => x.issue === "missing-print-crosslink")).toBe(false);
    expect(auditArtworkImageSeo(sig({ availableForPrint: true, hasPurchasablePrint: true, imageUrl: "/img/artwork/x.jpg" })).some((x) => x.issue === "missing-print-crosslink")).toBe(true);
  });

  it("sorts many findings High → Low", () => {
    const all = imageSeoFindings([sig({ altText: null, inImageSitemap: false, descriptionWordCount: 10 })]);
    for (let i = 1; i < all.length; i++) {
      const rank = { High: 0, Medium: 1, Low: 2 } as const;
      expect(rank[all[i - 1].priority]).toBeLessThanOrEqual(rank[all[i].priority]);
    }
  });
});
