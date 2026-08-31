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
  getPrintMaster, upsertPrintMasterFile, clearPrintMaster, getPrintMasterRef,
  listVariants, getVariant, createVariant, updateVariant, deleteVariant, printArtworkId,
} from "./adminPrintRepo";
import { getAdminPrintsOverview, getPrintAdminDetail, setPrintStatus } from "./printRepo";
import {
  ensureMasterDirs, stagingDir, storeMasterFromStaging, removeMasterFiles, removeMasterObject,
  masterObjectExists, cleanupStaged, MasterValidationError,
} from "./masterStorage";
import { MasterStorageError } from "./masterObjectStore";

/** Master upload — STREAMED to a LOCAL DISPOSABLE staging file (never buffered in memory, never
 *  base64/JSON), validated, then uploaded to persistent Object Storage. 300-DPI files up to 500 MB are
 *  handled without touching Postgres, and permanent bytes never depend on local filesystem persistence. */
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

  // ── Master FILE UPLOAD (per PRINT) — MULTIPART, streamed to a LOCAL DISPOSABLE staging file, then
  //    persisted to Object Storage. The SERVER validates the ACTUAL bytes (sharp: JPEG/PNG/TIFF only),
  //    reads dimensions, computes checksum + size, uploads to a NEW per-PRINT key, and stores ONLY the
  //    reference + metadata on the prints row. Master belongs to THIS print, so replacing it never
  //    touches another print. Bytes never enter the DB and are never public. ──
  //
  //    SAFE REPLACEMENT: the new object is written under a fresh key BEFORE the DB is touched; the OLD
  //    object is deleted ONLY after the DB commits to the new key. A validation error, an upload/storage
  //    error, or a DB write failure all leave the previous valid master completely intact.
  app.post("/api/admin/prints/masters/:printId/file", requireAdminAuth, masterUpload.single("file"), async (req, res) => {
    const staged = req.file?.path;
    let uploadedKey: string | null = null;
    try {
      const printId = Number.parseInt(String(req.params.printId), 10);
      if (!Number.isInteger(printId)) { await cleanupStaged(staged); return res.status(400).json({ message: "Bad print id" }); }
      if (!req.file) return res.status(400).json({ message: "Please choose a high-resolution image file." });
      // The print must exist before a master can belong to it (no orphan masters).
      if (hasDatabase && (await getPrintAdminDetail(printId)) == null) {
        await cleanupStaged(staged);
        return res.status(404).json({ message: "Save the print first, then upload its master." });
      }

      // The CURRENT master's key (if any), captured BEFORE we upload — deleted only after a clean commit.
      const oldKey = (await getPrintMaster(printId))?.assetKey ?? null;

      // Validate + upload to a NEW object key. A validation/format error, or a storage failure, throws
      // here and nothing below runs — the previous master (oldKey) is untouched.
      const stored = await storeMasterFromStaging(printId, req.file.path, req.file.originalname, req.file.mimetype);
      uploadedKey = stored.assetKey;
      // A master is 'ready' only when its resolution clears at least one verified launch size.
      const eligibleSkus = eligibleSkusForMaster({ widthPx: stored.widthPx, heightPx: stored.heightPx });
      const status = eligibleSkus.length > 0 ? "ready" : "provisional";

      try {
        await upsertPrintMasterFile(printId, {
          widthPx: stored.widthPx, heightPx: stored.heightPx, assetKey: stored.assetKey,
          assetFilename: stored.filename, contentType: stored.contentType, byteSize: stored.byteSize,
          checksumMd5: stored.checksumMd5, status,
        });
      } catch (dbErr) {
        // DB failed AFTER the new object was uploaded → roll back the new object so no orphan is left,
        // and leave the DB + previous master exactly as they were.
        await removeMasterObject(uploadedKey).catch(() => {});
        throw dbErr;
      }

      // Committed. NOW it is safe to delete the OBSOLETE previous object (only if the key changed).
      if (oldKey && oldKey !== stored.assetKey) {
        await removeMasterObject(oldKey).catch((e) =>
          console.error(`[master] obsolete object cleanup failed (orphan left in storage): ${oldKey}`, e instanceof Error ? e.message : e),
        );
      }
      await cleanupStaged(staged);

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
      // A storage-layer failure is loud (5xx), never a silent success — the previous master is preserved.
      if (e instanceof MasterStorageError) {
        return res.status(502).json({ message: "The master could not be saved to storage. Your previous master is unchanged. Please try again." });
      }
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

  // Remove a print's master (back to 'missing') — deletes the object(s) from storage, clears the
  // reference, AND fail-closed UNPUBLISHES the print (a published print cannot survive without a valid
  // master). CONSERVATIVE: if the storage delete fails, we still clear the DB and revert to Draft — the
  // safe direction (the DB never claims a valid master while the object is known-missing) — and log the
  // possible orphan rather than leaving a dangling "ready" pointer.
  app.delete("/api/admin/prints/masters/:printId/file", requireAdminAuth, async (req, res) => {
    try {
      const printId = Number.parseInt(String(req.params.printId), 10);
      if (!Number.isInteger(printId)) return res.status(400).json({ message: "Bad print id" });
      let storageRemoved = true;
      try {
        await removeMasterFiles(printId);
      } catch (e) {
        storageRemoved = false;
        console.error(`[master] object removal failed for print ${printId} (possible orphan in storage):`, e instanceof Error ? e.message : e);
      }
      await clearPrintMaster(printId);
      // No valid master ⇒ nothing is publishable; revert to Draft so the raw status matches reality.
      await setPrintStatus(printId, "draft");
      return res.json({ ok: true, master: await getPrintMaster(printId), status: "draft", storageRemoved });
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
      // FAIL-CLOSED against a missing master OBJECT: never publish a print whose bytes are gone from
      // storage (readiness only checks the DB record). One cheap metadata round-trip on this rare admin
      // action — NOT on public page requests. If storage cannot be reached, refuse rather than guess.
      const ref = await getPrintMasterRef(printId);
      let present = false;
      try {
        present = ref?.assetKey ? await masterObjectExists(ref.assetKey) : false;
      } catch {
        return res.status(502).json({ code: "storage-unavailable", message: "Could not verify the master in storage. Please try again." });
      }
      if (!present) {
        return res.status(409).json({ code: "master-missing", message: "The production master file is missing from storage. Re-upload it before publishing." });
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
