/**
 * The Articles link, in both directions.
 *
 * §1 states the rule twice, once positively and once as a prohibition: expose the index
 * "once at least one real article is published", and "do not expose an empty Articles
 * section". The second half is the one that used to be unenforceable — the entry was
 * commented out by hand, so it could be linked on the day of the first article and could
 * never unlink itself afterwards.
 *
 * Testing it here rather than in a browser is deliberate. Checking the disappearing case
 * any other way means publishing a real article to her live site and then unpublishing it,
 * which is exactly what "test the conditional safely" rules out.
 */
import { describe, it, expect } from "vitest";
import { siteNavigation, showsArticles, ARTICLES_ITEM } from "@shared/siteNavigation";

const names = (n: { name: string }[]) => n.map((i) => i.name);

describe("with nothing published", () => {
  it("shows no Articles link", () => {
    expect(showsArticles(0)).toBe(false);
    expect(names(siteNavigation(0))).not.toContain("Articles");
  });

  it("leaves the rest of the navigation untouched", () => {
    expect(names(siteNavigation(0))).toEqual(["Home", "Originals", "Prints", "The Path", "Exhibitions", "Gallery", "Contact"]);
  });
});

describe("with at least one published article", () => {
  it("shows the link", () => {
    expect(showsArticles(1)).toBe(true);
  });

  it("uses the label §1 specifies and the route that already works", () => {
    expect(ARTICLES_ITEM).toEqual({ name: "Articles", href: "/blog" });
  });

  it("places it after Exhibitions without disturbing the order", () => {
    expect(names(siteNavigation(3))).toEqual(["Home", "Originals", "Prints", "The Path", "Exhibitions", "Articles", "Gallery", "Contact"]);
  });
});

describe("it disappears again", () => {
  it("hides the link when the last article is unpublished", () => {
    expect(showsArticles(1)).toBe(true);
    expect(showsArticles(0)).toBe(false);
  });
});

describe("an unknown count is not a published article", () => {
  // While the query is in flight the count is undefined. Showing the link and then
  // removing it reads as a broken site; showing it a moment late reads as a loaded page.
  it.each([undefined, null, Number.NaN, -1])("treats %s as nothing published", (v) => {
    expect(showsArticles(v as number)).toBe(false);
  });
});

describe("the decision is pure", () => {
  it("does not mutate its own source list between calls", () => {
    siteNavigation(5);
    expect(names(siteNavigation(0))).not.toContain("Articles");
    expect(names(siteNavigation(5)).filter((n) => n === "Articles")).toHaveLength(1);
  });
});
