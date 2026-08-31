import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync, existsSync, readdirSync } from "fs";
import { writeFile } from "fs/promises";
import path from "path";
import os from "os";
import sharp from "sharp";

// Point storage at a throwaway dir BEFORE importing the module (MASTER_DIR is resolved at import).
const TMP = mkdtempSync(path.join(os.tmpdir(), "pmasters-test-"));
process.env.PRINT_MASTERS_DIR = TMP;
process.env.MASTER_DOWNLOAD_SECRET = "unit-test-secret";

let S: typeof import("./masterStorage");
beforeAll(async () => { S = await import("./masterStorage"); await S.ensureMasterDirs(); });

const stage = async (name: string, buf: Buffer) => { const p = path.join(S.stagingDir(), name); await writeFile(p, buf); return p; };
const masterFiles = (printId: number) => { try { return readdirSync(path.join(S.MASTER_DIR, String(printId))).filter((n) => n.startsWith("master")); } catch { return []; } };
const jpeg = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().toBuffer();

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

describe("storeMasterFromStaging — validation + atomic replacement (per print)", () => {
  it("stores a valid JPEG under <printId>/master.jpg with content-derived type", async () => {
    const s = await S.storeMasterFromStaging(100, await stage("a", await jpeg(4000, 5000)), "orig.jpg", "image/jpeg");
    expect(s.assetKey).toBe("100/master.jpg");
    expect([s.widthPx, s.heightPx]).toEqual([4000, 5000]);
    expect(s.contentType).toBe("image/jpeg");
    expect(existsSync(path.join(S.MASTER_DIR, s.assetKey))).toBe(true);
  });

  it("detects type from CONTENT, not filename (a PNG named .jpg stays a PNG)", async () => {
    const png = await sharp({ create: { width: 3600, height: 4800, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    const s = await S.storeMasterFromStaging(101, await stage("b", png), "actually.jpg", "image/jpeg");
    expect(s.contentType).toBe("image/png");
    expect(s.assetKey.endsWith(".png")).toBe(true);
  });

  it("REJECTS a non-image (typed error), leaving any previous master intact", async () => {
    const good = await S.storeMasterFromStaging(102, await stage("c", await jpeg(4000, 5000)), "good.jpg", "image/jpeg");
    await expect(
      S.storeMasterFromStaging(102, await stage("d", Buffer.from("not an image")), "evil.jpg", "image/jpeg"),
    ).rejects.toBeInstanceOf(S.MasterValidationError);
    expect(existsSync(path.join(S.MASTER_DIR, good.assetKey))).toBe(true); // old master preserved
    expect(masterFiles(102)).toEqual(["master.jpg"]);
  });

  it("REJECTS an unsupported format (WebP is not a print format)", async () => {
    const webp = await sharp({ create: { width: 3600, height: 4800, channels: 3, background: { r: 5, g: 5, b: 5 } } }).webp().toBuffer();
    await expect(
      S.storeMasterFromStaging(103, await stage("e", webp), "x.webp", "image/webp"),
    ).rejects.toThrow(/JPEG, PNG or TIFF/i);
  });

  it("replaces atomically across extensions with no orphan (jpg → png leaves one file)", async () => {
    await S.storeMasterFromStaging(104, await stage("f", await jpeg(4000, 5000)), "v1.jpg", "image/jpeg");
    const png = await sharp({ create: { width: 3600, height: 4800, channels: 3, background: { r: 9, g: 9, b: 9 } } }).png().toBuffer();
    await S.storeMasterFromStaging(104, await stage("g", png), "v2.png", "image/png");
    expect(masterFiles(104)).toEqual(["master.png"]); // old master.jpg cleaned; exactly one master
  });

  it("keeps each print's master independent (replacing print 200 never touches print 201)", async () => {
    const a = await S.storeMasterFromStaging(200, await stage("h", await jpeg(4000, 5000)), "a.jpg", "image/jpeg");
    const b = await S.storeMasterFromStaging(201, await stage("i", await jpeg(3600, 4800)), "b.jpg", "image/jpeg");
    const bMd5Before = b.checksumMd5;
    // replace print 200's master
    await S.storeMasterFromStaging(200, await stage("j", await jpeg(5000, 6000)), "a2.jpg", "image/jpeg");
    expect(existsSync(path.join(S.MASTER_DIR, b.assetKey))).toBe(true);
    expect(masterFiles(201)).toEqual(["master.jpg"]);
    expect(bMd5Before).toBe(b.checksumMd5); // print 201 untouched
    expect(a.assetKey).not.toBe(b.assetKey); // different print → different path
  });
});
