import { describe, it, expect } from "vitest";
import {
  buildPreviewCatalogue,
  buildPreviewProduct,
  findPreviewSpecBySlug,
  isPreviewArtworkTitle,
  demoSkusAreAllVerified,
  PREVIEW_PRODUCTS,
  DEMO_PRICE_MINOR,
  type PreviewArtworkRef,
} from "./previewCatalogue";
import { assessMasterForSku, isActiveLaunchSku } from "./prodigiProducts";

const ref = (id: number, title: string): PreviewArtworkRef => ({
  id, title, image: `/img/artwork/${id}/0`, artworkPath: `/artworks/${title.toLowerCase().replace(/ /g, "-")}-${id}`,
});

// A resolver that knows the three demo artworks (reuses their existing image URLs).
const resolve = (title: string): PreviewArtworkRef | null => {
  const map: Record<string, PreviewArtworkRef> = {
    "road to tuscany": ref(69, "Road to Tuscany"),
    "no measure for distance": ref(79, "No Measure for Distance"),
    "a sign in the distance": ref(70, "A Sign in the Distance"),
  };
  return map[title.trim().toLowerCase()] ?? null;
};

describe("A. preview products render in development preview mode", () => {
  it("builds 3 demo products from the demo specs, reusing existing image URLs", () => {
    const products = buildPreviewCatalogue(resolve);
    expect(products).toHaveLength(3);
    const rt = products.find((p) => p.slug === "road-to-tuscany")!;
    expect(rt.preview).toBe(true);
    expect(rt.image).toBe("/img/artwork/69/0"); // existing URL reused, not copied
    expect(rt.materialLabel).toBe("Hahnemühle German Etching");
    expect(rt.sizes.length).toBeGreaterThan(0);
    expect(rt.startingPriceMinor).toBe(Math.min(...rt.sizes.map((s) => s.priceMinor)));
  });

  it("shows customer-friendly size labels (no pixels) from the verified catalogue", () => {
    const rt = buildPreviewProduct(PREVIEW_PRODUCTS[0], ref(69, "Road to Tuscany"))!;
    for (const s of rt.sizes) {
      expect(s.sizeLabel).not.toMatch(/px|pixel|\d{3,}/); // no pixel dimensions ever
    }
    expect(rt.sizes.map((s) => s.sizeLabel)).toContain("30 × 40 cm");
    expect(rt.sizes.map((s) => s.sizeLabel)).toContain("A2");
  });

  it("skips a demo product whose artwork is absent (graceful)", () => {
    expect(buildPreviewProduct(PREVIEW_PRODUCTS[0], null)).toBeNull();
  });
});

describe("B/C. a preview product can never become a real sale or feed row", () => {
  it("preview sizes carry NO sellability fields — no variant id, enabled, or eligible", () => {
    const rt = buildPreviewProduct(PREVIEW_PRODUCTS[0], ref(69, "Road to Tuscany"))!;
    for (const s of rt.sizes) {
      expect(s).not.toHaveProperty("id");
      expect(s).not.toHaveProperty("variantId");
      expect(s).not.toHaveProperty("enabled");
      expect(s).not.toHaveProperty("eligible");
      // only display fields exist
      expect(Object.keys(s).sort()).toEqual(["currency", "priceMinor", "sizeLabel", "sku"]);
    }
  });

  it("every demo SKU is a REAL verified launch SKU (no invented sizes)", () => {
    expect(demoSkusAreAllVerified()).toBe(true);
    for (const sku of Object.keys(DEMO_PRICE_MINOR)) expect(isActiveLaunchSku(sku)).toBe(true);
  });
});

describe("D. preview (medium-res) images do not satisfy master eligibility", () => {
  it("a ~1280px web image clears NO verified SKU — it is never a master", () => {
    // The demo images are the site's medium-res web files (~1280px long edge).
    for (const sku of Object.keys(DEMO_PRICE_MINOR)) {
      const e = assessMasterForSku({ widthPx: 1280, heightPx: 1600 }, sku)!;
      expect(e.eligible).toBe(false);
    }
  });
});

describe("F. slug/title lookups", () => {
  it("finds specs by slug and recognises demo artwork titles", () => {
    expect(findPreviewSpecBySlug("road-to-tuscany")?.artworkTitle).toBe("Road to Tuscany");
    expect(findPreviewSpecBySlug("not-a-demo")).toBeNull();
    expect(isPreviewArtworkTitle("A Sign in the Distance")).toBe(true);
    expect(isPreviewArtworkTitle("Some Other Painting")).toBe(false);
  });
});
