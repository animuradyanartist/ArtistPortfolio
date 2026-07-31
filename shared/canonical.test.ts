import { describe, it, expect } from "vitest";
import { artworkCanonicalPath, artworkCanonicalUrl, toSlug } from "./canonical";
import { artworkPath } from "@/lib/seo";

const BASE = "https://animuradyan.com";

// Exact copy of the slug implementations that were removed from
// client/src/lib/seo.ts and server/routes.ts during consolidation. The parity
// tests below assert the shared toSlug is byte-identical to this.
function legacyToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

describe("shared toSlug — byte-identical to the removed per-file copies", () => {
  const cases: Array<[string, string]> = [
    ["ASCII + spaces", "Silent Bliss"],
    ["accents + punctuation", "Été: N°2 / Rêve!"],
    ["accents + em dash", "Café—Naïve—Œuvre"],
    ["digits + symbols", "Abstract 2024 #3"],
    ["leading/trailing whitespace", "   Quiet   Dawn   "],
    ["tabs + newlines (\\s)", "Multiple\tSpaces\nand\ttabs"],
    ["repeated hyphens", "already---hyphenated--slug"],
    ["leading/trailing hyphens", "-leading-and-trailing-"],
    ["all punctuation → empty", "!!!@@@###"],
    ["empty string", ""],
    ["whitespace only", "     "],
  ];

  for (const [label, input] of cases) {
    it(`matches legacy for: ${label}`, () => {
      expect(toSlug(input)).toBe(legacyToSlug(input));
    });
  }

  it("produces the documented exact outputs", () => {
    expect(toSlug("Silent Bliss")).toBe("silent-bliss");
    expect(toSlug("Été: N°2 / Rêve!")).toBe("t-n2-rve");
    expect(toSlug("Abstract 2024 #3")).toBe("abstract-2024-3");
    expect(toSlug("already---hyphenated--slug")).toBe("already-hyphenated-slug");
    expect(toSlug("-leading-and-trailing-")).toBe("leading-and-trailing");
    expect(toSlug("!!!@@@###")).toBe("");
    expect(toSlug("")).toBe("");
  });
});

describe("artworkCanonicalPath — unchanged for both cases", () => {
  it("prefers the seoSlug when present", () => {
    const a = { seoSlug: "silent-bliss-original-oil", title: "Silent Bliss", id: 62 };
    expect(artworkCanonicalPath(a)).toBe("/silent-bliss-original-oil");
  });

  it("falls back to /artworks/{titleSlug}-{id} when seoSlug is absent", () => {
    const a = { seoSlug: null, title: "Silent Bliss", id: 62 };
    expect(artworkCanonicalPath(a)).toBe("/artworks/silent-bliss-62");
  });

  it("treats empty / whitespace / undefined seoSlug as absent (falls back)", () => {
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

  // Canonical <link> and og:url in injectArtworkMeta are BOTH built from the
  // same artworkCanonicalUrl value, so proving the URL proves both tags agree.
  it("canonical == og:url (with seoSlug)", () => {
    const a = { seoSlug: "silent-bliss-original-oil", title: "Silent Bliss", id: 62 };
    expect(artworkCanonicalUrl(BASE, a)).toBe("https://animuradyan.com/silent-bliss-original-oil");
  });

  it("canonical == og:url (without seoSlug)", () => {
    const a = { seoSlug: null, title: "Silent Bliss", id: 62 };
    expect(artworkCanonicalUrl(BASE, a)).toBe("https://animuradyan.com/artworks/silent-bliss-62");
  });

  it("with-seoSlug canonical matches the sitemap's /{seoSlug} rule", () => {
    const a = { seoSlug: "silent-bliss-original-oil", title: "Silent Bliss", id: 62 };
    expect(artworkCanonicalPath(a)).toBe(`/${a.seoSlug.trim()}`);
  });
});

describe("client artworkPath — output unchanged after slug de-dup", () => {
  it("still returns /artworks/{titleSlug}-{id}", () => {
    expect(artworkPath({ id: 62, title: "Silent Bliss" })).toBe("/artworks/silent-bliss-62");
    expect(artworkPath({ id: 7, title: "Été: N°2" })).toBe("/artworks/t-n2-7");
  });

  it("equals the pre-change formula for a battery of titles", () => {
    const samples = [
      { id: 1, title: "Silent Bliss" },
      { id: 2, title: "Été: N°2 / Rêve!" },
      { id: 3, title: "Abstract 2024 #3" },
      { id: 4, title: "  Quiet   Dawn  " },
    ];
    for (const a of samples) {
      expect(artworkPath(a)).toBe(`/artworks/${legacyToSlug(a.title)}-${a.id}`);
    }
  });
});
