/**
 * ADMIN PRINT ROUTES — manage print masters + variants. Every route is behind `requireAdminAuth`.
 *
 * THE ADMIN SUPPLIES INTENT (which SKU, what price, which asset, enable?); the SERVER supplies the
 * physical facts (material, size, pixels, DPI, eligibility) from the verified catalogue + master —
 * mirroring the checkout principle that the client never sets a fact. An invented SKU is refused; a
 * variant can only be enabled when it is genuinely sellable.
 */

import type { Express, Request } from "express";
import { createHash } from "crypto";
import { requireAdminAuth } from "../../auth";
import { PRODIGI_LAUNCH_PRODUCTS, eligibleSkusForMaster } from "../prodigi/prodigiProducts";
import { printReadiness } from "@shared/commerce/printProduct";
import { validateVariantSave, type VariantSaveInput } from "./adminPrintService";
import {
  getMaster, upsertMaster, upsertMasterFile, clearMaster, getMasterAsset,
  listVariants, getVariant, createVariant, updateVariant, deleteVariant, printArtworkId,
} from "./adminPrintRepo";
import { getAdminPrintsOverview, getPrintAdminDetail, setPrintStatus } from "./printRepo";

/** Absolute app origin for building the fulfilment-facing master asset URL. */
function originOf(req: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol ?? "https";
  return `${proto}://${req.get("host")}`;
}

/** Parse a `data:<mime>;base64,<data>` URL into its bytes + mime. Null if it isn't one. */
function parseDataUrl(s: unknown): { mime: string; buffer: Buffer } | null {
  if (typeof s !== "string") return null;
  const m = /^data:([^;,]+);base64,(.+)$/i.exec(s.trim());
  if (!m) return null;
  try {
    return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
  } catch {
    return null;
  }
}

function readVariantInput(body: unknown): VariantSaveInput {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    sku: String(b.sku ?? "").trim(),
    framed: Boolean(b.framed),
    frameColour: b.frameColour ? String(b.frameColour).trim().toLowerCase() : null,
    retailMinor: b.retailMinor == null || b.retailMinor === "" ? null : Number(b.retailMinor),
    currency: String(b.currency ?? "USD").trim().toUpperCase().slice(0, 3) || "USD",
    printReadyAssetUrl: b.printReadyAssetUrl ? String(b.printReadyAssetUrl).trim() : null,
    enabled: Boolean(b.enabled),
  };
}

