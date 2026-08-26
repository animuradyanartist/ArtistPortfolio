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
} from "./printRepo";
import { assessVariant, isPubliclyPurchasable, startingPriceMinor } from "@shared/commerce/printProduct";
import { buildFeedTsv } from "@shared/commerce/printFeed";

function baseUrlOf(req: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol ?? "https";
  return `${proto}://${req.get("host")}`;
}

export function registerPrintRoutes(app: Express): void {
  // ── The storefront collection: ONLY products with a genuinely purchasable variant. ──────
  app.get("/api/commerce/prints", async (_req, res) => {
    try {
      const cards = await getPurchasablePrintCollection();
      res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      return res.json({ prints: cards });
    } catch {
      return res.status(500).json({ message: "Could not load prints." });
    }
  });

  // ── The PDP data: the print + its configurable options with an explicit sale state each. ──
  app.get("/api/commerce/prints/:slug", async (req, res) => {
    try {
      const detail = await getPrintDetailBySlug(String(req.params.slug));
      if (!detail) return res.status(404).json({ message: "Print not found" });

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
