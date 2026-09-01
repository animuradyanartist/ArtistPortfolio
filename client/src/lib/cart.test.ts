/**
 * CART LINE OPERATIONS — the pure, node-testable core of the client cart. The React provider is a
 * thin wrapper over these; testing them proves add/quantity/remove/multi-line/count behaviour without
 * a browser. The cart holds SAFE display metadata + identifiers only (no SKU/cost/master/keys).
 */
import { describe, it, expect } from "vitest";
import { addPrintLine, removePrintLine, setPrintLineQty, cartCount, type PrintCartLine } from "./cartLines";

function line(over: Partial<PrintCartLine> = {}): PrintCartLine {
  return {
    variantId: 100, quantity: 1, title: "Blue Hour", materialLabel: "Fine Art Paper",
    sizeLabel: "16×20 in (40×50 cm)", unitPriceMinor: 8900, currency: "USD",
    imageUrl: "/img/artwork/42/0", ...over,
  };
}

describe("addPrintLine", () => {
  it("adds a new line with the correct material + size + quantity", () => {
    const out = addPrintLine([], line({ quantity: 2 }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ variantId: 100, quantity: 2, materialLabel: "Fine Art Paper", sizeLabel: "16×20 in (40×50 cm)" });
  });
  it("adding the SAME variant bumps quantity (capped at 10), never duplicates the line", () => {
    let out = addPrintLine([], line({ quantity: 6 }));
    out = addPrintLine(out, line({ quantity: 6 }));
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(10);   // 6 + 6 → clamped to 10
  });
  it("keeps DISTINCT variants as separate lines (multiple items coexist)", () => {
    let out = addPrintLine([], line({ variantId: 100 }));
    out = addPrintLine(out, line({ variantId: 200, materialLabel: "Canvas", sizeLabel: "A3" }));
    expect(out.map((l) => l.variantId)).toEqual([100, 200]);
    expect(out[1].materialLabel).toBe("Canvas");
  });
  it("clamps an out-of-range quantity into 1..10", () => {
    expect(addPrintLine([], line({ quantity: 0 }))[0].quantity).toBe(1);
    expect(addPrintLine([], line({ quantity: 99 }))[0].quantity).toBe(10);
  });
});

describe("setPrintLineQty / removePrintLine", () => {
  it("changes a line's quantity (clamped)", () => {
    const start = addPrintLine([], line());
    expect(setPrintLineQty(start, 100, 5)[0].quantity).toBe(5);
    expect(setPrintLineQty(start, 100, 0)[0].quantity).toBe(1);
    expect(setPrintLineQty(start, 100, 50)[0].quantity).toBe(10);
  });
  it("removes only the named line", () => {
    let out = addPrintLine([], line({ variantId: 100 }));
    out = addPrintLine(out, line({ variantId: 200 }));
    out = removePrintLine(out, 100);
    expect(out.map((l) => l.variantId)).toEqual([200]);
  });
});

describe("cartCount", () => {
  it("is originals (one each) + total print quantity", () => {
    expect(cartCount([1, 2], [line({ variantId: 100, quantity: 3 }), line({ variantId: 200, quantity: 2 })])).toBe(2 + 5);
    expect(cartCount([], [])).toBe(0);
  });
});
