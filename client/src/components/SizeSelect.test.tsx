/**
 * SIZE is ONE accessible dropdown, not a row of size buttons. Rendered server-side (no DOM harness in
 * this repo) so we can assert the exact markup: a single <select>, a "Select a size" placeholder, one
 * <option> per size with the "{name} ({cm}) — {retail price}" label, and NO <button>.
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SizeSelect } from "./SizeSelect";
import type { SizeOption } from "@/lib/printSelector";

const PAPER: SizeOption[] = [
  { sizeLabel: "A3 (29.7×42 cm)", sizeName: "A3", widthCm: 29.7, heightCm: 42, priceMinor: 6900, currency: "USD" },
  { sizeLabel: "12×16 in (30×40 cm)", sizeName: "12×16 in", widthCm: 30.5, heightCm: 40.6, priceMinor: 6900, currency: "USD" },
  { sizeLabel: "16×20 in (40×50 cm)", sizeName: "16×20 in", widthCm: 40.6, heightCm: 50.8, priceMinor: 8900, currency: "USD" },
];
const CANVAS: SizeOption[] = [
  { sizeLabel: "16×20 in canvas", sizeName: "16×20 in", widthCm: 40.6, heightCm: 50.8, priceMinor: 12900, currency: "USD" },
  { sizeLabel: "24×36 in canvas", sizeName: "24×36 in", widthCm: 61, heightCm: 91.4, priceMinor: 18900, currency: "USD" },
];

const render = (sizes: SizeOption[], value: string | null = null) =>
  renderToStaticMarkup(<SizeSelect sizes={sizes} value={value} onChange={() => {}} />);

describe("SizeSelect — one dropdown, never size buttons", () => {
  it("renders exactly ONE <select> and NO <button>", () => {
    const html = render(PAPER);
    expect((html.match(/<select/g) ?? []).length).toBe(1);
    expect(html).not.toContain("<button");
  });

  it("shows the 'Select a size' placeholder when nothing is selected", () => {
    const html = render(PAPER, null);
    expect(html).toContain(">Select a size<");
    // The placeholder is the selected option when value is null.
    expect(html).toMatch(/<option value=""[^>]*>Select a size<\/option>/);
  });

  it("renders one <option> per size (plus the placeholder)", () => {
    const optionCount = (render(PAPER).match(/<option/g) ?? []).length;
    expect(optionCount).toBe(PAPER.length + 1); // 3 sizes + placeholder
  });

  it("option labels are '{name} ({cm}) — {retail price}' (inch + cm + retail price)", () => {
    const html = render(PAPER);
    expect(html).toContain("A3 (29.7×42 cm) — $69");
    expect(html).toContain("12×16 in (30.5×40.6 cm) — $69");
    expect(html).toContain("16×20 in (40.6×50.8 cm) — $89");
  });

  it("shows the RETAIL price passed in (never a Prodigi cost), and no SKU / pixels / wrap", () => {
    const html = render(CANVAS);
    expect(html).toContain("16×20 in (40.6×50.8 cm) — $129");
    expect(html).toContain("24×36 in (61×91.4 cm) — $189");
    // "px" here guards against a pixel *dimension* leaking into a label (e.g. "600px"),
    // so it requires a digit before "px" — the bare `px\b` also matched the Tailwind
    // `px-3` padding utility on the <select>, which is styling, not shown content.
    expect(html).not.toMatch(/GLOBAL-|wrap|MirrorWrap|\d\s*px\b|SKU/i);
  });

  it("marks the current value as selected in the closed state", () => {
    const html = render(PAPER, "16×20 in (40×50 cm)");
    // The chosen option carries the selected attribute (React SSR uses `selected` on the option).
    expect(html).toMatch(/<option value="16×20 in \(40×50 cm\)"[^>]*selected[^>]*>16×20 in/);
  });
});
