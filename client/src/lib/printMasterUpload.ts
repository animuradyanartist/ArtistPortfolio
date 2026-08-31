/**
 * CLIENT-SIDE CHUNKED MASTER UPLOAD — the ONLY path a high-resolution print master reaches the server.
 *
 * The master bytes must NEVER travel in the ordinary `POST/PUT /api/prints` request: Replit's ingress
 * proxy 413s a large request body before it reaches Express. Instead the file is split into small
 * chunks (each well under the ingress cap) and streamed to the chunked-upload endpoints from PR #73:
 *   init → N× chunk (raw octet-stream, ≤ chunkBytes) → complete.
 *
 * This module is intentionally framework-free (no React, no DOM) and takes an injectable `fetchImpl` so
 * the whole sequence — ordering, per-chunk size, failure handling — is unit-testable without a browser.
 */

/** Fallback chunk size if the server does not advertise one. Matches the server default (8 MB), safely
 *  under any plausible Replit ingress cap. The server is authoritative via `init`. */
export const MASTER_UPLOAD_CHUNK_FALLBACK = 8 * 1024 * 1024;

export interface MasterUploadOk { ok: true; master: any; eligibleSizeCount: number; }
export interface MasterUploadErr { ok: false; message: string; stage: "init" | "chunk" | "complete"; }
export type MasterUploadResult = MasterUploadOk | MasterUploadErr;

export interface UploadMasterOpts {
  onProgress?: (pct: number) => void;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

type FileLike = Blob & { name?: string };

/**
 * Upload `file` to a print as its master, in chunks. Returns a typed result; the caller decides how to
 * surface it (toast, readiness refresh). A failed chunk aborts the session (no orphan chunk objects are
 * left) and returns `ok:false` — it NEVER falsely reports success. A failed `complete` also returns
 * `ok:false`, so readiness is not marked green unless the server actually committed the master.
 */
export async function uploadMasterInChunks(
  printId: number,
  file: FileLike,
  opts: UploadMasterOpts = {},
): Promise<MasterUploadResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const base = `/api/admin/prints/masters/${printId}/upload`;

  // 1) init
  const initRes = await doFetch(`${base}/init`, { method: "POST", credentials: "include" });
  const init = await initRes.json().catch(() => ({} as any));
  if (!initRes.ok) return { ok: false, stage: "init", message: init?.message || "Could not start the upload." };
  const chunkBytes: number = Number(init?.chunkBytes) > 0 ? Number(init.chunkBytes) : MASTER_UPLOAD_CHUNK_FALLBACK;
  const uploadId: string = String(init?.uploadId ?? "");
  const total = Math.max(1, Math.ceil(file.size / chunkBytes));

  // 2) chunks — each request body is a slice of AT MOST chunkBytes, so no single request is large.
  for (let i = 0; i < total; i++) {
    const slice = file.slice(i * chunkBytes, Math.min(file.size, (i + 1) * chunkBytes));
    const cr = await doFetch(`${base}/${uploadId}/chunk?index=${i}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/octet-stream" },
      body: slice,
    });
    if (!cr.ok) {
      const cb = await cr.json().catch(() => ({} as any));
      // Best-effort abort so half-uploaded chunk objects never linger in storage.
      void doFetch(`${base}/${uploadId}/abort`, { method: "POST", credentials: "include" }).catch(() => {});
      return { ok: false, stage: "chunk", message: cb?.message || `Chunk ${i + 1} of ${total} failed.` };
    }
    opts.onProgress?.(Math.round(((i + 1) / total) * 100));
  }

  // 3) complete — reassemble + validate + commit on the server.
  const doneRes = await doFetch(`${base}/${uploadId}/complete`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ originalName: file.name || "master", totalChunks: total }),
  });
  const body = await doneRes.json().catch(() => ({} as any));
  if (!doneRes.ok) return { ok: false, stage: "complete", message: body?.message || "Could not save the master." };
  return { ok: true, master: body?.master, eligibleSizeCount: Number(body?.eligibleSizeCount) || 0 };
}
