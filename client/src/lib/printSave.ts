/**
 * PRINT SAVE ORCHESTRATION — builds the ordinary print create/update request and sequences the master
 * upload AFTER the print exists. The key invariant enforced (and tested) here:
 *
 *   THE `POST/PUT /api/prints` REQUEST NEVER CARRIES THE HIGH-RESOLUTION MASTER BYTES.
 *
 * The master is a separate, chunked upload (`printMasterUpload.ts`). This module is framework-free and
 * takes injected dependencies so the sequencing can be unit-tested without React or a network.
 */
import type { MasterUploadResult } from "./printMasterUpload";

export interface PrintSaveFields {
  title: string;
  slug?: string;
  description: string;
  /** Public storefront images (already prepared — small, base64). NEVER the production master. */
  images: string[];
  artworkId?: number | null;
  status: string;
  availableSizes: string;
  preferredMaterial: string;
}

/** The exact body sent to `POST/PUT /api/prints`. Metadata + small public images only — no master. */
export function buildPrintSaveBody(f: PrintSaveFields): Record<string, unknown> {
  return {
    title: f.title.trim(),
    slug: f.slug?.trim() || undefined,
    description: f.description.trim(),
    images: f.images.length ? f.images : [],
    artworkId: f.artworkId ?? undefined,
    status: f.status,
    availableSizes: f.availableSizes,
    preferredMaterial: f.preferredMaterial,
  };
}

export interface CreatePrintDeps {
  /** Sends the small metadata request; returns the created print JSON (must include `id`). */
  createPrint: (body: Record<string, unknown>) => Promise<{ id: number }>;
  /** Uploads the master in chunks once the print id exists. */
  uploadMaster: (printId: number, file: Blob & { name?: string }) => Promise<MasterUploadResult>;
}

export interface CreatePrintOutcome {
  printId: number;
  /** The body actually sent to /api/prints — inspected by tests to prove it holds no master bytes. */
  sentBody: Record<string, unknown>;
  masterAttempted: boolean;
  masterUploaded: boolean;
  masterMessage?: string;
}

/**
 * CREATE flow: send the small print metadata FIRST, then — only once a printId exists — upload the
 * locally-held master in chunks. The master file is passed straight to `uploadMaster`; it is never put
 * into the metadata body. `masterUploaded` is true only when the chunked upload actually succeeded, so a
 * failed/partial upload cannot falsely mark the master present.
 */
export async function createPrintThenUploadMaster(
  fields: PrintSaveFields,
  masterFile: (Blob & { name?: string }) | null,
  deps: CreatePrintDeps,
): Promise<CreatePrintOutcome> {
  const sentBody = buildPrintSaveBody(fields);
  const created = await deps.createPrint(sentBody);
  const out: CreatePrintOutcome = { printId: created.id, sentBody, masterAttempted: false, masterUploaded: false };
  if (masterFile) {
    out.masterAttempted = true;
    const r = await deps.uploadMaster(created.id, masterFile);
    out.masterUploaded = r.ok;
    if (!r.ok) out.masterMessage = r.message;
  }
  return out;
}
