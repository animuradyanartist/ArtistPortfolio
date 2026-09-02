/**
 * The print-detail contract the API and the SSR preload both emit (serializePrintDetail).
 *
 * These lock the invariants that keep the print PDP indexable AND safe:
 *   - the fields the React client reads to decide the print EXISTS (id, slug, title, options) — the
 *     contract whose absence let a robots-blocked fetch render a Soft 404;
 *   - public images are first-party /img/print refs, never base64, never the private master URL.
 */
import { describe, it, expect } from "vitest";
import { serializePrintDetail } from "./printDetailSerializer";
import type { PrintProductDetail } from "./printRepo";
import type { PrintVariantView, PrintMasterView } from "@shared/commerce/printProduct";

const MASTER_SECRET_URL = "https://storage.example.com/masters/road-through-gold-PRINT-READY.tif";

function variant(over: Partial<PrintVariantView> = {}): PrintVariantView {
  return {
    id: 7, printId: 19, material: "german-etching", prodigiSku: "GLOBAL-HGE-A2", sizeLabel: "L",
    widthCm: 42, heightCm: 59.4, framed: false, frameColour: null, retailMinor: 6900, currency: "USD",
    printReadyAssetUrl: MASTER_SECRET_URL, mockups: ["https://cdn.example.com/mockup.jpg"],
    effectiveDpi: 300, eligible: true, enabled: true, prodigiVerified: true, ...over,
  };
}

const readyMaster: PrintMasterView = {
  status: "ready", widthPx: 3000, heightPx: 4200,
  printReadyAssetUrl: MASTER_SECRET_URL, checksumMd5: "abc",
};

function detail(over: Partial<PrintProductDetail> = {}): PrintProductDetail {
  return {
    print: {
      id: 19, title: "Road Through Gold", slug: "road_through_gold",
      description: "A luminous coastal road at golden hour.",
      // idx0 is a base64 blob (must become a /img ref); idx1 an external URL (must pass through).
      images: ["data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==", "https://cdn.example.com/alt.jpg"],
      artworkId: 59, status: "active",
    },
    variants: [variant()],
    master: readyMaster,
    ...over,
  };
}

describe("serializePrintDetail — the print-detail contract", () => {
  it("emits every field the client needs to know the print exists", () => {
    const r = serializePrintDetail(detail());
    expect(r.id).toBe(19);
    expect(r.slug).toBe("road_through_gold");
    expect(r.title).toBe("Road Through Gold");
    expect(r.description).toContain("golden hour");
    expect(r.artworkId).toBe(59);
    expect(Array.isArray(r.options)).toBe(true);
  });

  it("marks a genuinely purchasable print purchasable, with selectable options + a starting price", () => {
    const r = serializePrintDetail(detail());
    expect(r.purchasable).toBe(true);
    expect(r.options.length).toBeGreaterThan(0);
    expect(r.startingPriceMinor).toBe(6900);
    const opt = r.options[0];
    expect(opt).toMatchObject({ id: 7, material: "german-etching", currency: "USD", priceMinor: 6900 });
  });

  it("swaps a base64 image for a first-party /img/print ref and passes an external URL through", () => {
    const r = serializePrintDetail(detail());
    expect(r.images[0]).toMatch(/^\/img\/print\/19\/0\?v=[0-9a-f]{8}$/);
    expect(r.image).toBe(r.images[0]);
    expect(r.images[1]).toBe("https://cdn.example.com/alt.jpg");
  });

  it("NEVER leaks base64 or the private master URL anywhere in the payload", () => {
    const json = JSON.stringify(serializePrintDetail(detail()));
    expect(json).not.toContain("data:image");
    expect(json).not.toContain(MASTER_SECRET_URL);
    expect(json).not.toContain("PRINT-READY");
    expect(json).not.toContain("printReadyAssetUrl");
  });

  it("an unpurchasable print (no ready master) still serializes, just not as buyable", () => {
    const r = serializePrintDetail(detail({ master: null }));
    expect(r.id).toBe(19);            // still a real, resolvable print (no Soft 404)
    expect(r.purchasable).toBe(false); // but honestly not for sale
    expect(JSON.stringify(r)).not.toContain(MASTER_SECRET_URL);
  });
});
