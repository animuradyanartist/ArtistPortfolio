/**
 * The article renderer's contract — written because three copies of it disagreed.
 *
 * A Career OS draft reached the owner's approval screen showing
 * "[No Measure for Distance](/artworks/no-measure-for-distance-79)" as literal text, and
 * her quotations rendered as paragraphs beginning with a stray ">". The admin preview did
 * no inline formatting at all and none of the three renderers handled blockquotes.
 *
 * The preview is the surface the owner approves from. It being the least faithful of the
 * three is the defect these tests exist to make impossible.
 */
import { describe, it, expect } from "vitest";
import {
  artworkFigure, citedArtworkTitles, parseArticle, parseInline,
  type FigureArtwork,
} from "./articleMarkdown";

describe("nothing reaches the reader as raw Markdown", () => {
  it("a link becomes a link, not its source text", () => {
    const [b] = parseArticle("See [No Measure for Distance](/artworks/no-measure-for-distance-79) for an example.");
    const inline = parseInline((b as { text: string }).text);
    const link = inline.find((n) => n.kind === "link");
    expect(link).toEqual({ kind: "link", text: "No Measure for Distance", href: "/artworks/no-measure-for-distance-79" });
    expect(inline.map((n) => ("text" in n ? n.text : "")).join("")).not.toContain("](");
  });

  it("bold becomes bold", () => {
    expect(parseInline("a **strong** word").some((n) => n.kind === "strong")).toBe(true);
  });

  it("no square bracket or parenthesis syntax survives in text runs", () => {
    const text = parseInline("[a](/x) and [b](/y)").filter((n) => n.kind === "text").map((n) => n.text).join("");
    expect(text).not.toMatch(/[[\]()]/);
  });
});

describe("quotations are quotations", () => {
  it("a quoted block parses as a quote, with the marker gone", () => {
    const [b] = parseArticle("> For me, minimalism is not emptiness.");
    expect(b.kind).toBe("quote");
    expect((b as { paragraphs: string[] }).paragraphs[0]).toBe("For me, minimalism is not emptiness.");
    expect(JSON.stringify(b)).not.toContain(">");
  });

  it("a multi-line quote is ONE quote, not several paragraphs", () => {
    const [b] = parseArticle("> line one\n> line two");
    expect(b.kind).toBe("quote");
    expect((b as { paragraphs: string[] }).paragraphs).toHaveLength(1);
  });

  it("a paragraph beginning with a stray marker is never left visible", () => {
    for (const b of parseArticle("> quoted\n\nnormal text")) {
      if (b.kind === "paragraph") expect(b.text.startsWith(">")).toBe(false);
    }
  });
});

describe("headings, lists and paragraphs", () => {
  it("distinguishes the two heading levels", () => {
    expect(parseArticle("## Two")[0]).toEqual({ kind: "heading", level: 2, text: "Two" });
    expect(parseArticle("### Three")[0]).toEqual({ kind: "heading", level: 3, text: "Three" });
  });

  it("keeps a list together and strips its bullets", () => {
    const [b] = parseArticle("- one\n- two");
    expect(b).toEqual({ kind: "list", items: ["one", "two"] });
  });

  it("joins wrapped lines into one paragraph", () => {
    expect(parseArticle("a line\nand its wrap")[0]).toEqual({ kind: "paragraph", text: "a line and its wrap" });
  });
});

describe("artwork figures resolve from the database, never from the article", () => {
  const artworks: FigureArtwork[] = [
    { id: 79, title: "No Measure for Distance", medium: "Oil on Canvas", dimensions: "119x99cm", year: 2026, availability: "available", images: ["https://cdn.example/nm.jpg"] },
    { id: 78, title: "Path to Tranquility", medium: "Oil on Canvas", dimensions: "79x71cm", year: 2026, availability: "sold", images: ["https://cdn.example/pt.jpg"] },
  ];
  const resolve = {
    canonicalPath: (a: FigureArtwork) => `/artworks/${a.title.toLowerCase().replace(/\s+/g, "-")}-${a.id}`,
    imageUrl: (a: FigureArtwork) => (a.images?.[0] as string) ?? `/img/artwork/${a.id}/0`,
  };

  it("a directive names a work and nothing else", () => {
    expect(parseArticle(":artwork[Quiet Pathway]")[0]).toEqual({ kind: "artwork", title: "Quiet Pathway" });
    expect(citedArtworkTitles("intro\n\n:artwork[Quiet Pathway]\n\n:artwork[Red Barn]")).toEqual(["Quiet Pathway", "Red Barn"]);
  });

  it("builds the figure from stored fields only", () => {
    const f = artworkFigure("No Measure for Distance", artworks, resolve)!;
    expect(f.imageUrl).toBe("https://cdn.example/nm.jpg");
    expect(f.href).toBe("/artworks/no-measure-for-distance-79");
    expect(f.caption).toBe("No Measure for Distance · Oil on Canvas · 119x99cm · 2026");
    expect(f.alt).toBe("No Measure for Distance — Oil on Canvas painting — by Ani Muradyan");
    expect(f.status).toBeNull();
  });

  it("never presents a sold work as available", () => {
    expect(artworkFigure("Path to Tranquility", artworks, resolve)!.status).toBe("In a private collection");
  });

  it("returns nothing for a work that is not hers, rather than inventing an image", () => {
    expect(artworkFigure("The Amber Gate", artworks, resolve)).toBeNull();
  });

  it("matches on title regardless of case or padding", () => {
    expect(artworkFigure("  no measure for DISTANCE ", artworks, resolve)?.title).toBe("No Measure for Distance");
  });

  it("omits caption fields the row does not have", () => {
    const sparse: FigureArtwork[] = [{ id: 5, title: "Untitled Study", availability: "available" }];
    expect(artworkFigure("Untitled Study", sparse, resolve)!.caption).toBe("Untitled Study");
  });
});
