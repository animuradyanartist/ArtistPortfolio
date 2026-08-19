/**
 * A COVER THE ARTICLE ALREADY IMPLIES — and the cases where there isn't one.
 *
 * The rule matters more than it looks. Get it wrong in the permissive direction and an
 * artist's portfolio shows a fabricated or broken image beside her writing, which is worse
 * than showing no image at all.
 */
import { describe, it, expect } from "vitest";
import { resolveArticleCover, hasCoverImage } from "./articleCover";
import type { FigureArtwork } from "./articleMarkdown";

const artworks: FigureArtwork[] = [
  { id: 79, title: "No Measure for Distance", medium: "Oil on Canvas", dimensions: "119x99cm", year: 2026, availability: "available", images: ["https://cdn.example/nm.jpg"] },
  { id: 60, title: "Quiet Pathway", medium: "Oil on Paper", dimensions: "36x28cm", year: 2026, availability: "available", images: [] },
  { id: 76, title: "Serenity in Layers", medium: "Oil on Canvas", dimensions: "61x71cm", year: 2026, availability: "sold", images: [] },
];

const resolve = {
  canonicalPath: (a: FigureArtwork) => `/artworks/${a.title.toLowerCase().replace(/\s+/g, "-")}-${a.id}`,
  imageUrl: (a: FigureArtwork) => {
    const first = (a.images ?? []).find((i) => typeof i === "string" && i.trim());
    return first && /^https?:\/\//.test(first) ? first : `/img/artwork/${a.id}/0`;
  },
};

/** Experiment #1's real directive order. */
const EXP1_BODY = [
  "## What minimalism is describing",
  "Some prose.",
  ":artwork[No Measure for Distance]",
  "More prose.",
  ":artwork[Quiet Pathway]",
  ":artwork[Serenity in Layers]",
].join("\n\n");

describe("the cover an article already names", () => {
  it("takes the FIRST named work — Experiment #1's is No Measure for Distance", () => {
    const c = resolveArticleCover({ body: EXP1_BODY }, artworks, resolve);
    expect(c.kind).toBe("artwork");
    if (c.kind !== "artwork") return;
    expect(c.title).toBe("No Measure for Distance");
    expect(c.href).toBe("/artworks/no-measure-for-distance-79");
    expect(c.imageUrl).toBe("https://cdn.example/nm.jpg");
  });

  it("carries real metadata from the row, never invented", () => {
    const c = resolveArticleCover({ body: EXP1_BODY }, artworks, resolve);
    if (c.kind !== "artwork") throw new Error("expected an artwork cover");
    expect(c.caption).toBe("No Measure for Distance · Oil on Canvas · 119x99cm · 2026");
    expect(c.alt).toMatch(/by Ani Muradyan/);
    expect(c.status).toBeNull(); // available, so nothing is claimed
  });

  it("falls back to this site's image route when the row has no absolute URL", () => {
    const c = resolveArticleCover({ body: ":artwork[Quiet Pathway]" }, artworks, resolve);
    if (c.kind !== "artwork") throw new Error("expected an artwork cover");
    expect(c.imageUrl).toBe("/img/artwork/60/0");
  });

  it("states a sold work as sold, so a cover never reads as an offer", () => {
    const c = resolveArticleCover({ body: ":artwork[Serenity in Layers]" }, artworks, resolve);
    if (c.kind !== "artwork") throw new Error("expected an artwork cover");
    expect(c.status).toBe("In a private collection");
  });
});

describe("intent beats inference", () => {
  it("an explicit cover wins over the named work", () => {
    const c = resolveArticleCover({ body: EXP1_BODY, coverImage: "/uploads/chosen.webp", coverImageAlt: "A chosen image" }, artworks, resolve);
    expect(c.kind).toBe("explicit");
    if (c.kind !== "explicit") return;
    expect(c.imageUrl).toBe("/uploads/chosen.webp");
    expect(c.alt).toBe("A chosen image");
  });

  it("an explicit cover links nowhere — it is not known to be a work", () => {
    const c = resolveArticleCover({ body: EXP1_BODY, coverImage: "/uploads/chosen.webp" }, artworks, resolve);
    if (c.kind !== "explicit") throw new Error("expected explicit");
    expect(c.href).toBeNull();
    expect(c.alt).toBe(""); // none written → empty, so a screen reader skips it
  });

  it("whitespace is not an explicit cover", () => {
    const c = resolveArticleCover({ body: EXP1_BODY, coverImage: "   " }, artworks, resolve);
    expect(c.kind).toBe("artwork");
  });
});

describe("when there is no honest cover", () => {
  it("returns none rather than inventing an image", () => {
    const c = resolveArticleCover({ body: ":artwork[A Painting That Does Not Exist]" }, artworks, resolve);
    expect(c.kind).toBe("none");
    expect(hasCoverImage(c)).toBe(false);
  });

  it("skips an unresolvable name and uses the next one that IS hers", () => {
    const body = ":artwork[The Amber Gate]\n\n:artwork[Quiet Pathway]";
    const c = resolveArticleCover({ body }, artworks, resolve);
    if (c.kind !== "artwork") throw new Error("expected the second work");
    expect(c.title).toBe("Quiet Pathway");
  });

  it("an article naming no works has no cover", () => {
    expect(resolveArticleCover({ body: "## Just prose\n\nNo works named." }, artworks, resolve).kind).toBe("none");
  });

  it("an empty or missing body is handled, not thrown on", () => {
    expect(resolveArticleCover({ body: "" }, artworks, resolve).kind).toBe("none");
    expect(resolveArticleCover({}, artworks, resolve).kind).toBe("none");
  });

  it("no artworks loaded yet is 'none', not a broken image", () => {
    expect(resolveArticleCover({ body: EXP1_BODY }, [], resolve).kind).toBe("none");
  });
});
