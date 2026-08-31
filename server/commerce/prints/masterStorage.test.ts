import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "fs";
import { writeFile } from "fs/promises";
import { createHash } from "crypto";
import path from "path";
import os from "os";
import sharp from "sharp";
import type { Readable } from "stream";

// Force the LOCAL dev/test byte store at throwaway dirs BEFORE importing the modules. This exercises
// the exact same code paths as production (validate → put → exists → readStream → remove); only the
// backend differs. NODE_ENV is pinned non-production so the explicit local backend is permitted.
const LOCAL = mkdtempSync(path.join(os.tmpdir(), "pmasters-store-"));
const STAGE = mkdtempSync(path.join(os.tmpdir(), "pmasters-stage-"));
process.env.NODE_ENV = "test";
process.env.MASTER_STORAGE_BACKEND = "local";
process.env.MASTER_LOCAL_DIR = LOCAL;
process.env.MASTER_STAGING_DIR = STAGE;
process.env.MASTER_DOWNLOAD_SECRET = "unit-test-secret";

let S: typeof import("./masterStorage");
let OS_: typeof import("./masterObjectStore");
beforeAll(async () => {
  OS_ = await import("./masterObjectStore");
  OS_.resetMasterStore();
  S = await import("./masterStorage");
  await S.ensureMasterDirs();
});

const stage = async (name: string, buf: Buffer) => { const p = path.join(S.stagingDir(), name); await writeFile(p, buf); return p; };
const jpeg = (w: number, h: number, bg = { r: 1, g: 2, b: 3 }) => sharp({ create: { width: w, height: h, channels: 3, background: bg } }).jpeg().toBuffer();
const md5 = (b: Buffer) => createHash("md5").update(b).digest("hex");
const streamToBuf = (rs: Readable) => new Promise<Buffer>((res, rej) => { const c: Buffer[] = []; rs.on("data", (d) => c.push(d as Buffer)).on("end", () => res(Buffer.concat(c))).on("error", rej); });

describe("master download token — signed, expiring, per-PRINT", () => {
  it("accepts a fresh token for the right print, rejects a different print", () => {
    const t = S.signMasterToken(10, 900);
    expect(S.verifyMasterToken(t, 10)).toBe(true);
    expect(S.verifyMasterToken(t, 11)).toBe(false); // Print 10's token cannot fetch Print 11
  });
  it("rejects expired / tampered / missing tokens", () => {
    expect(S.verifyMasterToken(S.signMasterToken(10, -10), 10)).toBe(false);
    const t = S.signMasterToken(10, 900);
    expect(S.verifyMasterToken(t.slice(0, -2) + "zz", 10)).toBe(false);
    expect(S.verifyMasterToken(null, 10)).toBe(false);
    expect(S.verifyMasterToken("garbage", 10)).toBe(false);
  });
  it("signedMasterUrl points at the per-print route and verifies for that print only", () => {
    const url = S.signedMasterUrl("https://x.test/", 7, 900);
    expect(url).toMatch(/^https:\/\/x\.test\/api\/commerce\/prints\/master-file\/7\?token=/);
    const tok = new URL(url).searchParams.get("token")!;
    expect(S.verifyMasterToken(tok, 7)).toBe(true);
    expect(S.verifyMasterToken(tok, 8)).toBe(false);
  });
});

