import { describe, it, expect, afterEach } from "vitest";
import * as OS from "./masterObjectStore";

// These tests probe BACKEND SELECTION — the guarantee that production never silently uses a local
// permanent disk. They restore only the env keys they touch.
const KEYS = ["NODE_ENV", "MASTER_STORAGE_BACKEND", "PRINT_MASTERS_BUCKET_ID", "REPLIT_DEFAULT_BUCKET_URL"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];

function setEnv(env: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
  for (const k of KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
  OS.resetMasterStore();
}

afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  OS.__setMasterStoreForTest(null);
  OS.resetMasterStore();
});

describe("master byte-store backend selection", () => {
  it("dev + no bucket → local filesystem (dev/test convenience)", () => {
    setEnv({ NODE_ENV: "development" });
    expect(OS.getMasterStore().backendName).toBe("local-filesystem");
  });

  it("dev + configured bucket → Replit Object Storage", () => {
    setEnv({ NODE_ENV: "development", PRINT_MASTERS_BUCKET_ID: "bkt-abc" });
    expect(OS.getMasterStore().backendName).toBe("replit-object-storage");
  });

  it("production (auto) → Replit Object Storage, NEVER local", () => {
    setEnv({ NODE_ENV: "production" });
    expect(OS.getMasterStore().backendName).toBe("replit-object-storage");
  });

  it("production + explicit local → THROWS (no silent local permanent storage)", () => {
    setEnv({ NODE_ENV: "production", MASTER_STORAGE_BACKEND: "local" });
    expect(() => OS.getMasterStore()).toThrow(/forbidden in production/i);
  });

  it("production selects Object Storage even with no bucket configured — the byte layer is NEVER a local disk", () => {
    // The core fail-loud guarantee, asserted WITHOUT touching the network: in production the subsystem
    // is the Object Storage backend (whose ops reject if unconfigured), never the local-filesystem store.
    setEnv({ NODE_ENV: "production" });
    delete process.env.PRINT_MASTERS_BUCKET_ID;
    delete process.env.REPLIT_DEFAULT_BUCKET_URL;
    OS.resetMasterStore();
    expect(OS.getMasterStore().backendName).toBe("replit-object-storage");
    expect(OS.getMasterStore().backendName).not.toBe("local-filesystem");
  });

  it("assertMasterStorageReady reports not-ready (with detail) when the byte store errors", async () => {
    // Inject a store whose probe rejects — proves the readiness path surfaces a loud not-ready result
    // (used at boot to emit [master-storage][FATAL] in production) without hitting the network.
    OS.__setMasterStoreForTest({
      backendName: "replit-object-storage",
      put: async () => { throw new OS.MasterStorageError("unreachable"); },
      readStream: async () => null,
      exists: async () => { throw new OS.MasterStorageError("unreachable"); },
      remove: async () => {},
      removeByPrefix: async () => 0,
      listKeys: async () => [],
    });
    const health = await OS.assertMasterStorageReady();
    expect(health.ok).toBe(false);
    expect(health.backend).toBe("replit-object-storage");
    expect(typeof health.detail).toBe("string");
  });
});
