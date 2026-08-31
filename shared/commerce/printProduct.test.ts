import { describe, it, expect } from "vitest";
import {
  assessVariant,
  isPubliclyPurchasable,
  startingPriceMinor,
  hasPurchasableVariant,
  publicSelectableVariants,
  resolveVariantPrice,
  buildPrintItemSnapshot,
  printReadyAssetOf,
  printCanonicalPath,
  printCanonicalUrl,
  printAdminSummary,
  printReadiness,
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

describe("publicSelectableVariants — what a NEW public purchase may pick (PDP options)", () => {
  const paper = variant({ id: 1, material: "german-etching", prodigiSku: "GLOBAL-HGE-A3" });
  const canvas = variant({ id: 2, material: "stretched-canvas", prodigiSku: "GLOBAL-CAN-A3" });
  const photoRag = variant({ id: 3, material: "photo-rag", prodigiSku: "GLOBAL-HPR-A3" });

  it("offers German Etching + Canvas (the two launch materials)", () => {
    const sel = publicSelectableVariants([paper, canvas], readyMaster);
    expect(sel.map((v) => v.id).sort()).toEqual([1, 2]);
  });

  it("does NOT offer retired Photo Rag for a new purchase (even when enabled + eligible + master ready)", () => {
    // Photo Rag is not 'unavailable' (it is a launch SKU historically), but it is no longer OFFERED.
    expect(assessVariant(photoRag, readyMaster).state).toBe("purchasable"); // would show without the offered gate
    const sel = publicSelectableVariants([paper, photoRag, canvas], readyMaster);
    expect(sel.map((v) => v.id).sort()).toEqual([1, 2]);           // Photo Rag (id 3) excluded
    expect(sel.some((v) => v.material === "photo-rag")).toBe(false);
  });

  it("excludes 'unavailable' variants (disabled or resolution-failing) — only eligible+enabled appear", () => {
    const disabled = variant({ id: 4, material: "german-etching", prodigiSku: "GLOBAL-HGE-16X20", enabled: false });
    const lowRes = variant({ id: 5, material: "german-etching", prodigiSku: "GLOBAL-HGE-18X24", eligible: false });
    const sel = publicSelectableVariants([paper, disabled, lowRes], readyMaster);
    expect(sel.map((v) => v.id)).toEqual([1]);
  });

  it("keeps OFFERED provisional variants (not-yet-ready master) — they show as 'available soon', still selectable", () => {
    const sel = publicSelectableVariants([paper, canvas], missingMaster); // provisional (master missing)
    expect(sel.map((v) => v.id).sort()).toEqual([1, 2]);
    expect(sel.every((v) => assessVariant(v, missingMaster).state === "provisional")).toBe(true);
  });

  it("EDGE: a Photo-Rag-ONLY print is NOT publicly purchasable and has no starting price", () => {
    // The PDP route computes purchasable + startingPrice from publicSelectableVariants (the same set
    // the customer can pick). A historical print whose only purchasable variant is Photo Rag therefore
    // reads as not-purchasable publicly — while the variant itself still fulfils for existing orders.
    const onlyPhotoRag = [photoRag]; // photoRag is purchasable against a ready master
    expect(isPubliclyPurchasable(photoRag, readyMaster)).toBe(true); // still buyable as a raw variant
    const selectable = publicSelectableVariants(onlyPhotoRag, readyMaster);
    expect(selectable).toEqual([]);
    expect(selectable.some((v) => isPubliclyPurchasable(v, readyMaster))).toBe(false); // public: not purchasable
    expect(startingPriceMinor(selectable, readyMaster)).toBeNull();                     // public: no price
  });

  it("EDGE: with an offered German Etching variant, purchasable + starting price come from the offered set", () => {
    const selectable = publicSelectableVariants([paper, photoRag], readyMaster);
    expect(selectable.some((v) => isPubliclyPurchasable(v, readyMaster))).toBe(true);
    expect(startingPriceMinor(selectable, readyMaster)).toBe(paper.retailMinor); // Photo Rag price never leaks in
  });
});

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

describe("printReadiness — the publish gate + checklist", () => {
  const ready = (over = {}) => printReadiness({
    title: "Blue Hour", description: "A calm sea", artworkId: 7, imageCount: 1,
    master: readyMaster, variants: [variant()], ...over,
  }, "active");

  it("canPublish only when every check passes (a genuinely purchasable variant + presentable)", () => {
    const r = ready();
    expect(r.canPublish).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.state).toBe("published");
  });

  it("blocks publish and lists what's missing when the master is not ready", () => {
    const r = ready({ master: missingMaster });
    expect(r.canPublish).toBe(false);
    expect(r.missing).toContain("High-resolution master uploaded");
    expect(r.missing).toContain("Master resolution eligible");
    expect(r.missing).toContain("Option enabled and purchasable");
  });

  it("blocks publish when no variant is enabled/purchasable", () => {
    const r = ready({ variants: [variant({ enabled: false })] });
    expect(r.canPublish).toBe(false);
    expect(r.missing).toEqual(["Option enabled and purchasable"]);
  });

  it("flags missing details and image", () => {
    const r = ready({ title: "", imageCount: 0, artworkId: null });
    expect(r.checks.find((c) => c.key === "details")?.ok).toBe(false);
    expect(r.checks.find((c) => c.key === "image")?.ok).toBe(false);
    expect(r.canPublish).toBe(false);
  });

  it("an unverified SKU is not a verified Prodigi product and cannot publish", () => {
    const r = ready({ variants: [variant({ prodigiSku: "GLOBAL-FAP-16X24" })] });
    expect(r.checks.find((c) => c.key === "sku")?.ok).toBe(false);
    expect(r.canPublish).toBe(false);
  });
});

