/**
 * ONE PARSER FOR THE ARTICLE BODY — because there were three, and they disagreed.
 *
 * The same Markdown subset was implemented separately in the server prerender
 * (server/routes.ts), the public reader (BlogPostPage.tsx) and the admin preview
 * (AdminArticles.tsx). Three implementations drift, and they had: the admin preview did no
 * inline formatting at all, so a Career OS draft showed the owner
 * "[No Measure for Distance](/artworks/no-measure-for-distance-79)" as literal text, and
 * NONE of the three handled blockquotes, so a quotation from the artist rendered as a
 * paragraph beginning with a stray ">".
 *
 * The admin preview carried a comment promising "the same preview the reader will get — if
 * it looks wrong here it is wrong". That was false, and its falseness is the deeper defect:
 * the one surface the owner approves from was the least faithful of the three.
 *
 * So parsing happens ONCE, here, into typed blocks. Each surface renders those blocks in
 * its own idiom — HTML strings on the server, React nodes in the client — but none of them
 * decides any more what a heading or a quotation IS. A future divergence has to be a
 * deliberate act rather than an oversight in one of three copies.
 *
 * PURE. No DOM, no server APIs — importable from both sides.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  /** A quotation. Held as paragraphs so a multi-paragraph quote stays one quote. */
  | { kind: "quote"; paragraphs: string[] }
  /**
   * A named artwork, to be rendered as an image with its caption.
   *
   * Deliberately carries only the TITLE. The writer names a work; the renderer resolves the
   * image, dimensions and availability from the database at render time. Nothing about a
   * painting is written into the article body, so a re-photographed or re-priced work is
   * correct everywhere the moment the row changes.
   */
  | { kind: "artwork"; title: string };

/** `:artwork[Quiet Pathway]` on a line of its own. */
const ARTWORK_DIRECTIVE = /^:artwork\[([^\]]{1,120})\]$/;

/** **bold** and [text](/href) — the only inline forms this subset allows. */
const INLINE_PATTERN = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g;

/**
 * Split one block's text into inline runs.
 *
 * Returned as data rather than a string so the React surfaces can build real elements and
 * the server can escape before it interpolates — the two needs that made the previous
 * copies diverge in the first place.
 */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE_PATTERN.lastIndex = 0;
  while ((m = INLINE_PATTERN.exec(text))) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[1]) out.push({ kind: "strong", text: m[1] });
    else out.push({ kind: "link", text: m[2]!, href: m[3]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** Parse an article body into blocks. Blank-line separated, as authored. */
export function parseArticle(body: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of String(body ?? "").split(/\n{2,}/)) {
    const block = raw.trim();
    if (!block) continue;

    const artwork = ARTWORK_DIRECTIVE.exec(block);
    if (artwork) {
      blocks.push({ kind: "artwork", title: artwork[1]!.trim() });
      continue;
    }

    // Quotations. Every line carries ">", and a blank ">" line separates paragraphs
    // inside one quote — so a two-paragraph quotation is one blockquote, not two.
    if (/^>\s?/.test(block)) {
      const paragraphs = block
        .split(/\n/)
        .map((l) => l.replace(/^>\s?/, "").trim())
        .join("\n")
        .split(/\n{2,}/)
        .map((p) => p.replace(/\n/g, " ").trim())
        .filter(Boolean);
      blocks.push({ kind: "quote", paragraphs });
      continue;
    }

    const h = /^(#{2,3})\s+(.*)$/.exec(block);
    if (h) {
      blocks.push({ kind: "heading", level: h[1]!.length === 2 ? 2 : 3, text: h[2]!.trim() });
      continue;
    }

    if (/^[-*]\s+/.test(block)) {
      const items = block.split(/\n/).map((l) => l.replace(/^[-*]\s+/, "").trim()).filter(Boolean);
      blocks.push({ kind: "list", items });
      continue;
    }

    blocks.push({ kind: "paragraph", text: block.replace(/\n/g, " ") });
  }
  return blocks;
}

/* ─────────────────────────── artwork figures ─────────────────────────── */

export interface FigureArtwork {
  id: number;
  title: string;
  slug?: string | null;
  seoSlug?: string | null;
  medium?: string | null;
  dimensions?: string | null;
  year?: number | null;
  availability?: string | null;
  images?: (string | null)[] | null;
}

export interface ArtworkFigure {
  title: string;
  /** Canonical detail page — the same URL the sitemap and canonical tag use. */
  href: string;
  imageUrl: string;
  alt: string;
  /** Title · medium · dimensions · year, from whichever fields exist. */
  caption: string;
  /** Stated only when the work is genuinely sold. Never implies availability. */
  status: string | null;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Resolve a named work to everything a figure needs.
 *
 * Returns null when the title is not in the supplied set — a renderer must show nothing
 * rather than invent an image, and the quality gate already refuses articles naming works
 * that are not hers.
 *
 * `canonicalPath` and `imageUrl` are injected rather than recomputed so this module stays
 * free of the canonical/URL logic that already lives in shared/canonical.ts.
 */
export function artworkFigure(
  title: string,
  artworks: FigureArtwork[],
  resolve: { canonicalPath: (a: FigureArtwork) => string; imageUrl: (a: FigureArtwork) => string },
): ArtworkFigure | null {
  const a = artworks.find((x) => norm(x.title) === norm(title));
  if (!a) return null;

  const caption = [a.title, a.medium, a.dimensions, a.year ? String(a.year) : null]
    .map((p) => (typeof p === "string" ? p.trim() : p))
    .filter(Boolean)
    .join(" · ");

  return {
    title: a.title,
    href: resolve.canonicalPath(a),
    imageUrl: resolve.imageUrl(a),
    // Describes the picture in the row's own terms; never the page title repeated.
    alt: [a.title, a.medium ? `${a.medium} painting` : "painting", "by Ani Muradyan"].filter(Boolean).join(" — "),
    caption,
    // A sold work is named as such. Silence would let the caption read as an offer.
    status: a.availability === "sold" ? "In a private collection" : null,
  };
}

/**
 * THE IMAGE ADDRESS A FIGURE SHOULD USE — one implementation, for the same reason this file
 * exists at all.
 *
 * There were three copies (the server prerender, ArticleCover and ArticleBody), and all three
 * agreed on the wrong answer: given an artwork whose stored image is an absolute URL, they used
 * that URL directly, so a figure pointed at the Singulart CDN even though the site serves the
 * same picture itself.
 *
 * `/img/artwork/:id/:idx` is always the better address. For a work the site hosts it returns
 * the bytes, resized and cached; for one it does not, it 302s to the same CDN URL the copies
 * were hardcoding — so this is never worse, and the moment a work is migrated to first-party
 * hosting every article already written starts serving it without anyone editing a body.
 */
export function figureImageUrl(a: Pick<FigureArtwork, "id">): string {
  return `/img/artwork/${a.id}/0`;
}

/** Every artwork an article names via a directive, in order of appearance. */
export function citedArtworkTitles(body: string): string[] {
  return parseArticle(body).flatMap((b) => (b.kind === "artwork" ? [b.title] : []));
}
