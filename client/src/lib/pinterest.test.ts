/**
 * PINTEREST SAVE-LINK BUILDER — locks the two guarantees the feature depends on:
 *   1. `media` is ALWAYS an absolute, Pinterest-fetchable URL (or omitted) — never a relative
 *      /img ref or a base64 data: URI, either of which produces a Pin with no image.
 *   2. Every parameter is URL-encoded, and the Pin links back to the exact page URL.
 */
import { describe, it, expect } from "vitest";
import {
  PINTEREST_CREATE_ENDPOINT,
  toAbsolutePinImage,
  buildPinterestSaveUrl,
  originalPinImageRef,
} from "./pinterest";

const BASE = "https://animuradyan.com";

describe("toAbsolutePinImage", () => {
  it("prefixes a first-party /img ref with the base URL", () => {
    expect(toAbsolutePinImage("/img/artwork/62/0?v=abcd1234", BASE)).toBe(
      "https://animuradyan.com/img/artwork/62/0?v=abcd1234",
    );
    expect(toAbsolutePinImage("/img/print/19/0?v=ef01", BASE)).toBe(
      "https://animuradyan.com/img/print/19/0?v=ef01",
    );
  });

  it("passes an already-absolute URL through unchanged", () => {
    expect(toAbsolutePinImage("https://cdn.prodigi.com/mockup.jpg", BASE)).toBe(
      "https://cdn.prodigi.com/mockup.jpg",
    );
  });

  it("upgrades a protocol-relative URL to https", () => {
    expect(toAbsolutePinImage("//cdn.example.com/a.jpg", BASE)).toBe("https://cdn.example.com/a.jpg");
  });

  it("refuses a base64 data: URI (Pinterest cannot fetch it)", () => {
    expect(toAbsolutePinImage("data:image/png;base64,AAAA", BASE)).toBeNull();
  });

  it("returns null for empty / missing input", () => {
    expect(toAbsolutePinImage("", BASE)).toBeNull();
    expect(toAbsolutePinImage(null, BASE)).toBeNull();
    expect(toAbsolutePinImage(undefined, BASE)).toBeNull();
  });

  it("does not double a trailing slash on the base URL", () => {
    expect(toAbsolutePinImage("/img/artwork/1/0", "https://animuradyan.com/")).toBe(
      "https://animuradyan.com/img/artwork/1/0",
    );
  });
});

describe("buildPinterestSaveUrl", () => {
  it("URL-encodes url, media and description and points at the create endpoint", () => {
    const out = buildPinterestSaveUrl({
      url: "https://animuradyan.com/artworks/road-through-gold-62",
      media: "https://animuradyan.com/img/artwork/62/0?v=abcd1234",
      description: "Road Through Gold — original oil on canvas by Ani Muradyan.",
    });
    expect(out.startsWith(`${PINTEREST_CREATE_ENDPOINT}?`)).toBe(true);

    // Parse it back: the query values must decode to exactly what went in.
    const q = new URL(out).searchParams;
    expect(q.get("url")).toBe("https://animuradyan.com/artworks/road-through-gold-62");
    expect(q.get("media")).toBe("https://animuradyan.com/img/artwork/62/0?v=abcd1234");
    expect(q.get("description")).toBe(
      "Road Through Gold — original oil on canvas by Ani Muradyan.",
    );

    // And the raw string must be percent-encoded (no bare ":" or "?" from the values).
    expect(out).toContain("url=https%3A%2F%2Fanimuradyan.com%2Fartworks%2Froad-through-gold-62");
  });

  it("omits media when there is no usable image (Pinterest scrapes og:image instead)", () => {
    const out = buildPinterestSaveUrl({
      url: "https://animuradyan.com/prints/road_through_gold",
      media: null,
      description: "Road Through Gold — fine-art giclée print by Ani Muradyan.",
    });
    expect(out).not.toContain("media=");
    expect(new URL(out).searchParams.get("url")).toBe(
      "https://animuradyan.com/prints/road_through_gold",
    );
  });

  it("omits description when none is given", () => {
    const out = buildPinterestSaveUrl({ url: "https://animuradyan.com/x" });
    expect(out).not.toContain("description=");
    expect(out).not.toContain("media=");
  });
});

describe("originalPinImageRef (originals pin the first-party /img route)", () => {
  it("returns the site's own /img/artwork/:id/0 ref, not a stored image URL", () => {
    expect(originalPinImageRef(59)).toBe("/img/artwork/59/0");
    expect(originalPinImageRef(18)).toBe("/img/artwork/18/0");
  });

  it("absolutises to an animuradyan.com media URL", () => {
    expect(toAbsolutePinImage(originalPinImageRef(59), BASE)).toBe(
      "https://animuradyan.com/img/artwork/59/0",
    );
  });

  it("keeps an external marketplace image out of the Pin's media parameter", () => {
    // An original whose stored images[0] is an external Singulart URL must STILL pin the
    // first-party route — the external host never appears in `media`.
    const out = buildPinterestSaveUrl({
      url: `${BASE}/artworks/road-through-gold-59`,
      media: toAbsolutePinImage(originalPinImageRef(59), BASE),
      description: "Road Through Gold — original Oil on Paper, 30x43cm, 2026 by Ani Muradyan.",
    });
    expect(out).not.toContain("singulart");
    expect(new URL(out).searchParams.get("media")).toBe("https://animuradyan.com/img/artwork/59/0");
  });
});