describe("canonical namespace — no collision with /artworks", () => {
  it("prefixes every print under /prints/", () => {
    expect(printCanonicalPath("blue-hour")).toBe("/prints/blue-hour");
    expect(printCanonicalUrl("https://animuradyan.com/", "blue-hour")).toBe("https://animuradyan.com/prints/blue-hour");
  });
});

describe("printAdminSummary — the derived management-table status (never a manual flag)", () => {
  it("is DRAFT when the product row is not active, whatever the variants say", () => {
    const s = printAdminSummary("hidden", [variant()], readyMaster);
    expect(s.status).toBe("draft");
  });

  it("is NOT-READY when active but no master is ready (the honest default today)", () => {
    const s = printAdminSummary("active", [variant()], missingMaster);
    expect(s.status).toBe("not-ready");
    expect(s.startingPriceMinor).toBeNull();
  });

  it("is READY when a variant could sell the instant it is enabled, but none is enabled yet", () => {
    const s = printAdminSummary("active", [variant({ enabled: false })], readyMaster);
    expect(s.status).toBe("ready");
    expect(s.startingPriceMinor).toBeNull(); // nothing purchasable yet → no public starting price
    expect(s.lowestPriceMinor).toBe(6500);   // but the admin still sees the configured price
  });

  it("shows the configured price on a Draft/unpurchasable row (admin sees intent, storefront does not)", () => {
    const s = printAdminSummary("hidden", [variant({ retailMinor: 18000 })], missingMaster);
    expect(s.status).toBe("draft");
    expect(s.startingPriceMinor).toBeNull(); // storefront: not buyable
    expect(s.lowestPriceMinor).toBe(18000);  // admin: the price you set
  });

  it("is PUBLISHED only when the fail-closed gate genuinely passes for a variant", () => {
    const s = printAdminSummary("active", [variant()], readyMaster);
    expect(s.status).toBe("published");
    expect(s.startingPriceMinor).toBe(6500);
  });

  it("a 'Published' label can never be faked — an unverified SKU stays not-ready", () => {
    const s = printAdminSummary("active", [variant({ prodigiSku: "GLOBAL-FAP-16X24", enabled: true })], readyMaster);
    expect(s.status).toBe("not-ready");
  });

  it("derives materials (distinct, first-seen order), counts and the lowest purchasable price", () => {
    const s = printAdminSummary("active", [
      variant({ id: 1, material: "photo-rag", retailMinor: 9000 }),
      variant({ id: 2, material: "german-etching", retailMinor: 6500 }),
      variant({ id: 3, material: "photo-rag", retailMinor: 12000 }),
    ], readyMaster);
    expect(s.materials).toEqual(["photo-rag", "german-etching"]);
    expect(s.variantCount).toBe(3);
    expect(s.enabledCount).toBe(3);
    expect(s.startingPriceMinor).toBe(6500);
  });
});
