/**
 * A category is a claim about her work, so it needs the same bar as any other claim:
 * she must have said it. These tests are mostly about what is REFUSED.
 */
import { describe, it, expect } from "vitest";
import { deriveCategories, categoryNames } from "./artworkCategories";

describe("categories come from stated fact", () => {
  it("derives from an explicit sentence and keeps the evidence", () => {
    const d = deriveCategories("This contemporary landscape blends minimalism with warm colour.");
    expect(categoryNames("This contemporary landscape blends minimalism with warm colour.")).toEqual(
      expect.arrayContaining(["landscape", "minimal"]),
    );
    expect(d.find((c) => c.category === "landscape")!.evidence).toContain("contemporary landscape");
  });

  it("treats a portrait as figurative as well", () => {
    expect(categoryNames("A contemporary abstract realism portrait about emotional distance.")).toEqual(
      expect.arrayContaining(["figurative", "portrait", "abstract"]),
    );
  });
});

describe("it refuses to infer", () => {
  it("derives nothing from a title-like string with no stated genre", () => {
    expect(categoryNames("Vibrant Valleys")).toEqual([]);
  });

  it("does not treat 'figure' or 'subject' as figurative", () => {
    // Both words appear in descriptions of works that are not figurative — "the subject of
    // this landscape". Accepting them is what made five works look classifiable.
    expect(categoryNames("The figure of the hill rises behind the subject of the scene.")).toEqual([]);
  });

  it("returns nothing for a description about feeling rather than genre", () => {
    expect(categoryNames("A quiet piece about stopping before the work is finished.")).toEqual([]);
  });

  it("handles missing text without inventing anything", () => {
    expect(categoryNames(null)).toEqual([]);
    expect(categoryNames("")).toEqual([]);
  });
});

describe("evidence is checkable", () => {
  it("returns the sentence that supports the tag, not the whole description", () => {
    const text = "An opening sentence. This is an abstract minimalist landscape. A closing one.";
    const ev = deriveCategories(text).find((c) => c.category === "minimal")!.evidence;
    expect(ev).toBe("This is an abstract minimalist landscape.");
  });
});
