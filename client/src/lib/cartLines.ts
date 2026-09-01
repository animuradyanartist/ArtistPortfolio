/**
 * PURE CART-LINE OPERATIONS — the JSX-free core of the client cart, so it is unit-testable in node
 * (the vitest suite only picks up *.test.ts). The React provider in cart.tsx is a thin wrapper over
 * these. The cart holds SAFE display metadata + identifiers only — never a SKU, cost, Prodigi data,
 * print-area pixels, master URL or storage key; `unitPriceMinor` is a DISPLAY figure the server
 * re-resolves (and ignores) at checkout.
 */

export interface PrintCartLine {
  variantId: number;
  quantity: number;
  title: string;
  materialLabel: string;   // "Fine Art Paper" | "Canvas"
  sizeLabel: string;       // "16×20 in (40×50 cm)"
  unitPriceMinor: number;  // display only
  currency: string;
  imageUrl: string;        // public URL (never base64 / never a master key)
}

export const clampQty = (n: number): number => Math.min(10, Math.max(1, Math.floor(Number(n) || 1)));

/** Add a print line; the SAME variant bumps quantity (capped at 10) rather than duplicating. */
export function addPrintLine(lines: PrintCartLine[], line: PrintCartLine): PrintCartLine[] {
  const qty = clampQty(line.quantity);
  const idx = lines.findIndex((l) => l.variantId === line.variantId);
  return idx >= 0
    ? lines.map((l, i) => (i === idx ? { ...line, quantity: Math.min(10, l.quantity + qty) } : l))
    : [...lines, { ...line, quantity: qty }];
}
export function removePrintLine(lines: PrintCartLine[], variantId: number): PrintCartLine[] {
  return lines.filter((l) => l.variantId !== variantId);
}
export function setPrintLineQty(lines: PrintCartLine[], variantId: number, quantity: number): PrintCartLine[] {
  const q = clampQty(quantity);
  return lines.map((l) => (l.variantId === variantId ? { ...l, quantity: q } : l));
}
/** Cart badge count = originals (one each) + total print quantity. */
export function cartCount(ids: number[], prints: PrintCartLine[]): number {
  return ids.length + prints.reduce((n, l) => n + l.quantity, 0);
}