describe("storeMasterFromStaging — validation + print-owned object keys", () => {
  it("stores a valid JPEG under a print-owned object key and streams back byte-for-byte", async () => {
    const buf = await jpeg(4000, 5000);
    const s = await S.storeMasterFromStaging(100, await stage("a", buf), "orig.jpg", "image/jpeg");
    expect(s.assetKey).toMatch(/^prints\/100\/master-[0-9a-f]+\.jpg$/); // print-owned, versioned
    expect([s.widthPx, s.heightPx]).toEqual([4000, 5000]);
    expect(s.contentType).toBe("image/jpeg");
    expect(s.checksumMd5).toBe(md5(buf));
    expect(await OS_.getMasterStore().exists(s.assetKey)).toBe(true);
    const streamed = await S.readMasterStream(s.assetKey);
    expect(streamed).not.toBeNull();
    expect(md5(await streamToBuf(streamed!))).toBe(md5(buf)); // exact bytes round-trip
  });

  it("detects type from CONTENT, not filename (a PNG named .jpg stays a PNG)", async () => {
    const png = await sharp({ create: { width: 3600, height: 4800, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    const s = await S.storeMasterFromStaging(101, await stage("b", png), "actually.jpg", "image/jpeg");
    expect(s.contentType).toBe("image/png");
    expect(s.assetKey.endsWith(".png")).toBe(true);
  });

  it("REJECTS a non-image (typed error), leaving any previous master object intact", async () => {
    const good = await S.storeMasterFromStaging(102, await stage("c", await jpeg(4000, 5000)), "good.jpg", "image/jpeg");
    await expect(
      S.storeMasterFromStaging(102, await stage("d", Buffer.from("not an image")), "evil.jpg", "image/jpeg"),
    ).rejects.toBeInstanceOf(S.MasterValidationError);
    expect(await OS_.getMasterStore().exists(good.assetKey)).toBe(true); // old master preserved
  });

  it("REJECTS an unsupported format (WebP is not a print format), previous master intact", async () => {
    const good = await S.storeMasterFromStaging(103, await stage("e0", await jpeg(4000, 5000)), "ok.jpg", "image/jpeg");
    const webp = await sharp({ create: { width: 3600, height: 4800, channels: 3, background: { r: 5, g: 5, b: 5 } } }).webp().toBuffer();
    await expect(
      S.storeMasterFromStaging(103, await stage("e", webp), "x.webp", "image/webp"),
    ).rejects.toThrow(/JPEG, PNG or TIFF/i);
    expect(await OS_.getMasterStore().exists(good.assetKey)).toBe(true);
  });

  it("each upload gets a UNIQUE key (never overwrites the previous master before commit)", async () => {
    const v1 = await S.storeMasterFromStaging(104, await stage("f", await jpeg(4000, 5000)), "v1.jpg", "image/jpeg");
    const v2 = await S.storeMasterFromStaging(104, await stage("g", await jpeg(3600, 4800)), "v2.jpg", "image/jpeg");
    expect(v1.assetKey).not.toBe(v2.assetKey);
    // Both objects coexist at the storage layer; the ROUTE deletes the old one only after the DB commit.
    expect(await OS_.getMasterStore().exists(v1.assetKey)).toBe(true);
    expect(await OS_.getMasterStore().exists(v2.assetKey)).toBe(true);
  });

  it("keeps each print's master independent (replacing print 200 never touches print 201)", async () => {
    const a = await S.storeMasterFromStaging(200, await stage("h", await jpeg(4000, 5000)), "a.jpg", "image/jpeg");
    const b = await S.storeMasterFromStaging(201, await stage("i", await jpeg(3600, 4800)), "b.jpg", "image/jpeg");
    const bBytesBefore = md5(await streamToBuf((await S.readMasterStream(b.assetKey))!));
    // replace print 200's master
    await S.storeMasterFromStaging(200, await stage("j", await jpeg(5000, 6000)), "a2.jpg", "image/jpeg");
    expect(await OS_.getMasterStore().exists(b.assetKey)).toBe(true);
    expect(md5(await streamToBuf((await S.readMasterStream(b.assetKey))!))).toBe(bBytesBefore); // 201 untouched
    expect(a.assetKey.startsWith("prints/200/")).toBe(true);
    expect(b.assetKey.startsWith("prints/201/")).toBe(true);
  });

  it("removeMasterFiles purges every object under the print prefix; readStream then 410s (null)", async () => {
    const s = await S.storeMasterFromStaging(300, await stage("k", await jpeg(4000, 5000)), "z.jpg", "image/jpeg");
    expect(await S.findMasterObjectKey(300)).not.toBeNull();
    await S.removeMasterFiles(300);
    expect(await OS_.getMasterStore().exists(s.assetKey)).toBe(false);
    expect(await S.readMasterStream(s.assetKey)).toBeNull(); // gone → route would 410
    expect(await S.findMasterObjectKey(300)).toBeNull();
  });
});
