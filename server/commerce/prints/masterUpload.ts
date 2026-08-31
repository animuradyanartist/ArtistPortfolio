/**
 * CHUNKED MASTER UPLOAD — how a 100–500 MB production master reaches Object Storage on Replit Autoscale.
 *
 * THE PROBLEM: Replit's ingress proxy (Google Frontend) rejects a large request BODY with a 413 before
 * it ever reaches Express — a per-request size cap that is upstream and NOT configurable by us. A single
 * multipart POST of a 300-DPI master therefore fails at the proxy, not in our route. (The app→Object
 * Storage leg is egress and is NOT subject to that inbound cap — only the browser→app leg is.)
 *
 * THE FIX: the browser splits the master into small chunks (each well under the proxy cap) and sends them
 * as ordinary small requests. The server appends each chunk to Object Storage, then on completion
 * reassembles them into one temp file, validates the REAL bytes (sharp) exactly as before, and commits
 * the final master object. Nothing large ever crosses the ingress in one request.
 *
 * WHY CHUNKS GO TO OBJECT STORAGE, NOT A LOCAL FILE: Autoscale is multi-instance — consecutive chunk
 * requests may land on different instances, which do NOT share a local disk. Staging the chunks as
 * Object Storage objects (keyed by uploadId) makes the flow stateless across instances: any instance can
 * accept any chunk and any instance can complete the upload. Chunk objects live under a hidden
 * per-print, per-session prefix and are deleted on completion or abort; they are never the master and
 * never public.
 */
import { randomBytes } from "crypto";
import { createWriteStream } from "fs";
import path from "path";
import type { Readable } from "stream";
import { getMasterStore } from "./masterObjectStore";
import { ensureMasterDirs, stagingDir, MasterValidationError } from "./masterStorage";

/** Default chunk size the client is told to use. Deliberately small so a chunk request clears the
 *  Replit ingress cap with wide margin (well under a 10–32 MB proxy limit). Configurable if the
 *  platform limit is ever confirmed higher. */
export const UPLOAD_CHUNK_BYTES = Math.max(
  1 * 1024 * 1024,
  Number(process.env.MASTER_UPLOAD_CHUNK_BYTES) || 8 * 1024 * 1024,
);

/** A cap on the number of chunks (defence against an unbounded session). 500 MB / 8 MB ≈ 64; allow slack. */
const MAX_CHUNKS = 4096;

/** Hidden per-print, per-session prefix for in-flight chunk objects (never the master, never public). */
function uploadPrefix(printId: number, uploadId: string): string {
  return `prints/${printId}/.uploads/${uploadId}/`;
}
/** Zero-padded so a lexical object listing sorts back into upload order. */
function chunkKey(printId: number, uploadId: string, index: number): string {
  return `${uploadPrefix(printId, uploadId)}${String(index).padStart(6, "0")}`;
}

/** A session id is unguessable and scoped by the caller to one printId. No server-side state is kept —
 *  the id lives only in the object keys, so any Autoscale instance can service any request. */
export function initUpload(): { uploadId: string; chunkBytes: number; maxChunks: number } {
  return { uploadId: randomBytes(12).toString("hex"), chunkBytes: UPLOAD_CHUNK_BYTES, maxChunks: MAX_CHUNKS };
}

/** Append one chunk. `index` is 0-based. Rejects a chunk larger than the advertised size (+slack) or an
 *  out-of-range index. Throws MasterStorageError on a storage failure. */
export async function putChunk(printId: number, uploadId: string, index: number, buf: Buffer): Promise<void> {
  if (!/^[0-9a-f]{24}$/.test(uploadId)) throw new MasterValidationError("Invalid upload session.");
  if (!Number.isInteger(index) || index < 0 || index >= MAX_CHUNKS) throw new MasterValidationError("Invalid chunk index.");
  if (buf.length > UPLOAD_CHUNK_BYTES + 4096) throw new MasterValidationError("Chunk exceeds the maximum chunk size.");
  await getMasterStore().putBytes(chunkKey(printId, uploadId, index), buf, "application/octet-stream");
}

/** Delete every chunk object for a session (on completion or abort). Best-effort. */
export async function discardUpload(printId: number, uploadId: string): Promise<void> {
  if (!/^[0-9a-f]{24}$/.test(uploadId)) return;
  await getMasterStore().removeByPrefix(uploadPrefix(printId, uploadId)).catch(() => {});
}

/**
 * Reassemble the session's chunks, IN ORDER, into a single local staging temp file and return its path.
 * The caller then validates + commits it via the normal single-file path (sharp validation, versioned
 * final key, DB commit, old-object cleanup). Throws MasterValidationError if no chunks exist or the
 * received count does not match `expectedChunks` (a missing/duplicate chunk must never be assembled into
 * a silently-truncated master).
 */
export async function reassembleUpload(
  printId: number, uploadId: string, expectedChunks?: number,
): Promise<string> {
  if (!/^[0-9a-f]{24}$/.test(uploadId)) throw new MasterValidationError("Invalid upload session.");
  const store = getMasterStore();
  const keys = (await store.listKeys(uploadPrefix(printId, uploadId))).sort();
  if (keys.length === 0) throw new MasterValidationError("No upload data was received.");
  if (expectedChunks != null && keys.length !== expectedChunks) {
    throw new MasterValidationError(`Upload incomplete: expected ${expectedChunks} chunks but found ${keys.length}.`);
  }

  await ensureMasterDirs();
  const stagedPath = path.join(stagingDir(), `assembled-${uploadId}-${randomBytes(6).toString("hex")}`);
  const out = createWriteStream(stagedPath);
  let outError: unknown = null;
  out.on("error", (e) => { outError = e; }); // attached ONCE (not per chunk) to avoid a listener leak
  try {
    for (const key of keys) {
      if (outError) throw outError;
      const rs = await store.readStream(key);
      if (!rs) throw new MasterValidationError("An upload chunk went missing during assembly.");
      await appendStream(rs, out); // ordered, backpressure-aware; does NOT end `out`
    }
    if (outError) throw outError;
  } finally {
    out.end();
    await new Promise<void>((resolve) => out.on("close", () => resolve()));
  }
  return stagedPath;
}

/** Pipe one readable fully into a writable WITHOUT ending the writable, honouring backpressure. The
 *  writable's own 'error' is handled once by the caller (reassembleUpload), not here. */
function appendStream(rs: Readable, out: NodeJS.WritableStream): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    rs.on("data", (d: Buffer) => {
      if (!out.write(d)) { rs.pause(); out.once("drain", () => rs.resume()); }
    });
    rs.on("end", () => resolve());
    rs.on("error", reject);
  });
}
