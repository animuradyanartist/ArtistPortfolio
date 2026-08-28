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
  printSlugOf,
  purchasablePrintSlugForArtwork,
} from "./printRepo";
import { assessVariant, isPubliclyPurchasable, startingPriceMinor } from "@shared/commerce/printProduct";
import { buildFeedTsv } from "@shared/commerce/printFeed";
import { isPrintPreviewMode, getPreviewCatalogue, getPreviewDetail, getPreviewSlugForArtwork } from "./previewProducts";

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