export function registerAdminPrintRoutes(app: Express): void {
  // The verified SKU catalogue — powers the admin's SKU picker so no SKU is ever typed by hand.
  app.get("/api/admin/prints/catalogue", requireAdminAuth, (_req, res) => {
    res.json({ products: PRODIGI_LAUNCH_PRODUCTS });
  });

  // The admin management-table read: every print with its DERIVED summary (materials, counts,
  // starting price, fail-closed status) + source-artwork title. No stored "is live"/"price" flags.
  app.get("/api/admin/prints/overview", requireAdminAuth, async (_req, res) => {
    try {
      return res.json({ prints: await getAdminPrintsOverview() });
    } catch {
      return res.status(500).json({ message: "Could not load prints." });
    }
  });

  // ── Master (per artwork) ──
  app.get("/api/admin/prints/masters/:artworkId", requireAdminAuth, async (req, res) => {
    try {
      const artworkId = Number.parseInt(String(req.params.artworkId), 10);
      if (!Number.isInteger(artworkId)) return res.status(400).json({ message: "Bad artwork id" });
      return res.json({ master: await getMaster(artworkId) });
    } catch {
      return res.status(500).json({ message: "Could not load master." });
    }
  });

  app.put("/api/admin/prints/masters/:artworkId", requireAdminAuth, async (req, res) => {
    try {
      const artworkId = Number.parseInt(String(req.params.artworkId), 10);
      if (!Number.isInteger(artworkId)) return res.status(400).json({ message: "Bad artwork id" });
      const b = (req.body ?? {}) as Record<string, unknown>;
      const status = ["missing", "provisional", "ready"].includes(String(b.status)) ? String(b.status) : "missing";
      const widthPx = b.widthPx == null || b.widthPx === "" ? null : Number(b.widthPx);
      const heightPx = b.heightPx == null || b.heightPx === "" ? null : Number(b.heightPx);
      const url = b.printReadyAssetUrl ? String(b.printReadyAssetUrl).trim() : null;
      // Guard: a master may only be marked 'ready' with real dimensions + a stable HTTPS asset.
      if (status === "ready" && (!widthPx || !heightPx || !url || !/^https:\/\//i.test(url))) {
        return res.status(400).json({ message: "A print-ready master needs pixel dimensions and a stable HTTPS asset URL." });
      }
      await upsertMaster(artworkId, {
        widthPx, heightPx, printReadyAssetUrl: url,
        checksumMd5: b.checksumMd5 ? String(b.checksumMd5).trim() : null,
        status, note: b.note ? String(b.note).trim().slice(0, 500) : null,
      });
      return res.json({ ok: true, master: await getMaster(artworkId) });
    } catch {
      return res.status(500).json({ message: "Could not save master." });
    }
  });

  // ── Master FILE UPLOAD (per artwork). Replaces the manual "paste an HTTPS URL" flow: the admin
  //    uploads a high-res file, the client measured its pixels, and the SERVER derives readiness
  //    (a genuine hi-res file that clears at least one launch size → 'ready', else 'provisional').
  //    The bytes are stored server-side and served over HTTPS from an app route — never linked
  //    publicly. Nothing physical is trusted beyond the pixels; eligibility is derived here. ──
  app.post("/api/admin/prints/masters/:artworkId/file", requireAdminAuth, async (req, res) => {
    try {
      const artworkId = Number.parseInt(String(req.params.artworkId), 10);
      if (!Number.isInteger(artworkId)) return res.status(400).json({ message: "Bad artwork id" });
      const b = (req.body ?? {}) as Record<string, unknown>;
      const parsed = parseDataUrl(b.dataUrl);
      if (!parsed || !parsed.mime.startsWith("image/")) {
        return res.status(400).json({ message: "Please upload a valid image file." });
      }
      const widthPx = Number(b.widthPx);
      const heightPx = Number(b.heightPx);
      if (!Number.isInteger(widthPx) || !Number.isInteger(heightPx) || widthPx <= 0 || heightPx <= 0) {
        return res.status(400).json({ message: "The image dimensions could not be read." });
      }
      const filename = typeof b.filename === "string" ? b.filename.slice(0, 200) : "master";
      const checksumMd5 = createHash("md5").update(parsed.buffer).digest("hex");
      // A master is 'ready' only when its resolution clears at least one verified launch size; a file
      // too small to print at any size is stored but stays 'provisional' (never yields an eligible sale).
      const eligibleSkus = eligibleSkusForMaster({ widthPx, heightPx });
      const status = eligibleSkus.length > 0 ? "ready" : "provisional";
      const assetUrl = `${originOf(req)}/api/commerce/prints/master-asset/${artworkId}`;

      await upsertMasterFile(artworkId, {
        widthPx, heightPx, assetData: String(b.dataUrl), assetFilename: filename, assetUrl, checksumMd5, status,
      });
      return res.json({
        ok: true,
        master: await getMaster(artworkId),
        eligibleSizeCount: eligibleSkus.length,
      });
    } catch {
      return res.status(500).json({ message: "Could not save the master file." });
    }
  });

  // Remove an uploaded master (back to 'missing').
  app.delete("/api/admin/prints/masters/:artworkId/file", requireAdminAuth, async (req, res) => {
    try {
      const artworkId = Number.parseInt(String(req.params.artworkId), 10);
      if (!Number.isInteger(artworkId)) return res.status(400).json({ message: "Bad artwork id" });
      await clearMaster(artworkId);
      return res.json({ ok: true, master: await getMaster(artworkId) });
    } catch {
      return res.status(500).json({ message: "Could not remove the master file." });
    }
  });

  // ── PUBLISH / UNPUBLISH. Publishing re-checks readiness on the SERVER (the same fail-closed gate
  //    as checkout) and refuses with the exact missing reasons — it can never make an unready print
  //    live. Unpublish returns it to Draft, hidden from the public storefront but kept in admin. ──
  app.post("/api/admin/prints/:printId/publish", requireAdminAuth, async (req, res) => {
    try {
      const printId = Number.parseInt(String(req.params.printId), 10);
      if (!Number.isInteger(printId)) return res.status(400).json({ message: "Bad print id" });
      const detail = await getPrintAdminDetail(printId);
      if (!detail) return res.status(404).json({ message: "Print not found" });
      const readiness = printReadiness(
        {
          title: detail.print.title,
          description: detail.print.description,
          artworkId: detail.print.artworkId,
          imageCount: detail.print.images.length,
          master: detail.master,
          variants: detail.variants,
        },
        detail.print.status,
      );
      if (!readiness.canPublish) {
        return res.status(409).json({ code: "not-ready", message: "Cannot publish yet.", missing: readiness.missing });
      }
      await setPrintStatus(printId, "active");
      return res.json({ ok: true, status: "active" });
    } catch {
      return res.status(500).json({ message: "Could not publish this print." });
    }
  });

  app.post("/api/admin/prints/:printId/unpublish", requireAdminAuth, async (req, res) => {
    try {
      const printId = Number.parseInt(String(req.params.printId), 10);
      if (!Number.isInteger(printId)) return res.status(400).json({ message: "Bad print id" });
      const ok = await setPrintStatus(printId, "draft");
      if (!ok) return res.status(404).json({ message: "Print not found" });
      return res.json({ ok: true, status: "draft" });
    } catch {
      return res.status(500).json({ message: "Could not unpublish this print." });
    }
  });

  // ── Variants (per print product) ──
  app.get("/api/admin/prints/:printId/variants", requireAdminAuth, async (req, res) => {
    try {
      const printId = Number.parseInt(String(req.params.printId), 10);
      if (!Number.isInteger(printId)) return res.status(400).json({ message: "Bad print id" });
      const artworkId = await printArtworkId(printId);
      const master = artworkId != null ? await getMaster(artworkId) : null;
      return res.json({ variants: await listVariants(printId), master, artworkId });
    } catch {
      return res.status(500).json({ message: "Could not load variants." });
    }
  });

  app.post("/api/admin/prints/:printId/variants", requireAdminAuth, async (req, res) => {
    try {
      const printId = Number.parseInt(String(req.params.printId), 10);
      if (!Number.isInteger(printId)) return res.status(400).json({ message: "Bad print id" });
      const artworkId = await printArtworkId(printId);
      const master = artworkId != null ? await getMaster(artworkId) : null;
      const validated = validateVariantSave(readVariantInput(req.body), master);
      if (!validated.ok) return res.status(400).json({ message: "Please check the variant", errors: validated.errors });
      const created = await createVariant(printId, validated.row!);
      return res.status(201).json({ variant: created });
    } catch {
      return res.status(500).json({ message: "Could not create variant." });
    }
  });

  app.put("/api/admin/prints/variants/:id", requireAdminAuth, async (req, res) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      const existing = await getVariant(id);
      if (!existing) return res.status(404).json({ message: "Variant not found" });
      const artworkId = await printArtworkId(existing.print_id);
      const master = artworkId != null ? await getMaster(artworkId) : null;
      const validated = validateVariantSave(readVariantInput(req.body), master);
      if (!validated.ok) return res.status(400).json({ message: "Please check the variant", errors: validated.errors });
      const updated = await updateVariant(id, validated.row!);
      return res.json({ variant: updated });
    } catch {
      return res.status(500).json({ message: "Could not update variant." });
    }
  });

  app.delete("/api/admin/prints/variants/:id", requireAdminAuth, async (req, res) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      const ok = await deleteVariant(id);
      if (!ok) return res.status(404).json({ message: "Variant not found" });
      return res.status(204).send();
    } catch {
      return res.status(500).json({ message: "Could not delete variant." });
    }
  });
}
