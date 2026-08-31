import { describe, it, expect } from "vitest";
import { signMasterToken, verifyMasterToken, signedMasterUrl } from "./masterStorage";

describe("master download token — cryptographically signed, expiring, per-artwork", () => {
  it("accepts a fresh token for the right artwork", () => {
    const t = signMasterToken(42, 900);
    expect(verifyMasterToken(t, 42)).toBe(true);
  });

  it("rejects a token minted for a DIFFERENT artwork (scope)", () => {
    const t = signMasterToken(42, 900);
    expect(verifyMasterToken(t, 43)).toBe(false);
  });

  it("rejects an EXPIRED token", () => {
    const t = signMasterToken(42, -10); // already expired
    expect(verifyMasterToken(t, 42)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const t = signMasterToken(42, 900);
    const tampered = t.slice(0, -2) + (t.endsWith("aa") ? "bb" : "aa");
    expect(verifyMasterToken(tampered, 42)).toBe(false);
  });

  it("rejects a tampered payload (artwork id swapped in the payload)", () => {
    const t = signMasterToken(42, 900);
    const [, sig] = [t.slice(0, t.lastIndexOf(".")), t.slice(t.lastIndexOf(".") + 1)];
    const forged = Buffer.from("43." + (Math.floor(Date.now() / 1000) + 900)).toString("base64url") + "." + sig;
    expect(verifyMasterToken(forged, 43)).toBe(false);
  });

  it("rejects missing / malformed tokens", () => {
    expect(verifyMasterToken(null, 42)).toBe(false);
    expect(verifyMasterToken("", 42)).toBe(false);
    expect(verifyMasterToken("garbage", 42)).toBe(false);
    expect(verifyMasterToken("a.b.c", 42)).toBe(false);
  });

  it("builds an absolute signed URL that verifies for its artwork", () => {
    const url = signedMasterUrl("https://example.com/", 7, 900);
    expect(url).toMatch(/^https:\/\/example\.com\/api\/commerce\/prints\/master-file\/7\?token=/);
    const token = new URL(url).searchParams.get("token")!;
    expect(verifyMasterToken(token, 7)).toBe(true);
    expect(verifyMasterToken(token, 8)).toBe(false);
  });
});
