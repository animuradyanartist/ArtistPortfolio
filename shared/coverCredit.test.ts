/**
 * A COVER THAT IS ONE OF HER PAINTINGS SHOULD SAY WHICH ONE.
 *
 * `CoverCredit` renders nothing unless the cover resolves to `kind: "artwork"`. "Explicit
 * wins" was written when the only way a cover got set was the owner pasting a URL — nothing
 * to credit, nowhere to link. Career OS then started sending `coverImage` on every draft it
 * writes, always `/img/artwork/:id/:idx`, always one of her works.
 *
 * Draft 4, 2026-08-20: the cover rendered as a bare image while the three figures below it,
 * built from the same rows, each carried a title, a link and a status.
 *
 * The lookup is BY ID on purpose. Seven titles exist twice in her catalogue — once migrated,
 * once not — so resolving a cover by name can credit the wrong row.
 */
import { describe, it, expect } from "vitest";
import { resolveArticleCover } from "./articleCover";
import { artworkIdFromImageUrl, type FigureArtwork } from "./articleMarkdown";
import { artworkCanonicalPath } from "./canonical";

const artworks = [
  { id: 42, title: "Blue Detachment", medium: "Oil on Canvas", dimensions: "89x79cm", year: 2026, availability: "available", images: ["https://www.singulart.com/x.jpg"] },
  { id: 40, title: "Blue Drift", medium: "Oil on Canvas", dimensions: "79x71cm", year: 2026, availability: "available", images: ["/img/artwork/40/0?v=e0dffc4e"] },
  // The duplicate pair production really carries: CDN row first, migrated row second.
  { id: 64, title: "Silent Poise", medium: "Oil on Canvas", dimensions: "50x40cm", year: 2026, availability: "sold", images: ["https://www.singulart.com/y.jpg"] },
  { id: 18, title: "Silent Poise", medium: "Oil on Paper", dimensions: "36x28cm", year: 2025, availability: "sold", images: ["/img/artwork/18/0?v=52516b25"] },
] as unknown as FigureArtwork[];

const resolve = {
  canonicalPath: (a: FigureArtwork) => artworkCanonicalPath({ id: a.id, title: a.title, seoSlug: null }),
  imageUrl: (a: FigureArtwork) => `/img/artwork/${a.id}/0`,
};
const cover = (article: Record<string, unknown>) => resolveArticleCover(article as never, artworks, resolve);

describe("artworkIdFromImageUrl", () => {
  it("reads the id out of our own image route", () => {
    expect(artworkIdFromImageUrl("/img/artwork/42/0")).toBe(42);
    expect(artworkIdFromImageUrl("/img/artwork/42/0?v=abc")).toBe(42);
    expect(artworkIdFromImageUrl("https://animuradyan.com/img/artwork/42/1")).toBe(42);
  });

  it("returns null for anybody else's URL", () => {
    expect(artworkIdFromImageUrl("https://www.singulart.com/images/artworks/x.jpg")).toBeNull();
    expect(artworkIdFromImageUrl("/uploads/hand-picked.jpg")).toBeNull();
    expect(artworkIdFromImageUrl("")).toBeNull();
  });
});

describe("a Career OS cover credits its painting", () => {
  it("resolves draft 4's cover to the artwork, with link, caption and title", () => {
    const c = cover({ coverImage: "/img/artwork/42/0", coverImageAlt: "Blue Detachment — Oil on Canvas painting — by Ani Muradyan", body: "" });
    expect(c.kind).toBe("artwork");
    if (c.kind !== "artwork") return;
    expect(c.title).toBe("Blue Detachment");
    expect(c.href).toBe("/artworks/blue-detachment-42");
    expect(c.caption).toBe("Blue Detachment · Oil on Canvas · 89x79cm · 2026");
    expect(c.imageUrl).toBe("/img/artwork/42/0");
  });

  it("says a sold cover is sold, so the caption cannot read as an offer", () => {
    const c = cover({ coverImage: "/img/artwork/18/0", body: "" });
    expect(c.kind).toBe("artwork");
    if (c.kind !== "artwork") return;
    expect(c.status).toBe("In a private collection");
  });

  it("credits the row the URL names, not the first row sharing its title", () => {
    // Resolving "Silent Poise" by NAME finds id 64. The cover URL says 18.
    const c = cover({ coverImage: "/img/artwork/18/0", body: "" });
    expect(c.kind).toBe("artwork");
    if (c.kind !== "artwork") return;
    expect(c.href).toBe("/artworks/silent-poise-18");
    expect(c.caption).toContain("Oil on Paper");
  });
});

describe("what must NOT change", () => {
  it("an owner-pasted external URL stays explicit — nothing to credit, nowhere to link", () => {
    const c = cover({ coverImage: "https://example.com/hand-picked.jpg", coverImageAlt: "A photo", body: "" });
    expect(c.kind).toBe("explicit");
    if (c.kind !== "explicit") return;
    expect(c.imageUrl).toBe("https://example.com/hand-picked.jpg");
    expect(c.alt).toBe("A photo");
    expect(c.href).toBeNull();
  });

  it("an explicit URL for a work that no longer exists stays explicit rather than vanishing", () => {
    const c = cover({ coverImage: "/img/artwork/9999/0", body: "" });
    expect(c.kind).toBe("explicit");
  });

  it("still infers from the first cited work when no cover is set", () => {
    const c = cover({ coverImage: null, body: ":artwork[Blue Drift]" });
    expect(c.kind).toBe("artwork");
    if (c.kind !== "artwork") return;
    expect(c.title).toBe("Blue Drift");
  });

  it("still returns none when there is neither a cover nor a resolvable citation", () => {
    expect(cover({ coverImage: null, body: "Just prose." }).kind).toBe("none");
  });
});
