/**
 * MASTER OBJECT STORE — where the PERMANENT high-resolution print-master BYTES live.
 *
 * WHY THIS EXISTS: PR #71 put masters on a local disk (`/var/data/print-masters`). That is correct on
 * a host with a persistent disk (Render), but ArtistPortfolio production is a **Replit Autoscale
 * deployment** whose filesystem is EPHEMERAL — reset on every Publish/redeploy, per-instance, never
 * shared. A master written there vanishes on the next deploy while the DB still says `ready`, so a sold
 * print becomes un-fulfillable. This module moves the permanent bytes to **Replit Object Storage**
 * (persistent, first-party, survives restarts/redeploys/instances). The DB keeps only the reference +
 * metadata; the bytes are never in Postgres and never a public URL.
 *
 * OWNERSHIP is unchanged from PR #71: keys are PRINT-owned (`prints/<printId>/master-<rand>.<ext>`), so
 * two prints of the same artwork have independent masters and replacing one never touches the other.
 *
 * BACKENDS:
 *   - `replit-object-storage` — production and any Replit env with Object Storage configured.
 *   - `local-filesystem`      — DEV/TEST ONLY. Explicitly forbidden as a *permanent* store in
 *                               production: production NEVER silently falls back to a local disk.
 */
import { createReadStream, existsSync } from "fs";
import { mkdir, copyFile, unlink, readdir } from "fs/promises";
import os from "os";
import path from "path";
import type { Readable } from "stream";
import { Client } from "@replit/object-storage";

/** A storage-layer failure (upload/download/delete could not be completed). Surfaced as 5xx, not a
 *  silent local write. Distinct from a client-caused validation error. */
export class MasterStorageError extends Error {
  constructor(message: string) { super(message); this.name = "MasterStorageError"; }
}
/** A misconfiguration that must fail LOUD — e.g. asking for the local store in production. */
export class MasterStorageConfigError extends MasterStorageError {
  constructor(message: string) { super(message); this.name = "MasterStorageConfigError"; }
}

/** The byte layer. The DB remains the source of reference; this only moves bytes in and out. */
export interface MasterStore {
  readonly backendName: "replit-object-storage" | "local-filesystem";
  /** Upload the validated staged file to `key`. Throws MasterStorageError on failure (old master, if
   *  any under a different key, is untouched — this writes a NEW key). */
  put(key: string, srcFilename: string, contentType: string): Promise<void>;
  /** A readable stream for the object, or `null` if it is genuinely absent (→ route 410). Throws on a
   *  storage error (→ route 5xx). */
  readStream(key: string): Promise<Readable | null>;
  exists(key: string): Promise<boolean>;
  /** Delete one object. A no-op if already absent. */
  remove(key: string): Promise<void>;
  /** Delete every object under a prefix (used to purge a print's masters on removal). Returns count. */
  removeByPrefix(prefix: string): Promise<number>;
  listKeys(prefix: string): Promise<string[]>;
}

// ── Replit Object Storage backend ──────────────────────────────────────────────────────────────────
class ReplitObjectStore implements MasterStore {
  readonly backendName = "replit-object-storage" as const;
  private _client: Client | null = null;
  constructor(private bucketId?: string) {}
  /** LAZY: the Replit client is created on first use, not at construction. Constructing it eagerly
   *  fires a background bucket-discovery fetch to the sidecar, which off-Replit rejects and leaks an
   *  unhandled rejection. Deferring it also means selecting this backend never touches the network —
   *  the first real operation is what reaches the sidecar (and fails LOUD if Object Storage is absent). */
  private client(): Client {
    if (!this._client) this._client = this.bucketId ? new Client({ bucketId: this.bucketId }) : new Client();
    return this._client;
  }
  async put(key: string, srcFilename: string, _contentType: string): Promise<void> {
    // compress:false → the stored object is byte-identical to the uploaded master, so downloads (and
    // the checksum the DB recorded) match exactly. Masters are already-compressed JPEG/PNG/TIFF.
    let r;
    try { r = await this.client().uploadFromFilename(key, srcFilename, { compress: false }); }
    catch (e) { throw new MasterStorageError(`Object Storage upload failed: ${msg(e)}`); }
    if (!r.ok) throw new MasterStorageError(`Object Storage upload failed: ${r.error.message}`);
  }
  async readStream(key: string): Promise<Readable | null> {
    // Existence first so a missing object is a clean 410 rather than a stream that errors mid-flight.
    if (!(await this.exists(key))) return null;
    return this.client().downloadAsStream(key);
  }
  async exists(key: string): Promise<boolean> {
    let r;
    try { r = await this.client().exists(key); }
    catch (e) { throw new MasterStorageError(`Object Storage exists() failed: ${msg(e)}`); }
    if (!r.ok) throw new MasterStorageError(`Object Storage exists() failed: ${r.error.message}`);
    return r.value;
  }
  async remove(key: string): Promise<void> {
    let r;
    try { r = await this.client().delete(key, { ignoreNotFound: true }); }
    catch (e) { throw new MasterStorageError(`Object Storage delete failed: ${msg(e)}`); }
    if (!r.ok) throw new MasterStorageError(`Object Storage delete failed: ${r.error.message}`);
  }
  async removeByPrefix(prefix: string): Promise<number> {
    const keys = await this.listKeys(prefix);
    for (const k of keys) await this.remove(k);
    return keys.length;
  }
  async listKeys(prefix: string): Promise<string[]> {
    let r;
    try { r = await this.client().list({ prefix }); }
    catch (e) { throw new MasterStorageError(`Object Storage list failed: ${msg(e)}`); }
    if (!r.ok) throw new MasterStorageError(`Object Storage list failed: ${r.error.message}`);
    return r.value.map((o) => o.name);
  }
}

