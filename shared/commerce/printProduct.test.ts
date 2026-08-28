import { describe, it, expect } from "vitest";
import {
  assessVariant,
  isPubliclyPurchasable,
  startingPriceMinor,
  hasPurchasableVariant,
  resolveVariantPrice,
  buildPrintItemSnapshot,
  printReadyAssetOf,
  printCanonicalPath,
  printCanonicalUrl,
  type PrintVariantView,
  type PrintMasterView,
} from "./printProduct";

const readyMaster: PrintMasterView = {
  status: "ready",
  widthPx: 6000,
  heightPx: 4000,
  printReadyAssetUrl: "https://cdn.example.com/master/1.tif",
  checksumMd5: "abc",
};

const missingMaster: PrintMasterView = {
  status: "missing",
  widthPx: null,
  heightPx: null,
  printReadyAssetUrl: null,
  checksumMd5: null,
};

function variant(over: Partial<PrintVariantView> = {}): PrintVariantView {
  return {
    id: 1,
    printId: 10,
    material: "german-etching",
    prodigiSku: "GLOBAL-HGE-12X16",
    sizeLabel: "M",
    widthCm: 70,
    heightCm: 47,
    framed: false,
    frameColour: null,
    retailMinor: 6500,
    currency: "EUR",
    printReadyAssetUrl: null,
    mockups: ["https://cdn.example.com/mock/1.jpg"],
    effectiveDpi: 300,
    eligible: true,
    enabled: true,
    prodigiVerified: false,
    ...over,
  };
}

describe("assessVariant — the sale-state gate", () => {
  it("is PURCHASABLE only with a ready master, eligible+enabled, priced, and an asset", () => {
    const a = assessVariant(variant(), readyMaster);
    expect(a.state).toBe("purchasable");
    expect(a.reason).toBeNull();
    expect(isPubliclyPurchasable(variant(), readyMaster)).toBe(true);
  });

  it("is PROVISIONAL (not buyable) when the master is not ready — the whole catalogue today", () => {
    const a = assessVariant(variant(), missingMaster);
    expect(a.state).toBe("provisional");
    expect(a.masterReady).toBe(false);
    expect(isPubliclyPurchasable(variant(), missingMaster)).toBe(false);
  });

  it("is PROVISIONAL with no master row at all", () => {
    expect(assessVariant(variant(), null).state).toBe("provisional");
  });

  it("is PROVISIONAL when enabled+eligible but unpriced", () => {
    const a = assessVariant(variant({ retailMinor: null }), readyMaster);
    expect(a.state).toBe("provisional");
    expect(a.reason).toContain("no own-site price");
  });

  it("is UNAVAILABLE (hidden) when not enabled", () => {
    expect(assessVariant(variant({ enabled: false }), readyMaster).state).toBe("unavailable");
  });

  it("is UNAVAILABLE (hidden) when the resolution engine rejected it", () => {
    expect(assessVariant(variant({ eligible: false }), readyMaster).state).toBe("unavailable");
  });

  it("is UNAVAILABLE when the Prodigi SKU is not a verified active-launch SKU", () => {
    // an invented SKU, the 404'd GLOBAL-PR-*, and non-launch Enhanced Matte all fail the SKU gate
    expect(assessVariant(variant({ prodigiSku: "MADE-UP-SKU" }), readyMaster).state).toBe("unavailable");
    expect(assessVariant(variant({ prodigiSku: "GLOBAL-PR-16X20" }), readyMaster).reason).toBe("Unverified Prodigi SKU");
    expect(assessVariant(variant({ prodigiSku: "GLOBAL-FAP-16X24" }), readyMaster).state).toBe("unavailable");
    expect(isPubliclyPurchasable(variant({ prodigiSku: "GLOBAL-FAP-16X24" }), readyMaster)).toBe(false);
  });

  it("uses the variant's own asset, else the master's, as the print-ready file", () => {
    expect(printReadyAssetOf(variant({ printReadyAssetUrl: "v.tif" }), readyMaster)).toBe("v.tif");
    expect(printReadyAssetOf(variant({ printReadyAssetUrl: null }), readyMaster)).toBe(readyMaster.printReadyAssetUrl);
    expect(printReadyAssetOf(variant({ printReadyAssetUrl: null }), missingMaster)).toBeNull();
  });
});

describe("collection helpers", () => {
  it("startingPriceMinor is the lowest purchasable price, ignoring provisional/unpriced", () => {
    const vs = [variant({ id: 1, retailMinor: 9000 }), variant({ id: 2, retailMinor: 6500 }), variant({ id: 3, enabled: false, retailMinor: 100 })];
    expect(startingPriceMinor(vs, readyMaster)).toBe(6500);
  });

  it("startingPriceMinor is null when nothing is purchasable (no ready master)", () => {
    expect(startingPriceMinor([variant()], missingMaster)).toBeNull();
  });

  it("hasPurchasableVariant reflects whether the product can be sold at all", () => {
    expect(hasPurchasableVariant([variant()], readyMaster)).toBe(true);
    expect(hasPurchasableVariant([variant()], missingMaster)).toBe(false);
  });
});

describe("price + snapshot", () => {
  it("resolveVariantPrice multiplies by quantity and refuses unpriced", () => {
    expect(resolveVariantPrice(variant({ retailMinor: 6500 }), 2)).toBe(13000);
    expect(resolveVariantPrice(variant({ retailMinor: 6500 }), 0)).toBe(6500); // floored to 1
    expect(resolveVariantPrice(variant({ retailMinor: null }), 1)).toBeNull();
  });

  it("buildPrintItemSnapshot captures everything needed to reconstruct the exact variant", () => {
    const snap = buildPrintItemSnapshot({
      print: { id: 10, title: "Blue Hour", artworkId: 42 },
      variant: variant({ framed: true, frameColour: "black" }),
      master: readyMaster,
      quantity: 3,
    });
    expect(snap).toMatchObject({
      itemType: "print",
      printId: 10,
      printVariantId: 1,
      artworkId: 42,
      material: "german-etching",
      sizeLabel: "M",
      framed: true,
      frameColour: "black",
      prodigiSku: "GLOBAL-HGE-12X16",
      quantity: 3,
      unitPriceMinor: 6500,
      currency: "EUR",
    });
    // asset falls back to the master when the variant has none
    expect(snap.printReadyAssetUrl).toBe(readyMaster.printReadyAssetUrl);
  });
});

describe("canonical namespace — no collision with /artworks", () => {
  it("prefixes every print under /prints/", () => {
    expect(printCanonicalPath("blue-hour")).toBe("/prints/blue-hour");
    expect(printCanonicalUrl("https://animuradyan.com/", "blue-hour")).toBe("https://animuradyan.com/prints/blue-hour");
  });
});
