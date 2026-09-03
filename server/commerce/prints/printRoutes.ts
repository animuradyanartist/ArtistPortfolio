/**
 * PUBLIC PRINT ROUTES — the storefront read API and the Pinterest catalogue feed. Everything here
 * is gated through the same pure `printProduct` rules as checkout, so a product that is not
 * genuinely purchasable never appears in the collection, never exposes a buyable option, and
 * never enters the feed.
 *
 * The feed endpoint may exist while EMPTY (it returns only the TSV header today, because no master
 * is ready). It is a route, not a submission — nothing here sends anything to Pinterest.
 */

import type { Express, Request } from "express";
import {
  getPurchasablePrintCollection,
  getPrintDetailBySlug,
  getPrintFeedInputs,
  getVariantForCheckout,
  purchasablePrintSlugForArtwork,
} from "./printRepo";
import { assessVariant, startingPriceMinor, resolveVariantPrice } from "@shared/commerce/printProduct";
import { buildFeedTsv } from "@shared/commerce/printFeed";
import { buildMerchantFeed } from "@shared/commerce/merchantFeed";
import { selectMerchantOriginals } from "@shared/commerce/merchantOriginals";
import { storage } from "../../storage";
import { isPrintPreviewMode, getPreviewCatalogue, getPreviewDetail, getPreviewSlugForArtwork } from "./previewProducts";
import { quotePrintShipping } from "./printShipping";
import { getPrintMasterRef, getVariant, getPrintMaster, cropFromRow } from "./adminPrintRepo";
import { verifyMasterToken, readMasterStream, findMasterObjectKey } from "./masterStorage";
import { getProdigiProduct } from "../prodigi/prodigiProducts";
import { MATERIAL_CATEGORY, CATEGORY_LABEL, type PrintMaterial } from "@shared/commerce/prodigiProducts";
import { isCheckoutConfigured } from "../stripeClient";
import { resolvePromoForOrder } from "../promoCheckout";
import { cropExtractPx } from "@shared/commerce/printCrop";
import { serializePrintDetail } from "./printDetailSerializer";
import sharp from "sharp";

function baseUrlOf(req: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol ?? "https";
  return `${proto}://${req.get("host")}`;
}