// ── Local filesystem backend — DEV/TEST ONLY ─────────────────────────────────────────────────────────
class LocalMasterStore implements MasterStore {
  readonly backendName = "local-filesystem" as const;
  private root: string;
  constructor(root?: string) {
    this.root = root || process.env.MASTER_LOCAL_DIR?.trim() || path.join(os.tmpdir(), "print-masters-local");
  }
  private pathFor(key: string): string | null {
    const p = path.resolve(this.root, key);
    const base = path.resolve(this.root);
    // Guard against a crafted key escaping the store root.
    return p === base || p.startsWith(base + path.sep) ? p : null;
  }
  async put(key: string, srcFilename: string, _contentType: string): Promise<void> {
    const dest = this.pathFor(key);
    if (!dest) throw new MasterStorageError(`Unsafe object key: ${key}`);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(srcFilename, dest);
  }
  async readStream(key: string): Promise<Readable | null> {
    const p = this.pathFor(key);
    if (!p || !existsSync(p)) return null;
    return createReadStream(p);
  }
  async exists(key: string): Promise<boolean> {
    const p = this.pathFor(key);
    return !!p && existsSync(p);
  }
  async remove(key: string): Promise<void> {
    const p = this.pathFor(key);
    if (p) await unlink(p).catch(() => {});
  }
  async removeByPrefix(prefix: string): Promise<number> {
    const keys = await this.listKeys(prefix);
    for (const k of keys) await this.remove(k);
    return keys.length;
  }
  async listKeys(prefix: string): Promise<string[]> {
    const dir = this.pathFor(prefix);
    if (!dir) return [];
    try {
      const names = await readdir(dir);
      return names.map((n) => path.posix.join(prefix.replace(/\/+$/, ""), n));
    } catch {
      return [];
    }
  }
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ── Backend selection ────────────────────────────────────────────────────────────────────────────────
let cached: MasterStore | null = null;
let override: MasterStore | null = null; // TEST-ONLY injection

const isProd = () => process.env.NODE_ENV === "production";
/** Object Storage is "configured" when an explicit bucket is named or Replit injected a default one. */
const replitConfigured = () =>
  !!(process.env.PRINT_MASTERS_BUCKET_ID?.trim() || process.env.REPLIT_DEFAULT_BUCKET_URL?.trim());

function deriveStore(): MasterStore {
  const explicit = (process.env.MASTER_STORAGE_BACKEND || "").trim().toLowerCase();
  const bucketId = process.env.PRINT_MASTERS_BUCKET_ID?.trim() || undefined;

  if (explicit === "local") {
    // Never a permanent local store in production. Fail LOUD instead of silently losing masters.
    if (isProd()) {
      throw new MasterStorageConfigError(
        "MASTER_STORAGE_BACKEND=local is forbidden in production — permanent masters must live in Replit Object Storage.",
      );
    }
    return new LocalMasterStore();
  }
  if (explicit === "replit") return new ReplitObjectStore(bucketId);

  // Auto: production is ALWAYS Object Storage (loud failure at first op if unconfigured). Dev uses
  // Object Storage when configured, otherwise the local dev/test store.
  if (isProd()) return new ReplitObjectStore(bucketId);
  if (replitConfigured()) return new ReplitObjectStore(bucketId);
  return new LocalMasterStore();
}

/** The active byte store (memoized). Throws MasterStorageConfigError on a forbidden configuration. */
export function getMasterStore(): MasterStore {
  if (override) return override;
  if (!cached) cached = deriveStore();
  return cached;
}
/** Re-evaluate the backend from the current environment (used after env changes, e.g. in tests). */
export function resetMasterStore(): void { cached = null; }
/** TEST ONLY — inject a store (or `null` to clear). Never called by production code. */
export function __setMasterStoreForTest(store: MasterStore | null): void { override = store; cached = null; }

export function masterStorageBackendName(): string {
  try { return getMasterStore().backendName; } catch (e) { return `unavailable (${msg(e)})`; }
}

/** Boot probe: confirm the byte store answers. Cheap (one metadata round-trip), never downloads bytes.
 *  Returns a status; the caller decides how loudly to complain (FATAL in production). */
export async function assertMasterStorageReady(): Promise<{ ok: boolean; backend: string; detail?: string }> {
  let store: MasterStore;
  try { store = getMasterStore(); }
  catch (e) { return { ok: false, backend: "misconfigured", detail: msg(e) }; }
  try {
    await store.exists("prints/__readiness_probe__/none");
    return { ok: true, backend: store.backendName };
  } catch (e) {
    return { ok: false, backend: store.backendName, detail: msg(e) };
  }
}

export { ReplitObjectStore, LocalMasterStore };
