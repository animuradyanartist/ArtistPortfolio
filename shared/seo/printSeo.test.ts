import { describe, it, expect } from "vitest";
import { recommendPrintLanding, printPdpIndexable, printProductSchemaAllowed } from "./printSeo";
import type { OpportunityScore } from "./scoring";
import type { PrintVariantView, PrintMasterView } from "../commerce/printProduct";

const score = (n: number): OpportunityScore => ({ score: n, band: n >= 65 ? "high" : n >= 40 ? "medium" : "low", factors: [] });

describe("print landing recommendation (Phase 11) — never publish an empty page", () => {
  it("SKIPs when demand is weak or the SERP is dominated", () => {
    expect(recommendPrintLanding({ slug: "blue-wall-art", label: "Blue", score: score(30), serpIndependentShare: 0.6, matchingPurchasableProducts: 3 }).decision).toBe("skip");
    expect(recommendPrintLanding({ slug: "blue-wall-art", label: "Blue", score: score(70), serpIndependentShare: 0.05, matchingPurchasableProducts: 3 }).decision).toBe("skip");
  });

  it("WAITs when the opportunity is real but there is no purchasable inventory", () => {
    const r = recommendPrintLanding({ slug: "neutral-wall-art", label: "Neutral", score: score(70), serpIndependentShare: 0.6, matchingPurchasableProducts: 0 });
    expect(r.decision).toBe("wait-for-inventory");
    expect(r.reason).toMatch(/empty page/i);
  });

  it("CREATEs only when demand + a beatable SERP + real inventory all hold", () => {
    const r = recommendPrintLanding({ slug: "landscape-art-prints", label: "Landscape", score: score(72), serpIndependentShare: 0.6, matchingPurchasableProducts: 4 });
    expect(r.decision).toBe("create");
  });
});

// Reuse the verified purchasability rule — a print PDP is indexable / schema-eligible ONLY when sellable.
const readyMaster: PrintMasterView = { status: "ready", widthPx: 6000, heightPx: 4000, printReadyAssetUrl: "https://cdn/m.tif", checksumMd5: null };
const missingMaster: PrintMasterView = { status: "missing", widthPx: null, heightPx: null, printReadyAssetUrl: null, checksumMd5: null };
function variant(over: Partial<PrintVariantView> = {}): PrintVariantView {
  return { id: 1, printId: 10, material: "german-etching", prodigiSku: "GLOBAL-HGE-12X16", sizeLabel: "M", widthCm: 30, heightCm: 40, framed: false, frameColour: null, retailMinor: 6500, currency: "EUR", printReadyAssetUrl: null, mockups: null, effectiveDpi: 300, eligible: true, enabled: true, prodigiVerified: true, ...over };
}

describe("print PDP indexing + schema gated on real purchasability (Phase 11)", () => {
  it("is indexable + schema-eligible only when a variant is genuinely purchasable", () => {
    expect(printPdpIndexable([variant()], readyMaster)).toBe(true);
    expect(printProductSchemaAllowed([variant()], readyMaster)).toBe(true);
  });
  it("is NOT indexable while no master is ready (today's whole catalogue)", () => {
    expect(printPdpIndexable([variant()], missingMaster)).toBe(false);
    expect(printProductSchemaAllowed([variant()], missingMaster)).toBe(false);
  });
  it("is NOT indexable when disabled or unpriced", () => {
    expect(printPdpIndexable([variant({ enabled: false })], readyMaster)).toBe(false);
    expect(printPdpIndexable([variant({ retailMinor: null })], readyMaster)).toBe(false);
  });
});
