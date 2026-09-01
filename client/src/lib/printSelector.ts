/**
 * PUBLIC PDP SELECTOR — the customer picks Material (a plain-language CATEGORY: Fine Art Paper /
 * Canvas) → Size. Nothing else. The underlying paper/canvas STOCK, the Prodigi SKU, the canvas wrap,
 * cost and margin are never exposed or selectable here.
 *
 * These are the pure derivations the PDP renders from; they are unit-tested in node (no component
 * harness), so the two-material selector architecture is verified without a browser.
 */

import { MATERIAL_CATEGORY, CATEGORY_LABEL, ALL_CATEGORIES, type PrintCategory } from "@shared/commerce/prodigiProducts";

export interface SelectorOption {
  material: string;         // production stock (german-etching / stretched-canvas / …) — NEVER shown as a choice
  sizeLabel: string;
  framed: boolean;
  frameColour: string | null;
  state: "purchasable" | "provisional" | "preview";
}

/** The customer-facing category for a production material. Unknown → Fine Art Paper (safe default). */
export function categoryOfMaterial(material: string): PrintCategory {
  return MATERIAL_CATEGORY[material as keyof typeof MATERIAL_CATEGORY] ?? "fine-art-paper";
}

/**
 * The Material BUTTONS to show — the distinct customer-facing categories present among the options,
 * in the canonical order (Fine Art Paper, then Canvas). This is the ONLY material dimension the
 * customer selects; the paper/canvas stock is never a button. A category appears only when the print
 * actually has an offered, eligible variant in it (the server already filters to those), so a print
 * with no canvas variant simply shows no Canvas button.
 */
export function publicMaterialCategories(options: Pick<SelectorOption, "material">[]): PrintCategory[] {
  const present = new Set(options.map((o) => categoryOfMaterial(o.material)));
  return ALL_CATEGORIES.filter((c) => present.has(c));
}

/** The category's display label (Fine Art Paper / Canvas). */
export function materialCategoryLabel(category: PrintCategory): string {
  return CATEGORY_LABEL[category];
}

/**
 * The SIZE options for the selected category only (deduplicated by size label, first match wins so the
 * chosen row stays a real, orderable variant). When no category is selected yet, returns every size.
 * Sizes therefore CHANGE with the selected material, exactly as required.
 */
export function sizesForCategory<T extends Pick<SelectorOption, "material" | "sizeLabel">>(
  options: T[],
  category: PrintCategory | null,
): T[] {
  const seen = new Map<string, T>();
  for (const o of options) {
    if (category && categoryOfMaterial(o.material) !== category) continue;
    if (!seen.has(o.sizeLabel)) seen.set(o.sizeLabel, o);
  }
  return Array.from(seen.values());
}

/** The seed selection when options first arrive: prefer a purchasable option, else the first. */
export function seedSelection<T extends SelectorOption>(
  options: T[],
): { category: PrintCategory; sizeLabel: string; option: T } | null {
  if (!options.length) return null;
  const seed = options.find((o) => o.state === "purchasable") ?? options[0];
  return { category: categoryOfMaterial(seed.material), sizeLabel: seed.sizeLabel, option: seed };
}

/** When the customer switches category, pick a valid size within it (purchasable-first). */
export function firstOptionInCategory<T extends SelectorOption>(options: T[], category: PrintCategory): T | null {
  const inCat = options.filter((o) => categoryOfMaterial(o.material) === category);
  return inCat.find((o) => o.state === "purchasable") ?? inCat[0] ?? null;
}

/**
 * On a Material change, KEEP the currently-selected size only if it still exists in the new material;
 * otherwise reset to null ("Select a size"). This guarantees a variant from the previous material is
 * never silently retained: the new selection is either a real size of the new material, or nothing.
 */
export function retainedSizeOnCategoryChange(
  options: Pick<SelectorOption, "material" | "sizeLabel">[],
  newCategory: PrintCategory,
  currentSize: string | null,
): string | null {
  if (currentSize && options.some((o) => categoryOfMaterial(o.material) === newCategory && o.sizeLabel === currentSize)) {
    return currentSize;
  }
  return null;
}

// ── SIZE DROPDOWN OPTION LABEL — "{inch/name} ({cm}) — {retail price}" ────────────────────────────
// The customer-facing label only. It never contains the SKU, Prodigi cost, margin, print-area pixels,
// the wrap, or the internal stock name.

export interface SizeOption {
  sizeLabel: string;                 // stable option key (unique within a material)
  sizeName?: string | null;          // "A3" / "12×16 in" — the name shown to the customer
  widthCm?: number | null;           // physical size (customer-facing), NOT print-area pixels
  heightCm?: number | null;
  priceMinor?: number | null;        // RETAIL price (what the customer pays), never Prodigi cost
  currency: string;
}

/** Format a cm figure: whole numbers show no decimal (42), fractions show one (29.7 / 40.6). */
function fmtCm(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Compact retail price: whole amounts drop the cents ("$69", "$89"); fractional keep two ("$69.50"). */
function retail(minor: number, currency: string): string {
  const digits = minor % 100 === 0 ? 0 : 2;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: 2 }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(digits)} ${currency}`;
  }
}

/**
 * The dedicated-checkout link for ONE print line — a variant identifier + quantity only. No price or
 * fulfilment data ever travels in the URL; the server re-resolves everything authoritatively.
 */
export function printCheckoutHref(variantId: number, quantity: number): string {
  const q = Math.min(10, Math.max(1, Math.floor(Number(quantity) || 1)));
  return `/checkout?variant=${variantId}&qty=${q}`;
}

/** The dropdown option label: "A3 (29.7×42 cm) — $69". Dimensions/price are appended only when present. */
export function sizeOptionLabel(o: SizeOption): string {
  const name = (o.sizeName && o.sizeName.trim()) || o.sizeLabel;
  const dims = o.widthCm != null && o.heightCm != null ? ` (${fmtCm(o.widthCm)}×${fmtCm(o.heightCm)} cm)` : "";
  const price = o.priceMinor != null ? ` — ${retail(o.priceMinor, o.currency)}` : "";
  return `${name}${dims}${price}`;
}
