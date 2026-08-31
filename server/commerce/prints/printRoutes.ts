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
  printSlugOf,
  purchasablePrintSlugForArtwork,
} from "./printRepo";
import { assessVariant, isPubliclyPurchasable, startingPriceMinor, resolveVariantPrice } from "@shared/commerce/printProduct";
import { buildFeedTsv } from "@shared/commerce/printFeed";
import { isPrintPreviewMode, getPreviewCatalogue, getPreviewDetail, getPreviewSlugForArtwork } from "./previewProducts";
import { quotePrintShipping } from "./printShipping";
import { getPrintMasterRef } from "./adminPrintRepo";
import { verifyMasterToken, readMasterStream, findMasterKeyOnDisk } from "./masterStorage";

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
  //    at fulfilment time). No admin auth, no filesystem path exposed, no permanent public URL. The
  //    bytes are STREAMED from the persistent disk. Registered before :slug so the segment resolves
  //    here, not as a print slug. The public PDP exposes only a `masterReady` boolean. ──
  app.get("/api/commerce/prints/master-file/:printId", async (req, res) => {
    try {
      const printId = Number.parseInt(String(req.params.printId), 10);
      if (!Number.isInteger(printId)) return res.status(400).end();
      // Fail closed: a missing, malformed, expired, or wrong-PRINT token gets 403 — never the file.
      if (!verifyMasterToken(typeof req.query.token === "string" ? req.query.token : null, printId)) {
        return res.status(403).end();
      }
      const ref = await getPrintMasterRef(printId);
      const assetKey = ref?.assetKey ?? (await findMasterKeyOnDisk(printId));
      if (!assetKey) return res.status(404).end();
      const stream = readMasterStream(assetKey);
      if (!stream) return res.status(404).end();
      res.set("Cache-Control", "no-store");
      res.type(ref?.contentType || "application/octet-stream");
      if (ref?.filename) res.set("Content-Disposition", `attachment; filename="${ref.filename.replace(/[^\w.\-]/g, "_")}"`);
      stream.on("error", () => { if (!res.headersSent) res.status(500).end(); });
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
      if (!Number.isInteger(variantId) || variantId <= 0 || !/^[A-Z]{2}$/.test(country)) {
        return res.status(400).json({ available: false, reason: "bad-request" });
      }

      const resolved = await getVariantForCheckout(variantId);
      // Only a genuinely purchasable variant may be quoted — same gate as checkout.
      if (!resolved || assessVariant(resolved.variant, resolved.master).state !== "purchasable") {
        return res.json({ available: false, reason: "not-purchasable" });
      }
      const itemsMinor = resolveVariantPrice(resolved.variant, quantity);
      if (itemsMinor == null) return res.json({ available: false, reason: "unpriced" });

      const attributes: Record<string, string> = {};
      if (resolved.variant.framed && resolved.variant.frameColour) attributes.frameColour = resolved.variant.frameColour;

      const quote = await quotePrintShipping({
        prodigiSku: resolved.variant.prodigiSku,
        copies: quantity,
        country,
        currency: resolved.variant.currency,
        ...(Object.keys(attributes).length ? { attributes } : {}),
      });

      res.set("Cache-Control", "no-store");
      if (!quote.ok) {
        // Honest: we could not obtain a live shipping figure — the client shows a message, not a number.
        return res.json({
          available: false,
          reason: quote.reason,
          itemsMinor,
          currency: resolved.variant.currency,
        });
      }
      return res.json({
        available: true,
        itemsMinor,
        shippingMinor: quote.shippingMinor,
        totalMinor: itemsMinor + quote.shippingMinor,
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

      // Expose only the options the configurator may present: enabled + eligible variants. A
      // disabled or resolution-failing variant ('unavailable') is hidden entirely.
      const options = detail.variants
        .map((v) => ({ v, a: assessVariant(v, detail.master) }))
        .filter(({ a }) => a.state !== "unavailable")
        .map(({ v, a }) => ({
          id: v.id,
          material: v.material,
          sizeLabel: v.sizeLabel,
          widthCm: v.widthCm,
          heightCm: v.heightCm,
          framed: v.framed,
          frameColour: v.frameColour,
          currency: v.currency,
          priceMinor: v.retailMinor,
          effectiveDpi: v.effectiveDpi,
          mockup: v.mockups?.[0] ?? null,
          state: a.state, // 'purchasable' | 'provisional'
          reason: a.reason,
          prodigiVerified: a.prodigiVerified,
        }));

      const purchasable = detail.variants.some((v) => isPubliclyPurchasable(v, detail.master));

      res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      return res.json({
        id: detail.print.id,
        slug: printSlugOf(detail.print),
        title: detail.print.title,
        description: detail.print.description,
        images: detail.print.images,
        image: detail.print.images[0] ?? null,
        artworkId: detail.print.artworkId,
        purchasable,
        startingPriceMinor: startingPriceMinor(detail.variants, detail.master),
        masterReady: detail.master?.status === "ready",
        options,
      });
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
}
