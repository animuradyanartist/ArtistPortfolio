/**
 * FIRST-PARTY IMAGES MUST BE DISCOVERABLE, AND THEIR SHAPE MUST BE TRUE.
 *
 * Two defects, both measured in production on 2026-08-19.
 *
 * The image sitemap skipped every `data:` entry, on the reasonable-sounding grounds that a
 * base64 blob is not a URL. But the site already serves those bytes at /img/artwork/:id/:idx,
 * so the effect was that 38 images across 14 self-hosted artworks were announced to Google
 * Images nowhere at all — 0 of 38.
 *
 * And no artwork page declared width or height, so nothing could reserve space for the
 * picture. The tempting fix is `artwork.dimensions`; that field is the size of the PAINTING
 * in centimetres and says nothing about the pixels of a photograph of it.
 */
import { describe, it, expect, beforeEach } from "vitest";
import sharp from "sharp";
import { renderArtworkHtml, artworkSitemapImageLocs } from "@shared/artworkSsr";
import { measureImage, measurePrimaryImage, __clearImageDimensionCache } from "./imageDimensions";

beforeEach(() => __clearImageDimensionCache());

/** A real encoded image, so the measurement is of actual bytes rather than a stub. */
async function dataUrl(w: number, h: number, format: "png" | "jpeg" = "png"): Promise<string> {
  const buf = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .toFormat(format).toBuffer();
  return `data:image/${format};base64,${buf.toString("base64")}`;
}

const artwork = (over: Record<string, unknown> = {}) => ({
  id: 11, title: "Pastel Voyage", medium: "Oil on Canvas", dimensions: "119x99cm",
  year: 2026, price: 1200, availability: "available", description: "A description.",
  images: [], slug: null, seoSlug: null, ...over,
});

describe("intrinsic dimensions come from the bytes, never from a guess", () => {
  it("measures a real first-party image", async () => {
    const size = await measureImage(await dataUrl(1258, 1500, "jpeg"));
    expect(size).toEqual({ width: 1258, height: 1500 });
  });

  it("refuses to measure an external image — behaviour there is unchanged", async () => {
    expect(await measureImage("https://www.singulart.com/images/x.jpeg")).toBeNull();
  });

  it("returns null rather than a plausible number when the bytes are unreadable", async () => {
    expect(await measureImage("data:image/png;base64,not-actually-an-image")).toBeNull();
    expect(await measureImage("data:image/png;base64")).toBeNull();
    expect(await measureImage(null)).toBeNull();
  });

  it("never derives pixels from the physical canvas size", async () => {
    // "119x99cm" is the painting. A 1258x1500 photograph of it is a different shape.
    const size = await measureImage(await dataUrl(1258, 1500, "jpeg"));
    expect(size).not.toEqual({ width: 119, height: 99 });
  });

  it("measures the FIRST usable image, preserving order", async () => {
    const a = await dataUrl(800, 600);
    const b = await dataUrl(1500, 1500);
    expect(await measurePrimaryImage([a, b])).toEqual({ width: 800, height: 600 });
    expect(await measurePrimaryImage(["", a])).toEqual({ width: 800, height: 600 });
  });
});

describe("SSR emits the measured size, or none at all", () => {
  it("writes width and height when measured", () => {
    const html = renderArtworkHtml(artwork() as never, "https://animuradyan.com", { width: 1258, height: 1500 });
    expect(html).toContain('width="1258" height="1500"');
  });

  it("omits both when nothing could be measured", () => {
    const html = renderArtworkHtml(artwork() as never, "https://animuradyan.com", null);
    expect(html).not.toMatch(/<img[^>]*\bwidth=/);
    expect(html).not.toMatch(/<img[^>]*\bheight=/);
  });

  it("changes nothing else — alt, canonical image URL and the facts are untouched", () => {
    const withSize = renderArtworkHtml(artwork() as never, "https://animuradyan.com", { width: 10, height: 20 });
    const without = renderArtworkHtml(artwork() as never, "https://animuradyan.com", null);
    expect(withSize.replace(' width="10" height="20"', "")).toBe(without);
    expect(without).toContain('alt="Pastel Voyage — Oil on Canvas painting — by Ani Muradyan"');
    expect(without).toContain("/img/artwork/11/0");
    expect(without).toContain("119x99cm"); // the painting's own stated size, still shown as a fact
  });
});

/** The one implementation routes.ts builds the XML from — not a copy of it. */
const sitemapLocs = (id: number, images: string[], base = "https://animuradyan.com") =>
  artworkSitemapImageLocs(id, images, base);

describe("the image sitemap declares first-party images", () => {
  it("represents a stored image by its crawlable route, instead of skipping it", () => {
    expect(sitemapLocs(11, ["data:image/png;base64,AAAA"])).toEqual([
      "https://animuradyan.com/img/artwork/11/0",
    ]);
  });

  it("uses the index, so ordering survives", () => {
    expect(sitemapLocs(11, ["data:image/png;base64,A", "data:image/png;base64,B", "data:image/png;base64,C"]))
      .toEqual([
        "https://animuradyan.com/img/artwork/11/0",
        "https://animuradyan.com/img/artwork/11/1",
        "https://animuradyan.com/img/artwork/11/2",
      ]);
  });

  it("leaves external images exactly as they are until they are migrated", () => {
    const ext = "https://www.singulart.com/images/artworks/v2/x.jpeg";
    expect(sitemapLocs(79, [ext])).toEqual([ext]);
  });

  it("handles a mixed artwork without disturbing either kind", () => {
    const ext = "https://www.singulart.com/images/artworks/v2/x.jpeg";
    expect(sitemapLocs(40, ["data:image/png;base64,A", ext])).toEqual([
      "https://animuradyan.com/img/artwork/40/0",
      ext,
    ]);
  });

  it("introduces no duplicate entries when two slots hold the same file", () => {
    const ext = "https://www.singulart.com/images/artworks/v2/x.jpeg";
    expect(sitemapLocs(5, [ext, ext])).toEqual([ext]);
  });

  it("skips empty slots rather than emitting the page URL as an image", () => {
    expect(sitemapLocs(5, ["", "data:image/png;base64,A"])).toEqual([
      "https://animuradyan.com/img/artwork/5/1",
    ]);
  });
});
