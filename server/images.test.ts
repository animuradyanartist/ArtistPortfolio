import { describe, it, expect } from "vitest";
import { toImageRef, refifyImages } from "./images";

/**
 * The public print-detail API (and the artwork/gallery APIs) must never ship raw base64 image
 * blobs to the client — that made `/api/commerce/prints/:slug` a 6–8 MB response and left the
 * hydrated gallery/lightbox DOM carrying multi-MB `data:` URIs. `toImageRef` is the swap that
 * keeps the payload small; these lock its contract so a regression can't quietly reintroduce base64.
 */
describe("toImageRef", () => {
  const base64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCA',,,";

  it("swaps a base64 print image for a small /img/print ref", () => {
    const ref = toImageRef("print", 19, 0, base64);
    expect(ref).toMatch(/^\/img\/print\/19\/0\?v=[0-9a-f]{8}$/);
    expect(ref).not.toContain("data:image");
    expect(ref.length).toBeLessThan(64);
  });

  it("indexes the ref by position", () => {
    expect(toImageRef("print", 19, 2, base64)).toMatch(/^\/img\/print\/19\/2\?v=/);
    expect(toImageRef("artwork", 7, 1, base64)).toMatch(/^\/img\/artwork\/7\/1\?v=/);
  });

  it("passes through a non-data value untouched (external URL or existing path)", () => {
    expect(toImageRef("print", 19, 0, "https://cdn.example.com/x.jpg")).toBe("https://cdn.example.com/x.jpg");
    expect(toImageRef("print", 19, 0, "/img/print/19/0?v=abcd1234")).toBe("/img/print/19/0?v=abcd1234");
    expect(toImageRef("print", 19, 0, "")).toBe("");
    expect(toImageRef("print", 19, 0, null)).toBe("");
  });
});

describe("refifyImages", () => {
  it("refifies every base64 entry of an entity's images array by position", () => {
    const b = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
    const out = refifyImages("print", { id: 20, images: [b, b, "https://ext/keep.jpg"] });
    expect(out.images[0]).toMatch(/^\/img\/print\/20\/0\?v=/);
    expect(out.images[1]).toMatch(/^\/img\/print\/20\/1\?v=/);
    expect(out.images[2]).toBe("https://ext/keep.jpg"); // external URL survives
    expect(out.images.join("")).not.toContain("data:image");
  });

  it("returns the entity untouched when it holds no base64 images", () => {
    const entity = { id: 1, images: ["https://ext/a.jpg", "/img/print/1/1?v=x"] };
    expect(refifyImages("print", entity)).toBe(entity);
  });
});
