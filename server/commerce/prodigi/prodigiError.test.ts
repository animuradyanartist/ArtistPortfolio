/**
 * PRODIGI ERROR SANITIZATION — a failed fulfilment must preserve the provider diagnostics support
 * needs (status + W3C traceparent + a short message) WITHOUT ever persisting or displaying the API
 * key, request body/headers, or a signed asset URL/token. These guard exactly that boundary.
 */
import { describe, it, expect } from "vitest";
import { ProdigiApiError, sanitizeProdigiError, formatFulfilmentError } from "./prodigiClient";

const TRACE = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";

describe("sanitizeProdigiError", () => {
  it("keeps status, statusText and traceparent for a ProdigiApiError", () => {
    const e = new ProdigiApiError(500, "Internal Server Error", TRACE, { message: "Something went wrong" });
    const s = sanitizeProdigiError(e)!;
    expect(s.statusCode).toBe(500);
    expect(s.statusText).toBe("Internal Server Error");
    expect(s.traceParent).toBe(TRACE);
    expect(s.providerMessage).toBe("Something went wrong");
  });

  it("pulls a message from common provider body shapes", () => {
    expect(sanitizeProdigiError(new ProdigiApiError(400, "Bad Request", null, { error: { message: "Invalid SKU" } }))!.providerMessage).toBe("Invalid SKU");
    expect(sanitizeProdigiError(new ProdigiApiError(400, "Bad Request", null, { detail: "asset unreachable" }))!.providerMessage).toBe("asset unreachable");
    expect(sanitizeProdigiError(new ProdigiApiError(422, "Unprocessable", null, { outcome: "AssetError" }))!.providerMessage).toBe("outcome: AssetError");
    expect(sanitizeProdigiError(new ProdigiApiError(500, "Internal Server Error", null, "Internal Server Error"))!.providerMessage).toBe("Internal Server Error");
  });

  it("REDACTS any URL / token / key that appears in the provider message", () => {
    const e = new ProdigiApiError(500, "Internal Server Error", TRACE, {
      message: "could not fetch https://animuradyan.com/api/commerce/prints/master-file/12?token=SECRETVALUE&variant=3 for the order",
    });
    const s = sanitizeProdigiError(e)!;
    expect(s.providerMessage).not.toContain("SECRETVALUE");
    expect(s.providerMessage).not.toContain("https://");
    expect(s.providerMessage).not.toContain("token=");
    expect(s.providerMessage).toContain("[redacted]");
  });

  it("caps the provider message so a huge body can never flood the order/admin", () => {
    const e = new ProdigiApiError(500, "Internal Server Error", null, { message: "x".repeat(5000) });
    expect(sanitizeProdigiError(e)!.providerMessage!.length).toBeLessThanOrEqual(300);
  });

  it("returns null for a non-Prodigi error", () => {
    expect(sanitizeProdigiError(new Error("boom"))).toBeNull();
    expect(sanitizeProdigiError("nope")).toBeNull();
  });
});

describe("formatFulfilmentError — the string stored on the order + shown in admin", () => {
  it("keeps the trace and a redacted provider message for a Prodigi error", () => {
    const e = new ProdigiApiError(500, "Internal Server Error", TRACE, { message: "asset fetch failed" });
    const out = formatFulfilmentError(e);
    expect(out).toContain("ProdigiApiError 500 Internal Server Error");
    expect(out).toContain(`trace=${TRACE}`);
    expect(out).toContain('provider="asset fetch failed"');
  });

  it("never leaks a key / signed URL even if one somehow reaches the body", () => {
    const e = new ProdigiApiError(500, "Internal Server Error", TRACE, {
      message: "x-api-key=LIVEKEYSHOULDNEVERAPPEAR at https://x/y?token=abc",
    });
    const out = formatFulfilmentError(e);
    expect(out).not.toContain("LIVEKEYSHOULDNEVERAPPEAR");
    expect(out).not.toContain("token=abc");
    expect(out).not.toContain("https://");
  });

  it("falls back to name: message for a non-Prodigi error (behaviour preserved)", () => {
    expect(formatFulfilmentError(new TypeError("bad thing"))).toBe("TypeError: bad thing");
    expect(formatFulfilmentError("weird")).toBe("Unknown Prodigi error");
  });
});
