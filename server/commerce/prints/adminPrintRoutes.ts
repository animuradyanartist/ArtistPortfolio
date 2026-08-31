/**
 * ADMIN PRINT ROUTES — manage print masters + variants. Every route is behind `requireAdminAuth`.
 *
 * THE ADMIN SUPPLIES INTENT (which SKU, what price, which asset, enable?); the SERVER supplies the
 * physical facts (material, size, pixels, DPI, eligibility) from the verified catalogue + master —
 * mirroring the checkout principle that the client never sets a fact. An invented SKU is refused; a
 * variant can only be enabled when it is genuinely sellable.
 */

import express, { type Express, type Response } from "express";
import multer from "multer";
import { requireAdminAuth } from "../../auth";
import { hasDatabase } from "../../db";
import { PRODIGI_LAUNCH_PRODUCTS, eligibleSkusForMaster, getProdigiProduct, isSkuOfferedForNewVariant } from "../prodigi/prodigiProducts";
import { printReadiness } from "@shared/commerce/printProduct";
import { isValidCropShape, cropFitsSku, type NormalizedCrop } from "@shared/commerce/printCrop";
import { validateVariantSave, type VariantSaveInput } from "./adminPrintService";
import {
  getMaster, upsertMaster,
  getPrintMaster, upsertPrintMasterFile, clearPrintMaster, getPrintMasterRef,
  listVariants, getVariant, createVariant, updateVariant, deleteVariant, printArtworkId,
  printHasVariantForSku, reassessVariantsForMaster, setVariantCrop, cropFromRow,
} from "./adminPrintRepo";
import { deriveVariantFields } from "./adminPrintService";
import sharp from "sharp";
import { getAdminPrintsOverview, getPrintAdminDetail, setPrintStatus } from "./printRepo";
import {
  ensureMasterDirs, stagingDir, storeMasterFromStaging, removeMasterFiles, removeMasterObject,
  masterObjectExists, cleanupStaged, readMasterStream, MasterValidationError,
} from "./masterStorage";
import { MasterStorageError } from "./masterObjectStore";
import { initUpload, putChunk, reassembleUpload, discardUpload, UPLOAD_CHUNK_BYTES } from "./masterUpload";
import { quotePrintShipping, adminQuoteDiagnostic } from "./printShipping";
import { prodigiMode } from "../prodigi/prodigiClient";

/**
 * Finalise a validated staging file as THIS print's master, safely (shared by the single-shot upload and
 * the chunked-upload completion). Upload the new object under a FRESH key, then update the DB, then delete
 * the obsolete old object — so a validation error, storage failure, or DB failure never destroys the
 * previous valid master. Throws MasterValidationError / MasterStorageError / (DB error) to the caller.
 */
async function commitMaster(printId: number, stagedPath: string, originalName: string, mime: string) {
  const oldKey = (await getPrintMaster(printId))?.assetKey ?? null;
  const stored = await storeMasterFromStaging(printId, stagedPath, originalName, mime);
  const eligibleSkus = eligibleSkusForMaster({ widthPx: stored.widthPx, heightPx: stored.heightPx });
  const status = eligibleSkus.length > 0 ? "ready" : "provisional";
  try {
    await upsertPrintMasterFile(printId, {
      widthPx: stored.widthPx, heightPx: stored.heightPx, assetKey: stored.assetKey,
      assetFilename: stored.filename, contentType: stored.contentType, byteSize: stored.byteSize,
      checksumMd5: stored.checksumMd5, status,
    });
  } catch (dbErr) {
    // DB failed AFTER the new object was uploaded → roll back the new object; leave DB + old master intact.
    await removeMasterObject(stored.assetKey).catch(() => {});
    throw dbErr;
  }
  // Committed. NOW it is safe to delete the OBSOLETE previous object (only if the key changed).
  if (oldKey && oldKey !== stored.assetKey) {
    await removeMasterObject(oldKey).catch((e) =>
      console.error(`[master] obsolete object cleanup failed (orphan left in storage): ${oldKey}`, e instanceof Error ? e.message : e),
    );
  }
  // Prefer the persisted row; fall back to the just-stored metadata (local preview has no DB).
  const master = (await getPrintMaster(printId)) ?? {
    widthPx: stored.widthPx, heightPx: stored.heightPx, status,
    printReadyAssetUrl: `/api/commerce/prints/master-file/${printId}`, assetKey: stored.assetKey,
    assetFilename: stored.filename, contentType: stored.contentType, byteSize: stored.byteSize,
    checksumMd5: stored.checksumMd5, note: null, hasAsset: true,
  };
  // The master just changed → re-derive every variant's cached eligibility against it (best-effort;
  // never fail the upload over this). Keeps the fail-closed publish/storefront gates in sync too.
  await reassessVariantsForMaster(printId, master).catch((e) =>
    console.error(`[master] variant reassessment failed for print ${printId}:`, e instanceof Error ? e.message : e),
  );
  return { master, eligibleSizeCount: eligibleSkus.length };
}

