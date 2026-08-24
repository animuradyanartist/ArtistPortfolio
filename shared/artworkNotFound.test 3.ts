/**
 * A MISSING PAINTING SAYS 404 — and nothing else does.
 *
 * /artworks/9999 and /artworks/nonexistent-page answered 200 with a generic shell and a
 * self-canonical. Google reads that as a soft 404. The duplicate-URL fix made the surface
 * larger rather than smaller: /artworks/total-nonsense-40 stopped being a duplicate of Blue
 * Drift and became one of these instead.
 *
 * The risk in fixing it is over-reach — 404ing something real. So the rule is narrow, and
 * these pin both edges: what must 404, and the much longer list of what must not.
 */
import { describe, it, expect } from "vitest";
import { isMissingArtworkPath } from "./artworkNotFound";
import { isKnownAddressFor } from "./artworkAddress";

const blueDrift = { id: 40, title: "Blue Drift", slug: "ani-muradyan-blue-drift-2520049", seoSlug: null };

describe("what must 404", () => {
  it("an id that is not a painting", () => {
    expect(isMissingArtworkPath("/artworks/9999", false)).toBe(true);
  });

  it("a slug that maps to nothing", () => {
    expect(isMissingArtworkPath("/artworks/nonexistent-page", false)).toBe(true);
  });

  it("an invented prefix carrying a real id — the case the duplicate fix created", () => {
    // The resolver now rejects this, so it arrives here unresolved.
    expect(isKnownAddressFor(blueDrift, "total-nonsense-40")).toBe(false);
    expect(isMissingArtworkPath("/artworks/total-nonsense-40", false)).toBe(true);
  });

  it("still 404s when the path carries a query or fragment", () => {
    expect(isMissingArtworkPath("/artworks/9999?utm_source=x", false)).toBe(true);
    expect(isMissingArtworkPath("/artworks/9999#top", false)).toBe(true);
  });
});

describe("what must NOT 404", () => {
  it("any path the resolver found a painting for", () => {
    // Canonical, legacy, case variant and bare id all resolve or redirect before this runs.
    for (const p of ["/artworks/blue-drift-40", "/artworks/ani-muradyan-blue-drift-2520049", "/artworks/BLUE-DRIFT-40", "/artworks/40"]) {
      expect(isMissingArtworkPath(p, true)).toBe(false);
    }
  });

  it("the collection page itself, with or without a trailing slash", () => {
    expect(isMissingArtworkPath("/artworks", false)).toBe(false);
    expect(isMissingArtworkPath("/artworks/", false)).toBe(false);
  });

  it("every non-artwork route, which belongs to the client router", () => {
    for (const p of ["/", "/about", "/path", "/contact", "/gallery", "/exhibitions", "/prints", "/admin"]) {
      expect(isMissingArtworkPath(p, false)).toBe(false);
    }
  });

  it("blog routes — Experiment #1 must be untouched", () => {
    expect(isMissingArtworkPath("/blog", false)).toBe(false);
    expect(isMissingArtworkPath("/blog/minimalist-landscape-painting", false)).toBe(false);
  });

  it("a top-level path that merely ends in a number", () => {
    // Out of scope on purpose: the server cannot know which single-segment SPA routes exist,
    // and guessing would eventually 404 a real page.
    expect(isMissingArtworkPath("/completely-made-up-40", false)).toBe(false);
  });

  it("a path that only looks like the artworks prefix", () => {
    expect(isMissingArtworkPath("/artworksomething", false)).toBe(false);
    expect(isMissingArtworkPath("/artwork/40", false)).toBe(false);
  });
});

describe("resolution wins over the 404 rule, always", () => {
  it("never 404s a resolved path, whatever it looks like", () => {
    for (const p of ["/artworks/9999", "/artworks/anything-at-all", "/artworks/x"]) {
      expect(isMissingArtworkPath(p, true)).toBe(false);
    }
  });
});
