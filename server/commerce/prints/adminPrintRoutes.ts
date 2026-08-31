/**
 * ADMIN PRINT ROUTES — manage print masters + variants. Every route is behind `requireAdminAuth`.
 *
 * THE ADMIN SUPPLIES INTENT (which SKU, what price, which asset, enable?); the SERVER supplies the
 * physical facts (material, size, pixels, DPI, eligibility) from the verified catalogue + master —
 * mirroring the checkout principle that the client never sets a fact. An invented SKU is refused; a
 * variant can only be enabled when it is genuinely sellable.
 */

import type { Express } from "express";
import multer from "multer";
import { requireAdminAuth } from "../../auth";
import { hasDatabase } from "../../db";
import { PRODIGI_LAUNCH_PRODUCTS, eligibleSkusForMaster } from "../prodigi/prodigiProducts";
import { printReadiness } from "@shared/commerce/printProduct";
import { validateVariantSave, type VariantSaveInput } from "./adminPrintService";
import {
  getMaster, upsertMaster,
  getPrintMaster, upsertPrintMasterFile, clearPrintMaster,
  listVariants, getVariant, createVariant, updateVariant, deleteVariant, printArtworkId,
} from "./adminPrintRepo";
import { getAdminPrintsOverview, getPrintAdminDetail, setPrintStatus } from "./printRepo";
import {
  ensureMasterDirs, stagingDir, storeMasterFromStaging, removeMasterFiles, cleanupStaged,
  MasterValidationError,
} from "./masterStorage";

/** Master upload — STREAMED straight to the persistent-disk staging area (never buffered in memory,
 *  never base64/JSON), so real 300-DPI files up to 500 MB are handled without touching Postgres. */
const MASTER_MAX_BYTES = 500 * 1024 * 1024;
const masterUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => { ensureMasterDirs().then(() => cb(null, stagingDir())).catch((e) => cb(e as Error, "")); },
    filename: (_req, _file, cb) => cb(null, `upload-${Date.now()}-${Math.round(Math.random() * 1e9)}`),
  }),
  limits: { fileSize: MASTER_MAX_BYTES },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith("image/")),
});

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

  // ── Master FILE UPLOAD (per PRINT) — MULTIPART, STREAMED to the persistent disk under this print.
  //    multer streams to staging; the SERVER validates the ACTUAL bytes (sharp: JPEG/PNG/TIFF only),
  //    reads dimensions, computes checksum + size, ATOMICALLY swaps it into <printId>/master.<ext>,
  //    and stores ONLY the reference + metadata on the prints row. The master belongs to THIS print,
  //    so replacing it never touches another print. Bytes never enter the DB and are never public. ──
  app.post("/api/admin/prints/masters/:printId/file", requireAdminAuth, masterUpload.single("file"), async (req, res) => {
    const staged = req.file?.path;
    try {
      const printId = Number.parseInt(String(req.params.printId), 10);
      if (!Number.isInteger(printId)) { await cleanupStaged(staged); return res.status(400).json({ message: "Bad print id" }); }
      if (!req.file) return res.status(400).json({ message: "Please choose a high-resolution image file." });
      // The print must exist before a master can belong to it (no orphan masters).
      if (hasDatabase && (await getPrintAdminDetail(printId)) == null) {
        await cleanupStaged(staged);
        return res.status(404).json({ message: "Save the print first, then upload its master." });
      }

      // Validate + atomically store. A validation/format error preserves any previous master.
      const stored = await storeMasterFromStaging(printId, req.file.path, req.file.originalname, req.file.mimetype);
      // A master is 'ready' only when its resolution clears at least one verified launch size.
      const eligibleSkus = eligibleSkusForMaster({ widthPx: stored.widthPx, heightPx: stored.heightPx });
      const status = eligibleSkus.length > 0 ? "ready" : "provisional";

      await upsertPrintMasterFile(printId, {
        widthPx: stored.widthPx, heightPx: stored.heightPx, assetKey: stored.assetKey,
        assetFilename: stored.filename, contentType: stored.contentType, byteSize: stored.byteSize,
        checksumMd5: stored.checksumMd5, status,
      });
      // Prefer the persisted row; fall back to the just-stored metadata (local preview has no DB).
      const master = (await getPrintMaster(printId)) ?? {
        widthPx: stored.widthPx, heightPx: stored.heightPx, status,
        printReadyAssetUrl: `/api/commerce/prints/master-file/${printId}`, assetKey: stored.assetKey,
        assetFilename: stored.filename, contentType: stored.contentType, byteSize: stored.byteSize,
        checksumMd5: stored.checksumMd5, note: null, hasAsset: true,
      };
      return res.json({ ok: true, master, eligibleSizeCount: eligibleSkus.length });
    } catch (e) {
      await cleanupStaged(staged); // failed/aborted upload leaves nothing in staging
      if (e instanceof MasterValidationError) return res.status(400).json({ message: e.message });
      return res.status(500).json({ message: "Could not save the master file." });
    }
  });

  // multer errors (file-too-large / aborted) → clean staging + a clear 4xx, never an orphan.
  app.use("/api/admin/prints/masters/:printId/file", async (err: any, req: any, res: any, next: any) => {
    if (err) {
      await cleanupStaged(req.file?.path);
      if (err.code === "LIMIT_FILE_SIZE" || /file too large/i.test(err.message ?? "")) {
        return res.status(413).json({ message: "That file is larger than the 500 MB limit." });
      }
      return res.status(400).json({ message: "The upload could not be processed." });
    }
    return next(err);
  });

  // Remove a print's master (back to 'missing') — deletes the disk file, clears the reference, AND
  // fail-closed UNPUBLISHES the print (a published print cannot survive without a valid master).
  app.delete("/api/admin/prints/masters/:printId/file", requireAdminAuth, async (req, res) => {
    try {
      const printId = Number.parseInt(String(req.params.printId), 10);
      if (!Number.isInteger(printId)) return res.status(400).json({ message: "Bad print id" });
      await removeMasterFiles(printId);
      await clearPrintMaster(printId);
      // No valid master ⇒ nothing is publishable; revert to Draft so the raw status matches reality.
      await setPrintStatus(printId, "draft");
      return res.json({ ok: true, master: await getPrintMaster(printId), status: "draft" });
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
      // The master now belongs to the PRINT, not the artwork.
      const master = await getPrintMaster(printId);
      const artworkId = await printArtworkId(printId);
      return res.json({ variants: await listVariants(printId), master, artworkId });
    } catch {
      return res.status(500).json({ message: "Could not load variants." });
    }
  });

  app.post("/api/admin/prints/:printId/variants", requireAdminAuth, async (req, res) => {
    try {
      const printId = Number.parseInt(String(req.params.printId), 10);
      if (!Number.isInteger(printId)) return res.status(400).json({ message: "Bad print id" });
      // Eligibility is derived from THIS PRINT's own master.
      const master = await getPrintMaster(printId);
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
      const master = await getPrintMaster(existing.print_id);
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
