import { describe, it, expect } from "vitest";
import { breadcrumbList, breadcrumbJsonLdScript, injectBreadcrumb } from "./breadcrumb";

const items = [
  { name: "Home", url: "https://animuradyan.com/" },
  { name: "Fine Art Prints", url: "https://animuradyan.com/prints" },
  { name: "Road Through Gold", url: "https://animuradyan.com/prints/road_through_gold" },
];

describe("breadcrumbList", () => {
  it("builds an ordered BreadcrumbList with 1-based positions", () => {
    const b = breadcrumbList(items) as any;
    expect(b["@type"]).toBe("BreadcrumbList");
    expect(b.itemListElement).toHaveLength(3);
    expect(b.itemListElement[0]).toMatchObject({ position: 1, name: "Home", item: "https://animuradyan.com/" });
    expect(b.itemListElement[2]).toMatchObject({ position: 3, name: "Road Through Gold" });
  });
});

describe("injectBreadcrumb", () => {
  const shell = `<!doctype html><html><head><title>x</title></head><body><div id="root"></div></body></html>`;
  it("injects a BreadcrumbList script into <head>", () => {
    const out = injectBreadcrumb(shell, items);
    expect(out).toContain('id="breadcrumb-jsonld"');
    expect(out).toContain('"@type":"BreadcrumbList"');
    expect(out).toContain("Road Through Gold");
    expect(out.indexOf("breadcrumb-jsonld")).toBeLessThan(out.indexOf("</head>"));
  });
  it("is a no-op for an empty trail", () => {
    expect(injectBreadcrumb(shell, [])).toBe(shell);
    expect(breadcrumbJsonLdScript([])).toBe("");
  });
});
