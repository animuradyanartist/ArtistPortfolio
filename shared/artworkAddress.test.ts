/**
 * ONE ARTWORK, ONE URL — and a bounded set of addresses that reach it.
 *
 * Search Console showed 55 artwork URLs as "Discovered – currently not indexed, last crawled:
 * N/A", almost all in the marketplace form /artworks/ani-muradyan-<title>-<7-digit-id>.
 *
 * Two things were true at once. Those URLs were discovered from a sitemap that no longer
 * emits them, so they are historical. And the site was still answering them 200 rather than
 * redirecting, because the redirect was gated on `seoSlug`, which is null for all 54 works.
 *
 * Worse, the resolver accepted ANY path ending in `-<id>`: /completely-made-up-40 served Blue
 * Drift in full. These pin the boundary.
 */
import { describe, it, expect } from "vitest";
import { knownAddresses, isKnownAddressFor } from "./artworkAddress";

const blueDrift = { id: 40, title: "Blue Drift", slug: "ani-muradyan-blue-drift-2520049", seoSlug: null };
const dawn = { id: 54, title: "Dawn's Embrace", slug: "ani-muradyan-dawn-s-embrace-2130944", seoSlug: null };
const withSeo = { id: 12, title: "Some Work", slug: "ani-muradyan-some-work-111", seoSlug: "a-chosen-seo-slug" };

describe("the addresses that belong to an artwork", () => {
  it("accepts the canonical form", () => {
    expect(isKnownAddressFor(blueDrift, "blue-drift-40")).toBe(true);
  });

  it("accepts the marketplace slug the work was imported under", () => {
    expect(isKnownAddressFor(blueDrift, "ani-muradyan-blue-drift-2520049")).toBe(true);
  });

  it("accepts the bare numeric id", () => {
    expect(isKnownAddressFor(blueDrift, "40")).toBe(true);
  });

  it("accepts an explicit seoSlug when one exists", () => {
    expect(isKnownAddressFor(withSeo, "a-chosen-seo-slug")).toBe(true);
  });

  it("is case-insensitive, because a crawler will try both", () => {
    expect(isKnownAddressFor(blueDrift, "BLUE-DRIFT-40")).toBe(true);
  });

  it("handles an apostrophe the way the site slugifies it", () => {
    // "Dawn's Embrace" → dawns-embrace-54, not dawn-s-embrace-54.
    expect(knownAddresses(dawn)).toContain("dawns-embrace-54");
  });
});

describe("the unbounded URL space is closed", () => {
  it("REJECTS an invented prefix carrying a real id", () => {
    // Production served Blue Drift, in full, at both of these.
    expect(isKnownAddressFor(blueDrift, "total-nonsense-40")).toBe(false);
    expect(isKnownAddressFor(blueDrift, "completely-made-up-40")).toBe(false);
  });

  it("rejects another artwork's address even though the id matches nothing there", () => {
    expect(isKnownAddressFor(blueDrift, "dawns-embrace-54")).toBe(false);
  });

  it("rejects an empty or whitespace address", () => {
    expect(isKnownAddressFor(blueDrift, "")).toBe(false);
    expect(isKnownAddressFor(blueDrift, "   ")).toBe(false);
  });

  it("never invents an address from a null slug", () => {
    const bare = { id: 20, title: "Untitled", slug: null, seoSlug: null };
    expect(knownAddresses(bare)).toEqual(["untitled-20", "20"]);
    expect(knownAddresses(bare).every((a) => typeof a === "string" && a.length > 0)).toBe(true);
  });
});

describe("a legacy id can never reach an unrelated artwork", () => {
  it("marketplace ids are far outside the artwork id range, so they cannot collide", () => {
    // Artwork ids run 9–79 in production; marketplace ids are seven digits.
    const trailing = Number(/-(\d+)$/.exec(blueDrift.slug!)![1]);
    expect(trailing).toBe(2520049);
    expect(trailing).toBeGreaterThan(1000);
  });

  it("an unknown legacy slug matches nothing at all", () => {
    for (const a of [blueDrift, dawn, withSeo]) {
      expect(isKnownAddressFor(a, "ani-muradyan-a-painting-that-never-existed-9999999")).toBe(false);
    }
  });
});
