/**
 * The blog lives in the FOOTER, never the top navigation.
 *
 * The main/top nav (desktop + mobile) must never carry an Articles/Blog entry — no matter how
 * many articles are published. §1 still governs the FOOTER link (`showsArticles`): expose it
 * "once at least one real article is published", and "do not expose an empty Articles section".
 *
 * Testing it here rather than in a browser is deliberate — `siteNavigation` and `showsArticles`
 * are pure, so both the shown and hidden directions are checkable without publishing anything
 * real to the live site. The blog ROUTE (/blog) is asserted unchanged in publicRoutes.test.ts.
 */
import { describe, it, expect } from "vitest";
import { siteNavigation, showsArticles, ARTICLES_ITEM } from "@shared/siteNavigation";

const names = (n: { name: string }[]) => n.map((i) => i.name);
const hrefs = (n: { href: string }[]) => n.map((i) => i.href);

describe("the blog is absent from the top navigation", () => {
  it("never appears in the top nav — nothing published", () => {
    expect(names(siteNavigation(0))).not.toContain("Articles");
    expect(hrefs(siteNavigation(0))).not.toContain("/blog");
  });

  it("never appears in the top nav — even with many published", () => {
    expect(names(siteNavigation(5))).not.toContain("Articles");
    expect(hrefs(siteNavigation(5))).not.toContain("/blog");
  });

  it("leaves the rest of the navigation exactly as it was", () => {
    const expected = ["Home", "Originals", "Prints", "The Path", "Exhibitions", "Gallery", "Contact"];
    expect(names(siteNavigation(0))).toEqual(expected);
    expect(names(siteNavigation(3))).toEqual(expected);
  });
});

describe("the footer's Articles/Blog link", () => {
  it("points at the existing /blog route with the §1 label", () => {
    expect(ARTICLES_ITEM).toEqual({ name: "Articles", href: "/blog" });
  });

  it("is shown once something is published", () => {
    expect(showsArticles(1)).toBe(true);
    expect(showsArticles(42)).toBe(true);
  });

  it("is hidden while nothing is published (no empty Articles section)", () => {
    expect(showsArticles(0)).toBe(false);
  });

  it("is hidden again when the last article is unpublished", () => {
    expect(showsArticles(1)).toBe(true);
    expect(showsArticles(0)).toBe(false);
  });

  it.each([undefined, null, Number.NaN, -1])("treats %s (an unknown/invalid count) as nothing published", (v) => {
    expect(showsArticles(v as number)).toBe(false);
  });
});

describe("the decision is pure", () => {
  it("returns a fresh top-nav list each call and never leaks the blog into it", () => {
    siteNavigation(5);
    expect(hrefs(siteNavigation(0))).not.toContain("/blog");
    expect(hrefs(siteNavigation(5))).not.toContain("/blog");
  });
});
