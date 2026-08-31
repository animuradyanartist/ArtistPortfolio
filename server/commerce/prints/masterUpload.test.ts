import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, readFileSync } from "fs";
import { createHash, randomBytes } from "crypto";
import path from "path";
import os from "os";
import sharp from "sharp";

// Force the LOCAL dev/test byte store + a small chunk size so a modest buffer splits into many chunks.
const LOCAL = mkdtempSync(path.join(os.tmpdir(), "pmasters-up-store-"));
const STAGE = mkdtempSync(path.join(os.tmpdir(), "pmasters-up-stage-"));
process.env.NODE_ENV = "test";
process.env.MASTER_STORAGE_BACKEND = "local";
process.env.MASTER_LOCAL_DIR = LOCAL;
process.env.MASTER_STAGING_DIR = STAGE;
process.env.MASTER_UPLOAD_CHUNK_BYTES = String(1024 * 1024); // 1 MB chunks for the test

let U: typeof import("./masterUpload");
let S: typeof import("./masterStorage");
let OS_: typeof import("./masterObjectStore");
beforeAll(async () => {
  OS_ = await import("./masterObjectStore");
  OS_.resetMasterStore();
  U = await import("./masterUpload");
  S = await import("./masterStorage");
});

const md5 = (b: Buffer) => createHash("md5").update(b).digest("hex");
const putAll = async (printId: number, uploadId: string, data: Buffer, chunk: number) => {
  const n = Math.ceil(data.length / chunk);
  for (let i = 0; i < n; i++) await U.putChunk(printId, uploadId, i, data.subarray(i * chunk, (i + 1) * chunk));
  return n;
};

describe("chunked master upload — Object-Storage staging + reassembly", () => {
  it("reassembles many chunks back into the exact original bytes", async () => {
    const data = randomBytes(20 * 1024 * 1024 + 12345); // ~20 MB, not a chunk multiple
    const { uploadId, chunkBytes } = U.initUpload();
    expect(chunkBytes).toBe(1024 * 1024);
    const n = await putAll(700, uploadId, data, chunkBytes);
    expect(n).toBe(Math.ceil(data.length / chunkBytes));
    const staged = await U.reassembleUpload(700, uploadId, n);
    expect(md5(readFileSync(staged))).toBe(md5(data)); // byte-for-byte
  });

  it("rejects when the received chunk count does not match expected (missing chunk)", async () => {
    const { uploadId, chunkBytes } = U.initUpload();
    await putAll(701, uploadId, randomBytes(3 * 1024 * 1024), chunkBytes); // 3 chunks
    await expect(U.reassembleUpload(701, uploadId, 4)).rejects.toBeInstanceOf(S.MasterValidationError);
  });

  it("rejects an oversize chunk and an empty session", async () => {
    const { uploadId } = U.initUpload();
    await expect(U.putChunk(702, uploadId, 0, randomBytes(U.UPLOAD_CHUNK_BYTES + 1 * 1024 * 1024)))
      .rejects.toBeInstanceOf(S.MasterValidationError);
    await expect(U.reassembleUpload(702, U.initUpload().uploadId)).rejects.toThrow(/no upload data/i);
  });

  it("discardUpload purges the staged chunk objects", async () => {
    const { uploadId, chunkBytes } = U.initUpload();
    await putAll(703, uploadId, randomBytes(5 * 1024 * 1024), chunkBytes);
    await U.discardUpload(703, uploadId);
    // A fresh reassemble now finds nothing.
    await expect(U.reassembleUpload(703, uploadId)).rejects.toThrow(/no upload data/i);
  });

  it("a reassembled VALID image validates + stores byte-for-byte through the normal path", async () => {
    const img = await sharp({ create: { width: 4000, height: 5000, channels: 3, background: { r: 7, g: 8, b: 9 } } }).jpeg().toBuffer();
    const { uploadId, chunkBytes } = U.initUpload();
    const n = await putAll(704, uploadId, img, chunkBytes);
    const staged = await U.reassembleUpload(704, uploadId, n);
    const stored = await S.storeMasterFromStaging(704, staged, "big.jpg", "application/octet-stream");
    expect(stored.assetKey).toMatch(/^prints\/704\/master-[0-9a-f]+\.jpg$/);
    expect(stored.checksumMd5).toBe(md5(img));
    expect([stored.widthPx, stored.heightPx]).toEqual([4000, 5000]);
  });
});
