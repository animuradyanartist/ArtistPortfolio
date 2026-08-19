/**
 * All three surfaces must describe the same article.
 *
 * They did not. The server prerender, the public reader and the admin preview each carried
 * their own copy of the Markdown subset; none handled blockquotes, and the preview — the
 * screen the owner approves from — did no inline formatting at all, so a Career OS draft
 * showed her raw link syntax and a stray ">" where her own quotation should have been.
 *
 * Parity is asserted at the BLOCK level, which is the level they now share. Styling may
 * differ between a reader page and an admin panel; structure may not.
 */
import { describe, it, expect } from "vitest";
import { artworkFigure, citedArtworkTitles, parseArticle, parseInline, type FigureArtwork } from "./articleMarkdown";

const ARTICLE = [
  "An opening paragraph with [a link](/artworks/quiet-pathway-60) and **bold**.",
  "## A heading",
  "> A quotation from the artist.",
  ":artwork[Quiet Pathway]",
  "- one\n- two",
  "A closing paragraph.",
].join("\n\n");

const artworks: FigureArtwork[] = [
  { id: 60, title: "Quiet Pathway", medium: "Oil on Paper", dimensions: "36x28cm", year: 2026, availability: "available", images: ["https://cdn.example/qp.jpg"] },
  { id: 78, title: "Path to Tranquility", medium: "Oil on Canvas", dimensions: "79x71cm", year: 2026, availability: "sold", images: ["https://cdn.example/pt.jpg"] },
];
const resolve = {
  canonicalPath: (a: FigureArtwork) => `/artworks/${a.title.toLowerCase().replace(/\s+/g, "-")}-${a.id}`,
  imageUrl: (a: FigureArtwork) => (a.images?.[0] as string) ?? `/img/artwork/${a.id}/0`,
};

describe("one parse, one structure", () => {
  it("produces the block sequence every surface renders", () => {
    expect(parseArticle(ARTICLE).map((b) => b.kind)).toEqual([
      "paragraph", "heading", "quote", "artwork", "list", "paragraph",
    ]);
  });

  it("is deterministic — the same body always yields the same blocks", () => {
    expect(parseArticle(ARTICLE)).toEqual(parseArticle(ARTICLE));
  });

  it("no surface can receive raw Markdown syntax in a text run", () => {
    for (const b of parseArticle(ARTICLE)) {
      const texts =
        b.kind === "paragraph" ? [b.text] :
        b.kind === "heading" ? [b.text] :
        b.kind === "quote" ? b.paragraphs :
        b.kind === "list" ? b.items : [];
      for (const t of texts) {
        const plain = parseInline(t).filter((n) => n.kind === "text").map((n) => n.text).join("");
        expect(plain).not.toMatch(/\]\(|\*\*|^>/);
      }
    }
  });

  it("the quote marker never survives into rendered text", () => {
    expect(JSON.stringify(parseArticle("> quoted line"))).not.toContain(">");
  });
});

describe("the artwork directive path", () => {
  it("every cited work resolves to a complete figure", () => {
    for (const title of citedArtworkTitles(ARTICLE)) {
      const f = artworkFigure(title, artworks, resolve)!;
      expect(f.imageUrl).toBeTruthy();
      expect(f.href).toMatch(/^\/artworks\//);
      expect(f.alt).toContain(title);
      expect(f.caption.startsWith(title)).toBe(true);
    }
  });

  it("caption fields come from the row, in order", () => {
    expect(artworkFigure("Quiet Pathway", artworks, resolve)!.caption)
      .toBe("Quiet Pathway · Oil on Paper · 36x28cm · 2026");
  });

  it("a sold work is never presented as available", () => {
    const sold = artworkFigure("Path to Tranquility", artworks, resolve)!;
    expect(sold.status).toBe("In a private collection");
    expect(sold.caption).not.toMatch(/available|for sale|buy/i);
  });

  it("an unknown title yields nothing — no fabricated image or URL", () => {
    expect(artworkFigure("A Work She Never Made", artworks, resolve)).toBeNull();
  });

  it("a directive for an unknown work still parses, so the renderer can skip it safely", () => {
    expect(parseArticle(":artwork[Nonexistent]")[0]).toEqual({ kind: "artwork", title: "Nonexistent" });
  });
});