export function registerPrintRoutes(app: Express): void {
  // ── The storefront collection: ONLY products with a genuinely purchasable variant. In PREVIEW
  //    mode (dev flag), demo products are appended — each carries `preview: true` and is not
  //    purchasable. Production/default returns only real sellable products. ────────────────────
  app.get("/api/commerce/prints", async (_req, res) => {
    try {
      const cards = await getPurchasablePrintCollection();
      const previewMode = isPrintPreviewMode();
      const preview = previewMode
        ? (await getPreviewCatalogue()).map((p) => ({
            id: -p.artworkId, // negative, non-DB id so it can never collide with a real product
            title: p.title,
            slug: p.slug,
            image: p.image,
            artworkId: p.artworkId,
            startingPriceMinor: p.startingPriceMinor,
            currency: p.currency,
            sizeCount: p.sizes.length,
            materialLabel: p.materialLabel,
            preview: true as const,
          }))
        : [];
      res.set("Cache-Control", previewMode ? "no-store" : "public, max-age=60, stale-while-revalidate=300");
      return res.json({ prints: [...cards, ...preview], previewMode });
    } catch {
      return res.status(500).json({ message: "Could not load prints." });
    }
  });

  // ── Cross-link data: does this ORIGINAL artwork have a PURCHASABLE print? (registered before
  //    :slug so the extra path segment resolves here). Returns null while nothing is sellable. ──
  app.get("/api/commerce/prints/for-artwork/:artworkId", async (req, res) => {
    try {
      const artworkId = Number.parseInt(String(req.params.artworkId), 10);
      if (!Number.isInteger(artworkId)) return res.status(400).json({ slug: null });
      // PRODUCTION: only a genuinely purchasable print lights the link. This function is untouched.
      const slug = await purchasablePrintSlugForArtwork(artworkId);
      if (slug) {
        res.set("Cache-Control", "public, max-age=60");
        return res.json({ available: true, slug, preview: false });
      }
      // PREVIEW (dev flag only): a separate, clearly-flagged branch for demo artworks.
      const previewSlug = await getPreviewSlugForArtwork(artworkId);
      res.set("Cache-Control", "no-store");
      return res.json({ available: previewSlug != null, slug: previewSlug, preview: previewSlug != null });
    } catch {
      return res.status(500).json({ slug: null });
    }
  });

  // ── The high-resolution MASTER download, for the fulfilment provider ONLY. It is NOT a public
  //    asset: access requires a cryptographically-signed, short-lived, per-PRINT token (minted fresh
  //    at fulfilment time). No admin auth, no object key exposed, no permanent public/bucket URL. The
  //    bytes are STREAMED from Object Storage through this route. Registered before :slug so the segment
  //    resolves here, not as a print slug. The public PDP exposes only a `masterReady` boolean. ──
  app.get("/api/commerce/prints/master-file/:printId", async (req, res) => {
    try {
      const printId = Number.parseInt(String(req.params.printId), 10);
      if (!Number.isInteger(printId)) return res.status(400).end();
      // Fail closed: a missing, malformed, expired, or wrong-PRINT token gets 403 — never the file.
      if (!verifyMasterToken(typeof req.query.token === "string" ? req.query.token : null, printId)) {
        return res.status(403).end();
      }
      const ref = await getPrintMasterRef(printId);
      const assetKey = ref?.assetKey ?? (await findMasterObjectKey(printId));
      if (!assetKey) return res.status(404).end();

      // OPTIONAL CROP DERIVATIVE. When `?variant=<id>` names a variant OF THIS PRINT that carries a crop,
      // the provider is served the CROPPED region — derived on the fly from the master + the variant's
      // crop metadata (the permanent master is only READ, never modified) — resized to the SKU's exact
      // print-area pixels so no further crop/rotation happens at the provider. Deterministic + retry-safe.
      let crop: ReturnType<typeof cropFromRow> = null;
      let cropDims: { left: number; top: number; width: number; height: number } | null = null;
      let outW = 0, outH = 0;
      const variantIdRaw = req.query.variant;
      if (typeof variantIdRaw === "string" && /^\d+$/.test(variantIdRaw)) {
        const variant = await getVariant(Number(variantIdRaw));
        const master = await getPrintMaster(printId);
        const product = variant ? getProdigiProduct(variant.prodigi_sku) : undefined;
        if (variant && variant.print_id === printId && product && master?.widthPx && master?.heightPx) {
          crop = cropFromRow(variant);
          if (crop) {
            cropDims = cropExtractPx(master.widthPx, master.heightPx, crop);
            outW = product.printAreaWidthPx; outH = product.printAreaHeightPx;
          }
        }
      }

      // Stream the bytes FROM OBJECT STORAGE (not a local disk). Fail-closed on a missing object: if the
      // DB references a master that is gone from storage, answer 410 Gone (never a broken/partial file);
      // a storage error is 502. This is the token-gated fulfilment route (low frequency), so the one
      // existence check inside readMasterStream is acceptable — public pages never hit this path.
      let stream;
      try {
        stream = await readMasterStream(assetKey);
      } catch {
        return res.status(502).end(); // storage unreachable
      }
      if (!stream) return res.status(410).end(); // object unexpectedly missing
      res.set("Cache-Control", "no-store");
      stream.on("error", () => { if (!res.headersSent) res.status(500).end(); });

      if (crop && cropDims) {
        // Extract the crop region → resize to the exact print-area pixels (aspect matches, so no stretch).
        res.type("image/jpeg");
        res.set("Content-Disposition", `attachment; filename="print-${printId}-v${variantIdRaw}.jpg"`);
        const pipeline = sharp({ limitInputPixels: false })
          .rotate()
          .extract(cropDims)
          .resize(outW, outH, { fit: "fill" })
          .jpeg({ quality: 95 });
        pipeline.on("error", () => { if (!res.headersSent) res.status(500).end(); });
        return stream.pipe(pipeline).pipe(res);
      }

      res.type(ref?.contentType || "application/octet-stream");
      if (ref?.filename) res.set("Content-Disposition", `attachment; filename="${ref.filename.replace(/[^\w.\-]/g, "_")}"`);
      return stream.pipe(res);
    } catch {
      return res.status(500).end();
    }
  });

  // ── A REAL shipping quote for a variant to a destination (registered before :slug). The price is
  //    the SERVER's (never the client's); shipping comes from Prodigi's /quotes endpoint. Fails
  //    closed: if the variant is not purchasable, or Prodigi is unconfigured / cannot quote, it
  //    answers `available: false` so the UI shows "calculated at checkout" — NEVER a fake number. ──
  app.post("/api/commerce/prints/quote", async (req, res) => {
    try {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const variantId = Number(b.variantId);
      const country = String(b.country ?? "").trim().toUpperCase();
      let quantity = Number(b.quantity);
      if (!Number.isFinite(quantity)) quantity = 1;
      quantity = Math.min(10, Math.max(1, Math.floor(quantity)));
      if (!Number.isInteger(variantId) || variantId <= 0) {
        return res.status(400).json({ available: false, reason: "bad-request" });
      }

      const resolved = await getVariantForCheckout(variantId);
      // Only a genuinely purchasable variant may be quoted — same gate as checkout.
      if (!resolved || assessVariant(resolved.variant, resolved.master).state !== "purchasable") {
        return res.json({ available: false, reason: "not-purchasable" });
      }
      const itemsMinor = resolveVariantPrice(resolved.variant, quantity);
      if (itemsMinor == null) return res.json({ available: false, reason: "unpriced" });

      // PROMO PREVIEW — server-validated against the item subtotal (the checkout POST re-validates).
      // The discount never touches shipping. An invalid code returns a message, never a fake discount.
      const promoRes = await resolvePromoForOrder(b.promoCode, {
        itemType: "prints", currency: resolved.variant.currency, itemsMinor, now: new Date(),
      });
      const discountMinor = promoRes.status === "applied" ? promoRes.applied.discountMinor : 0;
      const promo = promoRes.status === "applied"
        ? { applied: true, code: promoRes.applied.code, discountMinor,
            discountType: promoRes.applied.discountType, discountValue: promoRes.applied.discountValue }
        : promoRes.status === "error" ? { applied: false, error: promoRes.error, message: promoRes.message } : null;

      // SERVER-RESOLVED customer-facing display for the checkout/cart summary — safe fields only
      // (no SKU, cost, margin, print-area pixels, master URL or storage key). The image is the
      // public artwork URL, never the base64 storefront image.
      const product = getProdigiProduct(resolved.variant.prodigiSku);
      const display = {
        title: resolved.print.title,
        itemKind: "Fine Art Print" as const,
        materialLabel: CATEGORY_LABEL[MATERIAL_CATEGORY[resolved.variant.material as PrintMaterial]] ?? resolved.variant.material,
        sizeLabel: product?.displayName ?? resolved.variant.sizeLabel,
        imageUrl: resolved.print.artworkId != null ? `/img/artwork/${resolved.print.artworkId}/0` : null,
        unitMinor: resolveVariantPrice(resolved.variant, 1),
        quantity,
        itemsMinor,
        discountMinor,
        promo,
        currency: resolved.variant.currency,
        checkoutEnabled: isCheckoutConfigured(),
      };

      res.set("Cache-Control", "no-store");
      // No valid destination yet → return the display so the summary renders, but no shipping/total
      // (fail-closed: the page cannot proceed to payment until a real quote exists).
      if (!/^[A-Z]{2}$/.test(country)) {
        return res.json({ available: false, reason: "no-country", ...display });
      }

      const attributes: Record<string, string> = {};
      if (resolved.variant.framed && resolved.variant.frameColour) attributes.frameColour = resolved.variant.frameColour;

      const quote = await quotePrintShipping({
        prodigiSku: resolved.variant.prodigiSku,
        copies: quantity,
        country,
        currency: resolved.variant.currency,
        ...(Object.keys(attributes).length ? { attributes } : {}),
      });

      if (!quote.ok) {
        // Honest: we could not obtain a live shipping figure — the client shows a message, not a number.
        return res.json({ available: false, reason: quote.reason, ...display });
      }
      return res.json({
        available: true,
        ...display,
        shippingMinor: quote.shippingMinor,
        // Discount reduces the item subtotal only; shipping is added at full and never discounted.
        totalMinor: (itemsMinor - discountMinor) + quote.shippingMinor,
        currency: quote.currency,
        method: quote.method,
      });
    } catch {
      return res.status(500).json({ available: false, reason: "error" });
    }
  });

  // ── The PDP data: the print + its configurable options with an explicit sale state each. ──
  app.get("/api/commerce/prints/:slug", async (req, res) => {
    try {
      const detail = await getPrintDetailBySlug(String(req.params.slug));
      if (!detail) {
        // PREVIEW fallback (dev flag only): a demo product with the same shape, flagged preview.
        // Every option is state 'preview' with NO real variant id, so it can never be checked out.
        const p = await getPreviewDetail(String(req.params.slug));
        if (p) {
          res.set("Cache-Control", "no-store");
          return res.json({
            id: -p.artworkId,
            slug: p.slug,
            title: p.title,
            description: "",
            images: [p.image],
            image: p.image,
            artworkId: p.artworkId,
            artworkPath: p.artworkPath,
            purchasable: false,
            preview: true,
            startingPriceMinor: p.startingPriceMinor,
            masterReady: false,
            materialLabel: p.materialLabel,
            options: p.sizes.map((s) => ({
              id: null, // no DB variant — cannot be checked out
              material: p.material,
              sizeLabel: s.sizeLabel,
              framed: false,
              frameColour: null,
              currency: s.currency,
              priceMinor: s.priceMinor,
              state: "preview" as const,
              reason: null,
            })),
          });
        }
        return res.status(404).json({ message: "Print not found" });
      }

      // ONE contract. The exact same object is seeded into the SSR preload (window.__PRELOADED_PRINT__),
      // so the client never depends on a robots-blocked fetch of THIS endpoint to know the print exists.
      // Images are first-party /img/print refs (no base64, no master); see printDetailSerializer.
      res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      return res.json(serializePrintDetail(detail));
    } catch {
      return res.status(500).json({ message: "Could not load this print." });
    }
  });

  // ── The Pinterest product catalogue feed. Only genuinely sellable variants; correct TSV type.
  //    May be empty (header only) — it is a route, not a submission. No Singulart price fallback. ──
  app.get("/feeds/pinterest-prints.tsv", async (req, res) => {
    try {
      const inputs = await getPrintFeedInputs();
      const tsv = buildFeedTsv(inputs, baseUrlOf(req));
      res.set("Cache-Control", "public, max-age=300");
      res.type("text/tab-separated-values; charset=utf-8");
      return res.send(tsv);
    } catch {
      return res.status(500).type("text/plain").send("Could not build feed.");
    }
  });

  // ── GOOGLE MERCHANT CENTER product data source (RSS 2.0). Public + crawlable (robots.txt does NOT
  //    disallow it), so it never depends on the blocked /api the way the PDP client once did. Built
  //    product-level from the SAME purchasable-print collection the storefront reads, so feed price =
  //    PDP price = Product JSON-LD price. First-party /img/print images only — never base64, never the
  //    master. May be empty (channel only) when nothing is sellable — a route, not a submission. ──
  app.get("/google-merchant.xml", async (req, res) => {
    try {
      const cards = await getPurchasablePrintCollection();
      const items = cards
        .filter((c) => c.startingPriceMinor != null && c.startingPriceMinor > 0)
        .map((c) => ({
          id: c.id,
          title: c.title,
          slug: c.slug,
          priceMinor: c.startingPriceMinor as number,
          currency: c.currency,
          imageCount: c.imageCount,
        }));
      // ORIGINAL PAINTINGS — added to the SAME feed, gated by the canonical isPurchasableArtwork check
      // (inside selectMerchantOriginals) so only works genuinely buyable on the site are advertised.
      // Automatic once ON: a newly-published purchasable original appears on the next refresh; a sold
      // one drops out. Never fabricated — price/currency/link/image all come from the artwork's own row.
      //
      // OFF BY DEFAULT via MERCHANT_INCLUDE_ORIGINALS. The originals are priced in EUR and ship by a
      // destination+size estimate (e.g. ~€420 crated freight to the US) — the print flat-rate US
      // shipping policy CANNOT represent that, and advertising it would understate shipping (a Merchant
      // policy violation). Flip this flag ON only AFTER Merchant Center is configured for the originals'
      // currency + real shipping (see the PR notes / owner decisions). Prints are unaffected either way.
      const includeOriginals = process.env.MERCHANT_INCLUDE_ORIGINALS === "true";
      // OPTIONAL: once the owner creates an "original paintings" return policy in Merchant Center and
      // knows its label, set MERCHANT_ORIGINAL_RETURN_POLICY_LABEL to that exact label and originals
      // will carry g:return_policy_label. Unset (the default) → nothing emitted → account default policy.
      const returnPolicyLabel = process.env.MERCHANT_ORIGINAL_RETURN_POLICY_LABEL || undefined;
      const originals = includeOriginals
        ? selectMerchantOriginals(
            (await storage.getAllArtworks()) as unknown as Parameters<typeof selectMerchantOriginals>[0],
            undefined,
            { returnPolicyLabel },
          )
        : [];
      const xml = buildMerchantFeed(items, baseUrlOf(req), originals);
      res.set("Cache-Control", "public, max-age=300");
      res.type("application/xml; charset=utf-8");
      return res.send(xml);
    } catch {
      return res.status(500).type("text/plain").send("Could not build feed.");
    }
  });
}
