import { describe, it, expect } from "vitest";
import {
  artworkCanonicalPath,
  artworkCanonicalUrl,
  toCanonicalSlug,
} from "./canonical";

const BASE = "https://animuradyan.com";

describe("artwork canonical URL derivation", () => {
  it("prefers the seoSlug when present (canonical path)", () => {
    const a = { seoSlug: "silent-bliss-original-oil", title: "Silent Bliss", id: 62 };
    expect(artworkCanonicalPath(a)).toBe("/silent-bliss-original-oil");
  });

  it("falls back to /artworks/{titleSlug}-{id} when seoSlug is absent", () => {
    const a = { seoSlug: null, title: "Silent Bliss", id: 62 };
    expect(artworkCanonicalPath(a)).toBe("/artworks/silent-bliss-62");
  });

  it("treats empty / whitespace seoSlug as absent (falls back)", () => {
    expect(artworkCanonicalPath({ seoSlug: "", title: "Quiet Dawn", id: 7 })).toBe(
      "/artworks/quiet-dawn-7",
    );
    expect(artworkCanonicalPath({ seoSlug: "   ", title: "Quiet Dawn", id: 7 })).toBe(
      "/artworks/quiet-dawn-7",
    );
    expect(artworkCanonicalPath({ seoSlug: undefined, title: "Quiet Dawn", id: 7 })).toBe(
      "/artworks/quiet-dawn-7",
    );
  });

  it("trims a padded seoSlug", () => {
    expect(artworkCanonicalPath({ seoSlug: "  padded-slug  ", title: "X", id: 1 })).toBe(
      "/padded-slug",
    );
  });

  // Canonical tag and og:url in injectArtworkMeta are BOTH built from the same
  // artworkCanonicalUrl value, so proving the URL here proves both tags agree.
  it("canonical and og:url resolve to the SAME absolute URL (with seoSlug)", () => {
    const a = { seoSlug: "silent-bliss-original-oil", title: "Silent Bliss", id: 62 };
    const canonical = artworkCanonicalUrl(BASE, a);
    const ogUrl = artworkCanonicalUrl(BASE, a); // same source in injectArtworkMeta
    expect(canonical).toBe("https://animuradyan.com/silent-bliss-original-oil");
    expect(ogUrl).toBe(canonical);
  });

  it("canonical and og:url resolve to the SAME absolute URL (without seoSlug)", () => {
    const a = { seoSlug: null, title: "Silent Bliss", id: 62 };
    const canonical = artworkCanonicalUrl(BASE, a);
    const ogUrl = artworkCanonicalUrl(BASE, a);
    expect(canonical).toBe("https://animuradyan.com/artworks/silent-bliss-62");
    expect(ogUrl).toBe(canonical);
  });

  // The server canonical must equal what sitemap.xml emits for the same artwork.
  it("with-seoSlug canonical matches the sitemap's /{seoSlug} rule", () => {
    const a = { seoSlug: "silent-bliss-original-oil", title: "Silent Bliss", id: 62 };
    const sitemapPath = `/${a.seoSlug.trim()}`; // mirrors sitemap.xml derivation
    expect(artworkCanonicalPath(a)).toBe(sitemapPath);
  });

  it("toCanonicalSlug matches the title-slug rule used across the app", () => {
    expect(toCanonicalSlug("Silent Bliss")).toBe("silent-bliss");
    expect(toCanonicalSlug("  Été: N°2 / Rêve!  ")).toBe("t-n2-rve");
  });
});