/** Map a master-commit failure to a controlled HTTP response (validation → 400, storage → 502, else 500). */
function masterErrorResponse(res: Response, e: unknown) {
  if (e instanceof MasterValidationError) return res.status(400).json({ message: e.message });
  if (e instanceof MasterStorageError) {
    return res.status(502).json({ message: "The master could not be saved to storage. Your previous master is unchanged. Please try again." });
  }
  return res.status(500).json({ message: "Could not save the master file." });
}

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
  //    NOTE: this single-request path only works for files small enough to clear the Replit ingress
  //    proxy's request-body cap. Large masters (100–500 MB) MUST use the CHUNKED routes below, because
  //    the proxy 413s a big body BEFORE it reaches Express. The admin UI uses the chunked flow.
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
      const result = await commitMaster(printId, req.file.path, req.file.originalname, req.file.mimetype);
      await cleanupStaged(staged);
      return res.json({ ok: true, ...result });
    } catch (e) {
      await cleanupStaged(staged); // failed/aborted upload leaves nothing in staging
      return masterErrorResponse(res, e);
    }
  });

  // ── CHUNKED master upload (per PRINT) — the production path for LARGE masters on Replit Autoscale.
  //    The browser splits the file into small chunks that each clear the ingress cap; the server stages
  //    them as Object Storage objects (stateless across Autoscale instances), then reassembles +
  //    validates + commits on `complete`. Same security + fail-safe semantics as the single-shot route.
  //
  //  init → { uploadId, chunkBytes }; then N× chunk (raw octet-stream, ≤ chunkBytes); then complete.
  app.post("/api/admin/prints/masters/:printId/upload/init", requireAdminAuth, async (req, res) => {
    try {
      const printId = Number.parseInt(String(req.params.printId), 10);
      if (!Number.isInteger(printId)) return res.status(400).json({ message: "Bad print id" });
      if (hasDatabase && (await getPrintAdminDetail(printId)) == null) {
        return res.status(404).json({ message: "Save the print first, then upload its master." });
      }
      return res.json({ ok: true, ...initUpload() });
    } catch {
      return res.status(500).json({ message: "Could not start the upload." });
    }
  });

  // One chunk: RAW body (never JSON/base64), capped at the chunk size so a request can never be large.
  app.post(
    "/api/admin/prints/masters/:printId/upload/:uploadId/chunk",
    requireAdminAuth,
    express.raw({ type: () => true, limit: UPLOAD_CHUNK_BYTES + 1024 * 1024 }),
    async (req, res) => {
      try {
        const printId = Number.parseInt(String(req.params.printId), 10);
        if (!Number.isInteger(printId)) return res.status(400).json({ message: "Bad print id" });
        const index = Number(req.query.index);
        const buf = req.body as Buffer;
        if (!Buffer.isBuffer(buf) || buf.length === 0) return res.status(400).json({ message: "Empty or missing chunk body." });
        await putChunk(printId, String(req.params.uploadId), index, buf);
        return res.json({ ok: true, index });
      } catch (e) {
        if (e instanceof MasterValidationError) return res.status(400).json({ message: e.message });
        if (e instanceof MasterStorageError) return res.status(502).json({ message: "A chunk could not be stored. Please retry the upload." });
        return res.status(500).json({ message: "Could not store the chunk." });
      }
    },
  );

  // Reassemble + validate + commit. Same fail-safe path as the single-shot upload.
  app.post("/api/admin/prints/masters/:printId/upload/:uploadId/complete", requireAdminAuth, async (req, res) => {
    const printId = Number.parseInt(String(req.params.printId), 10);
    const uploadId = String(req.params.uploadId);
    let staged: string | undefined;
    try {
      if (!Number.isInteger(printId)) return res.status(400).json({ message: "Bad print id" });
      if (hasDatabase && (await getPrintAdminDetail(printId)) == null) {
        await discardUpload(printId, uploadId);
        return res.status(404).json({ message: "Save the print first, then upload its master." });
      }
      const b = (req.body ?? {}) as Record<string, unknown>;
      const originalName = b.originalName ? String(b.originalName) : "master";
      const totalChunks = b.totalChunks == null ? undefined : Number(b.totalChunks);
      staged = await reassembleUpload(printId, uploadId, totalChunks);
      const result = await commitMaster(printId, staged, originalName, "application/octet-stream");
      await discardUpload(printId, uploadId); // remove the staged chunk objects
      await cleanupStaged(staged);
      return res.json({ ok: true, ...result });
    } catch (e) {
      await discardUpload(printId, uploadId).catch(() => {});
      await cleanupStaged(staged);
      return masterErrorResponse(res, e);
    }
  });

  // Abort an in-flight upload — purge its staged chunk objects.
  app.post("/api/admin/prints/masters/:printId/upload/:uploadId/abort", requireAdminAuth, async (req, res) => {
    try {
      const printId = Number.parseInt(String(req.params.printId), 10);
      if (!Number.isInteger(printId)) return res.status(400).json({ message: "Bad print id" });
      await discardUpload(printId, String(req.params.uploadId)).catch(() => {});
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ message: "Could not abort the upload." });
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
      // Master gone → every variant is now ineligible; re-derive the cached flags to match (fail-closed).
      await reassessVariantsForMaster(printId, null).catch((e) =>
        console.error(`[master] variant reassessment failed for print ${printId}:`, e instanceof Error ? e.message : e),
      );
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
      // RECOMPUTE eligibility LIVE against the CURRENT master + THIS variant's crop. The cached
      // `eligible`/`effective_dpi` go stale on a master change; deriving here keeps the editor honest and
      // returns the exact reason (crop-required / resolution / …) + crop state instead of "Not eligible".
      const variants = (await listVariants(printId)).map((v) => {
        const d = deriveVariantFields(v.prodigi_sku, master, cropFromRow(v));
        if (!d.ok) return { ...v, eligible: false, crop_required: false, crop_configured: false, reason: d.error, reason_code: "unverified-sku" as const };
        return {
          ...v,
          eligible: d.fields.eligible,
          effective_dpi: d.fields.effectiveDpi,
          crop_required: d.fields.cropRequired,
          crop_configured: d.fields.cropConfigured,
          reason: d.fields.reason,
          reason_code: d.fields.reasonCode,
        };
      });
      return res.json({ variants, master, artworkId });
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
      const input = readVariantInput(req.body);
      // A NEW variant may only use a SKU that is OFFERED for new variants. Retired Photo Rag (HPR) is
      // verified (historical rows still work) but can never be ADDED again. Editing an existing
      // historical variant goes through PUT, which does not apply this gate — backward compatible.
      if (input.sku && !isSkuOfferedForNewVariant(input.sku)) {
        return res.status(400).json({ message: "This material is no longer offered for new prints.", errors: { sku: "This material is retired — choose Fine Art Paper or Canvas." } });
      }
      // One SKU per print — reject a duplicate material+size option (a print SKU is 1:1 with a physical
      // Prodigi product, so a second row for the same SKU is always a mistake). Existing rows untouched.
      if (input.sku && (await printHasVariantForSku(printId, input.sku))) {
        return res.status(409).json({ message: "This size is already an option for this print.", errors: { sku: "This size is already added — edit the existing option instead of adding a duplicate." } });
      }
      const validated = validateVariantSave(input, master);
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
      // Enable/price/frame updates must judge eligibility with THIS variant's already-confirmed crop.
      const validated = validateVariantSave(readVariantInput(req.body), master, cropFromRow(existing));
      if (!validated.ok) return res.status(400).json({ message: "Please check the variant", errors: validated.errors });
      const updated = await updateVariant(id, validated.row!);
      return res.json({ variant: updated });
    } catch {
      return res.status(500).json({ message: "Could not update variant." });
    }
  });

  // ── SET / CLEAR a variant's crop (from the crop editor). The crop must be a valid rectangle inside
  //    the master AND match the SKU's print-area aspect ratio (so nothing is ever stretched/distorted).
  //    Persisting re-derives eligibility from the CROPPED pixels. The editor opens with a suggested
  //    centered crop (computed client-side via shared printCrop), but the artist must confirm to save. ──
  app.put("/api/admin/prints/variants/:id/crop", requireAdminAuth, async (req, res) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      if (!Number.isInteger(id)) return res.status(400).json({ message: "Bad variant id" });
      const existing = await getVariant(id);
      if (!existing) return res.status(404).json({ message: "Variant not found" });
      const master = await getPrintMaster(existing.print_id);
      const product = getProdigiProduct(existing.prodigi_sku);
      if (!product) return res.status(400).json({ message: "This size is not a verified Prodigi SKU." });

      const body = (req.body ?? {}) as Record<string, unknown>;
      const raw = body.crop as unknown;
      // Clear the crop (raw === null) → back to "crop required" for a mismatched size.
      if (raw === null) {
        const updated = await setVariantCrop(id, null, master);
        return res.json({ variant: updated });
      }
      const c = raw as Record<string, unknown> | undefined;
      const crop: NormalizedCrop = { x: Number(c?.x), y: Number(c?.y), w: Number(c?.w), h: Number(c?.h) };
      if (!isValidCropShape(crop)) return res.status(400).json({ message: "Invalid crop rectangle." });
      if (!master || master.widthPx == null || master.heightPx == null) {
        return res.status(409).json({ message: "Upload a print-ready master before cropping." });
      }
      // The crop MUST match the SKU aspect ratio — the editor enforces this; the server re-checks so a
      // crafted request can never store a stretching crop.
      if (!cropFitsSku(master.widthPx, master.heightPx, crop, product)) {
        return res.status(400).json({ message: "The crop does not match this size's aspect ratio." });
      }
      const updated = await setVariantCrop(id, crop, master);
      // Re-derive so the client gets the live eligibility/reason after cropping.
      const d = deriveVariantFields(existing.prodigi_sku, master, crop);
      return res.json({
        variant: updated,
        eligible: d.ok ? d.fields.eligible : false,
        effectiveDpi: d.ok ? d.fields.effectiveDpi : null,
        reason: d.ok ? d.fields.reason : null,
        reasonCode: d.ok ? d.fields.reasonCode : "unverified-sku",
      });
    } catch {
      return res.status(500).json({ message: "Could not save the crop." });
    }
  });

  // A DOWNSCALED, admin-only JPEG of the master for the crop editor to display. NOT the full master, NOT
  // public, NOT token-gated (admin session only). The permanent master is only read, never modified.
  app.get("/api/admin/prints/:printId/master-preview", requireAdminAuth, async (req, res) => {
    try {
      const printId = Number.parseInt(String(req.params.printId), 10);
      if (!Number.isInteger(printId)) return res.status(400).end();
      const ref = await getPrintMasterRef(printId);
      if (!ref?.assetKey) return res.status(404).end();
      let stream;
      try { stream = await readMasterStream(ref.assetKey); } catch { return res.status(502).end(); }
      if (!stream) return res.status(410).end();
      res.set("Cache-Control", "private, max-age=300");
      res.type("image/jpeg");
      // Downscale the (possibly huge) master to a web-displayable preview. limitInputPixels:false so a
      // real 300-DPI master is accepted; the OUTPUT is a small JPEG.
      const pipeline = sharp({ limitInputPixels: false }).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 });
      pipeline.on("error", () => { if (!res.headersSent) res.status(500).end(); });
      return stream.pipe(pipeline).pipe(res);
    } catch {
      return res.status(500).end();
    }
  });

  // ── ADMIN cost/margin estimate for a variant to a destination. Uses the SAME Prodigi /quotes call as
  //    checkout: costSummary.items = the REAL production cost, costSummary.shipping = shipping — both
  //    destination-dependent. Never fabricated: if Prodigi can't quote, returns available:false. This is
  //    ADMIN-ONLY (production cost + margin are internal, never on a public route). Gross margin =
  //    selling price − production cost (BEFORE payment fees, tax and FX — not net profit). ──
  app.post("/api/admin/prints/variants/:id/cost-estimate", requireAdminAuth, async (req, res) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      if (!Number.isInteger(id)) return res.status(400).json({ message: "Bad variant id" });
      const variant = await getVariant(id);
      if (!variant) return res.status(404).json({ message: "Variant not found" });
      const country = String((req.body ?? {}).country ?? "").trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(country)) return res.status(400).json({ message: "A 2-letter destination country is required." });

      // Only the frame attribute is order-specific; the catalogue-required canvas `wrap` is injected
      // canonically by buildPrintQuoteRequest from the SKU registry, so the admin quote reflects the REAL
      // orderable product (a canvas SKU is quoted WITH its wrap; without it Prodigi 400s the quote).
      const attributes: Record<string, string> = {};
      if (variant.framed && variant.frame_colour) attributes.frameColour = variant.frame_colour;
      const quote = await quotePrintShipping({
        prodigiSku: variant.prodigi_sku, copies: 1, country, currency: variant.currency,
        ...(Object.keys(attributes).length ? { attributes } : {}),
      });
      res.set("Cache-Control", "no-store");
      // ADMIN-ONLY diagnostics: distinguish not-configured / invalid-SKU / destination-unsupported /
      // quote-unavailable / auth / api-error, and report which Prodigi environment answered. This route
      // is behind requireAdminAuth and never leaks the key (the diagnostic strings are key-free).
      if (!quote.ok) {
        const diag = adminQuoteDiagnostic(quote);
        return res.json({ available: false, reason: quote.reason, code: diag.code, detail: diag.message, mode: prodigiMode() });
      }

      const productionMinor = quote.itemsMinor;             // Prodigi production cost (may be null)
      const sellingMinor = variant.retail_minor;
      const grossMarginMinor = sellingMinor != null && productionMinor != null ? sellingMinor - productionMinor : null;
      return res.json({
        available: true,
        country,
        mode: prodigiMode(),
        currency: quote.currency,
        method: quote.method,
        productionMinor,
        shippingMinor: quote.shippingMinor,
        prodigiTotalMinor: (productionMinor ?? 0) + quote.shippingMinor,
        sellingMinor,
        grossMarginMinor,        // gross margin on the product (selling − production), before fees/tax/FX
      });
    } catch {
      return res.status(500).json({ available: false, reason: "error" });
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
