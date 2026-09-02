/**
 * THE ONE PRINT-DETAIL CONTRACT.
 *
 * `/api/commerce/prints/:slug` and the print PDP's SSR preload MUST hand the React client the
 * identical object, because the client decides "does this print exist?" from it. When only the
 * API produced this shape, the server could resolve a print the client then could not: Googlebot's
 * renderer obeys `robots.txt` (which disallows `/api`), so the client's runtime fetch was blocked,
 * `isError` became true, and the page rendered "This print could not be found." — a Soft 404 on a
 * page whose <head> already carried a correct Product + Offer. The fix is to serialise the detail
 * ONCE here and let the SSR seed `window.__PRELOADED_PRINT__` with it, so the print is present in
 * the initial HTML and never depends on a robots-blocked fetch (the same cure the artwork PDP uses
 * via `__PRELOADED_ARTWORK__`).
 *
 * Pure over `detail`; no `req`/`res`. Images are first-party `/img/print/:id/:idx` refs — never the
 * base64 blob, never the private master. The master's high-resolution asset URL is not part of this
 * shape and is never emitted here.
 */
import type { PrintProductDetail } from "./printRepo";
import { printSlugOf } from "./printRepo";
import {
  publicSelectableVariants,
  assessVariant,
  isPubliclyPurchasable,
  startingPriceMinor,
} from "@shared/commerce/printProduct";
import { getProdigiProduct } from "../prodigi/prodigiProducts";
import { toImageRef } from "../../images";

export interface PrintDetailOption {
  id: number;
  material: string;
  sizeLabel: string;
  sizeName: string;
  widthCm: number;
  heightCm: number;
  framed: boolean;
  frameColour: string | null;
  currency: string;
  priceMinor: number | null;
  effectiveDpi: number | null;
  mockup: string | null;
  state: string;
  reason: string | null;
  prodigiVerified: boolean;
}

export interface PrintDetailResponse {
  id: number;
  slug: string;
  title: string;
  description: string;
  images: string[];
  image: string | null;
  artworkId: number | null;
  purchasable: boolean;
  startingPriceMinor: number | null;
  masterReady: boolean;
  options: PrintDetailOption[];
}

/**
 * Serialise a resolved print detail into the exact public `/api/commerce/prints/:slug` response.
 * Not for the preview/demo product — that has its own clearly-flagged shape in the route.
 */
export function serializePrintDetail(detail: PrintProductDetail): PrintDetailResponse {
  // Only the options the configurator may present: enabled + eligible + still-offered variants.
  // This SAME selectable set drives purchasability + starting price, so a print with no
  // currently-offered variant is not publicly purchasable.
  const selectable = publicSelectableVariants(detail.variants, detail.master);
  const options: PrintDetailOption[] = selectable
    .map((v) => ({ v, a: assessVariant(v, detail.master) }))
    .map(({ v, a }) => {
      // Customer-facing size NAME + precise physical cm from the verified catalogue; the SKU stays
      // server-side. `sizeName` is the displayName without the cm suffix ("A3", "12×16 in").
      const product = getProdigiProduct(v.prodigiSku);
      const sizeName = product ? product.displayName.split(" (")[0] : v.sizeLabel;
      return {
        id: v.id,
        material: v.material,
        sizeLabel: v.sizeLabel,
        sizeName,
        widthCm: product?.widthCm ?? v.widthCm,
        heightCm: product?.heightCm ?? v.heightCm,
        framed: v.framed,
        frameColour: v.frameColour,
        currency: v.currency,
        priceMinor: v.retailMinor, // RETAIL (customer-facing), never the Prodigi cost
        effectiveDpi: v.effectiveDpi,
        mockup: v.mockups?.[0] ?? null,
        state: a.state,
        reason: a.reason,
        prodigiVerified: a.prodigiVerified,
      };
    });

  const purchasable = selectable.some((v) => isPubliclyPurchasable(v, detail.master));

  // Swap any base64-in-DB image for a small first-party `/img/print/:id/:idx` ref. Non-data values
  // (external URLs) pass through untouched. Never the base64 blob, never the private master.
  const images = detail.print.images.map((img, i) => toImageRef("print", detail.print.id, i, img));

  return {
    id: detail.print.id,
    slug: printSlugOf(detail.print),
    title: detail.print.title,
    description: detail.print.description,
    images,
    image: images[0] ?? null,
    artworkId: detail.print.artworkId,
    purchasable,
    startingPriceMinor: startingPriceMinor(selectable, detail.master),
    masterReady: detail.master?.status === "ready",
    options,
  };
}
