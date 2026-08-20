/**
 * A WORK ON DIRECT SALE NEVER LEADS WITH A LINK OFF THIS SITE.
 *
 * Reported on production: an artwork configured for direct sale still sent people to Singulart
 * from a Buy Now. The hierarchy these pin:
 *
 *   direct sale on  →  primary = this site's checkout; marketplace is a small secondary link
 *   direct sale off →  the existing marketplace / enquiry behaviour, untouched
 *
 * The rule lives in one function so the grid, the detail page, the modal and the checkout
 * cannot each hold a different opinion — which is how they drifted in the first place.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { artworkCommerceDisplay, type DisplayArtwork } from "./display";

const work = (over: Partial<DisplayArtwork> = {}): DisplayArtwork => ({
  id: 69, availability: "available", directSaleEnabled: true,
  websitePriceMinor: 100000, websiteCurrency: "EUR", shippingEnabled: true,
  price: 2420, buyLink: "https://www.singulart.com/en/artworks/x", ...over,
});

describe("when a work is on direct sale", () => {
  it("the primary control is this site's checkout", () => {
    const d = artworkCommerceDisplay(work());
    expect(d.directSale).toBe(true);
    expect(d.checkoutPath).toBe("/checkout?artwork=69");
    expect(d.marketplacePrimaryAllowed).toBe(false);
  });

  it("shows the WEBSITE price, never the marketplace one", () => {
    const d = artworkCommerceDisplay(work({ websitePriceMinor: 100000, price: 2420 }));
    expect(d.websitePrice).toBe("€1,000.00");
    expect(d.websitePrice).not.toContain("2,420");
  });

  it("keeps the marketplace as a link that says where it goes", () => {
    const d = artworkCommerceDisplay(work());
    expect(d.marketplaceUrl).toContain("singulart");
    expect(d.marketplaceLabel).toBe("View on Singulart");
    expect(d.marketplaceLabel.toLowerCase()).not.toContain("buy");
  });

  it("names Saatchi correctly when that is the only marketplace", () => {
    const d = artworkCommerceDisplay(work({ buyLink: null, saatchiUrl: "https://saatchiart.com/x" }));
    expect(d.marketplaceLabel).toBe("View on Saatchi Art");
  });

  /**
   * The states that used to hand the page back to the marketplace. A work she has put on sale
   * here is still hers to sell here — the primary route does not revert because shipping needs
   * a quote or Stripe is mid-configuration.
   */
  it("STILL refuses an off-site primary while something merely blocks the sale", () => {
    for (const patch of [
      { shippingEnabled: false },
      { reservedUntil: new Date(Date.now() + 600_000) },
      { hasCommitment: true, commitmentUntil: null },
    ] as Partial<DisplayArtwork>[]) {
      const d = artworkCommerceDisplay(work(patch));
      expect(d.directSale).toBe(true);
      expect(d.purchasableNow).toBe(false);
      expect(d.marketplacePrimaryAllowed).toBe(false);
    }
  });
});

describe("when a work is NOT on direct sale, nothing changes", () => {
  it("leaves the marketplace as the primary route", () => {
    for (const patch of [{ directSaleEnabled: false }, { websitePriceMinor: null }, { websitePriceMinor: 0 }]) {
      const d = artworkCommerceDisplay(work(patch));
      expect(d.directSale).toBe(false);
      expect(d.marketplacePrimaryAllowed).toBe(true);
      expect(d.websitePrice).toBeNull();
    }
  });

  it("a sold work is neither purchasable here nor advertised as such", () => {
    const d = artworkCommerceDisplay(work({ availability: "sold" }));
    expect(d.purchasableNow).toBe(false);
  });

  it("sold, reserved and not-for-sale never become purchasable", () => {
    for (const v of ["sold", "reserved", "not for sale", "in a private collection"]) {
      expect(artworkCommerceDisplay(work({ availability: v })).purchasableNow).toBe(false);
    }
  });
});

/**
 * Source-level guards. The behavioural tests above cannot see a page that forgot to ask.
 */
describe("no surface may hand a direct-sale work to a marketplace", () => {
  const read = (f: string) => fs.readFileSync(path.resolve(__dirname, "..", "..", f), "utf8");

  it("every surface with a Buy control consults the shared rule", () => {
    for (const f of [
      "client/src/pages/ArtworkDetailPage.tsx",
      "client/src/pages/ArtworksPage.tsx",
      "client/src/components/ArtworkModal.tsx",
    ]) {
      expect(read(f), `${f} must ask artworkCommerceDisplay rather than re-deriving eligibility`)
        .toContain("artworkCommerceDisplay");
    }
  });

  it("the detail page hides its legacy marketplace buttons on a direct-sale work", () => {
    expect(read("client/src/pages/ArtworkDetailPage.tsx")).toMatch(/!directSale && artwork\.availability === "available"/);
  });

  it("the modal's off-site Buy Now is gated on direct sale being OFF", () => {
    expect(read("client/src/components/ArtworkModal.tsx")).toMatch(/!artworkCommerceDisplay\([^)]*\)\.directSale/);
  });

  it("the purchase panel's Buy now is a single anchor with a real href", () => {
    const s = read("client/src/components/PurchasePanel.tsx");
    // The nested <Link><a> pair produced an outer anchor with no href that swallowed clicks.
    expect(s).not.toMatch(/<Link\s+href=\{`\/checkout[^}]*\}>\s*<a/);
    expect(s).toMatch(/<Link\s+href=\{`\/checkout\?artwork=\$\{artworkId\}`\}/);
  });
});
