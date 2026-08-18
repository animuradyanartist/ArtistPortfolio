/**
 * The rule that decides whether a machine may overwrite a sentence a person wrote.
 *
 * The dangerous case is the quiet one: a nightly sync replacing her own words with listing
 * copy that reads perfectly well, so nobody notices it went.
 */
import { describe, it, expect } from "vitest";
import { decideDescription } from "./descriptionMerge";

const LISTING = "This contemporary landscape blends minimalism with warm colour.";

describe("an empty field is filled", () => {
  it("adopts the listing text when the site has none", () => {
    const d = decideDescription("", LISTING, null);
    expect(d.action).toBe("adopted");
    expect(d.description).toBe(LISTING);
  });

  it("treats whitespace as empty", () => {
    expect(decideDescription("   \n ", LISTING, null).action).toBe("adopted");
  });
});

describe("a hand-written description is never overwritten", () => {
  it("reports a conflict instead of replacing her words", () => {
    const d = decideDescription("I stopped before it was finished.", LISTING, null);
    expect(d.action).toBe("conflict");
    expect(d.description).toBeNull();
    expect(d.note).toContain("not written by a previous sync");
  });

  it("still refuses when the listing changed under an edit", () => {
    const d = decideDescription("My own words.", LISTING, "an older listing text");
    expect(d.action).toBe("conflict");
    expect(d.description).toBeNull();
  });
});

describe("the sync may update its own copy", () => {
  it("carries a listing change when the site shows the last synced text", () => {
    const d = decideDescription("an older listing text", LISTING, "an older listing text");
    expect(d.action).toBe("updated");
    expect(d.description).toBe(LISTING);
  });

  it("ignores insignificant whitespace differences", () => {
    const d = decideDescription("an   older  listing text", LISTING, "an older listing text");
    expect(d.action).toBe("updated");
  });
});

describe("it does nothing when there is nothing to do", () => {
  it.each([
    ["no listing text", "local", "", null],
    ["identical text", LISTING, LISTING, LISTING],
  ])("%s", (_label, local, incoming, last) => {
    const d = decideDescription(local, incoming as string, last as string | null);
    expect(d.action).toBe("unchanged");
    expect(d.description).toBeNull();
  });
});
