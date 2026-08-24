/**
 * THE COLLECTION SURFACES, AND THE THINGS THEY MUST NOT GET WRONG.
 *
 * Search Console shows the site appears for exactly one thing — the artist's name — because it
 * has no page a buyer would search for. A collection page is a real, indexable, inventory-backed
 * commercial surface. Two failures matter: it describes works it does not contain (a doorway),
 * or it drifts from the /artworks classifier so the same word means two different sets.
 */
import { describe, it, expect } from "vitest";
import {
  COLLECTIONS, collectionBySlug, collectionMembers, isLandscape, type CollectionArtwork,
} from "./collections";
import { renderCollectionHtml, collectionJsonLd, type CollectionRenderWork } from "./collectionPrerender";
import { artworkCategory } from "../client/src/lib/artworkCategory";

const A = (over: Partial<CollectionArtwork> = {}): CollectionArtwork =>
  ({ title: "Untitled", description: "", medium: "Oil on Canvas", size: "medium", availability: "available", ...over });

describe("the landscape collection is defined and addressable", () => {
  it("exists at a buyer-intent slug", () => {
    const def = collectionBySlug("landscape-paintings");
    expect(def).toBeDefined();
    expect(def!.heading).toMatch(/landscape/i);
    expect(def!.title).toMatch(/for Sale/i);
  });
  it("an unknown slug resolves to nothing", () => {
    expect(collectionBySlug("free-wallpapers")).toBeUndefined();
  });
});

describe("membership is by subject, and only real members appear", () => {
  it("includes landscape works (matches a cue word) and excludes clear portraits", () => {
    expect(isLandscape(A({ title: "Road to Tuscany" }))).toBe(true);   // road
    expect(isLandscape(A({ title: "Endless Horizon" }))).toBe(true);   // horizon
    expect(isLandscape(A({ title: "Red Barn" }))).toBe(true);          // barn
    expect(isLandscape(A({ title: "Quiet Portrait", description: "a woman, close in" }))).toBe(false);
  });
  it("CANNOT drift from the /artworks classifier — one shared word list", () => {
    // Both read shared/collections.ts LANDSCAPE_WORDS, so agreement is by construction. This
    // asserts it across a spread of real titles rather than trusting the wiring.
    for (const t of ["Road to Tuscany", "Endless Horizon", "Red Barn", "Homeward", "A Safe Distance", "Quiet Portrait", "Silent Poise"]) {
      const art = { id: 1, title: t, description: "", medium: "Oil on Canvas" } as never;
      expect(isLandscape({ title: t, description: "" })).toBe(artworkCategory(art) === "landscape");
    }
  });
  it("orders available works before sold ones", () => {
    const def = collectionBySlug("landscape-paintings")!;
    const works = collectionMembers(def, [
      A({ title: "Sold Road", availability: "sold" }),
      A({ title: "Open Horizon", availability: "available" }),
    ]);
    expect(works[0].title).toBe("Open Horizon");
  });
});

describe("the prerendered body is real, not a doorway", () => {
  const def = collectionBySlug("landscape-paintings")!;
  const works: CollectionRenderWork[] = [
    { title: "Open Horizon", href: "/artworks/open-horizon-10", image: "/img/artwork/10/0", medium: "Oil on Canvas", dimensions: "80x60cm", availability: "available", priceLabel: "EUR 1,200" },
    { title: "Sold Road", href: "/artworks/sold-road-11", image: "/img/artwork/11/0", medium: "Oil on Canvas", dimensions: "60x50cm", availability: "sold", priceLabel: null },
  ];
  const html = renderCollectionHtml(def, works);

  it("leads with the target <h1> and buyer copy", () => {
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(html).toContain("Contemporary Landscape Paintings");
    expect(html).toContain("shipped worldwide");
  });
  it("renders every member as a real linked image", () => {
    expect((html.match(/<img /g) ?? []).length).toBe(2);
    expect(html).toContain('href="/artworks/open-horizon-10"');
    expect(html).toContain('src="/img/artwork/10/0"');
    expect(html).toContain("EUR 1,200");
    expect(html).toContain("In a private collection");
  });
  it("links onward to shop and enquiry", () => {
    expect(html).toContain('href="/artworks"');
    expect(html).toContain('href="/contact"');
  });
  it("shows an honest empty state rather than inventing works", () => {
    expect(renderCollectionHtml(def, [])).toContain("coming soon");
    expect(renderCollectionHtml(def, [])).not.toContain("<img ");
  });
  it("escapes a title that contains markup", () => {
    const evil = renderCollectionHtml(def, [{ ...works[0], title: '<script>x</script>' }]);
    expect(evil).not.toContain("<script>x</script>");
    expect(evil).toContain("&lt;script&gt;");
  });
});

describe("structured data identifies the collection and its items", () => {
  const def = collectionBySlug("landscape-paintings")!;
  const works: CollectionRenderWork[] = [
    { title: "Open Horizon", href: "/artworks/open-horizon-10", image: "/img/artwork/10/0", medium: "Oil on Canvas", dimensions: "80x60cm", availability: "available", priceLabel: "EUR 1,200" },
  ];
  const ld = JSON.parse(collectionJsonLd(def, works, "https://animuradyan.com").replace(/^<script[^>]*>/, "").replace(/<\/script>$/, ""));

  it("is a CollectionPage with an ItemList of the works", () => {
    expect(ld["@type"]).toBe("CollectionPage");
    expect(ld.url).toBe("https://animuradyan.com/collections/landscape-paintings");
    expect(ld.mainEntity["@type"]).toBe("ItemList");
    expect(ld.mainEntity.numberOfItems).toBe(1);
    expect(ld.mainEntity.itemListElement[0].url).toBe("https://animuradyan.com/artworks/open-horizon-10");
  });
});
