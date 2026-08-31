import { describe, it, expect } from "vitest";
import { deriveVariantFields, validateVariantSave, type MasterDims } from "./adminPrintService";

const readyMaster: MasterDims = { widthPx: 4800, heightPx: 6400, status: "ready", printReadyAssetUrl: "https://cdn/m.tif" };
// 4800×6400 is a clean 3:4 (0.75) — matches GLOBAL-HGE-12X16 (3600×4800).

describe("deriveVariantFields — the admin cannot invent physical facts", () => {
  it("fills material/size/pixels from the verified catalogue for a known SKU", () => {
    const r = deriveVariantFields("GLOBAL-HGE-12X16", readyMaster);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fields).toMatchObject({
      material: "german-etching",
      printAreaWidthPx: 3600,
      printAreaHeightPx: 4800,
      widthCm: 30.5,
      heightCm: 40.6,
      eligible: true,
    });
    expect(r.fields.effectiveDpi).toBe(400); // 300 * 6400/4800
  });

  it("REFUSES an unverified / invented SKU outright", () => {
    expect(deriveVariantFields("MADE-UP", readyMaster)).toEqual({ ok: false, error: expect.stringContaining("not a verified") });
    expect(deriveVariantFields("GLOBAL-PR-16X20", readyMaster).ok).toBe(false);
    expect(deriveVariantFields("GLOBAL-FAP-16X24", readyMaster).ok).toBe(false); // real but not launch
  });

  it("is NOT eligible without master dimensions (web images / no master) — reasonCode 'no-master'", () => {
    const r = deriveVariantFields("GLOBAL-HGE-12X16", { widthPx: null, heightPx: null, status: "missing" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fields.eligible).toBe(false);
    expect(r.fields.effectiveDpi).toBeNull();
    expect(r.fields.reasonCode).toBe("no-master");
  });

  it("is NOT eligible when the master exists but isn't marked print-ready — reasonCode 'not-ready'", () => {
    const r = deriveVariantFields("GLOBAL-HGE-12X16", { ...readyMaster, status: "provisional" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fields.eligible).toBe(false);
    expect(r.fields.reason).toMatch(/not marked print-ready/);
    expect(r.fields.reasonCode).toBe("not-ready");
  });

  it("master ratio doesn't match the SKU (no crop) → CROP REQUIRED (not permanently ineligible)", () => {
    const square: MasterDims = { widthPx: 6000, heightPx: 6000, status: "ready" };
    const r = deriveVariantFields("GLOBAL-HGE-12X16", square);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fields.eligible).toBe(false);
    expect(r.fields.cropRequired).toBe(true);
    expect(r.fields.cropConfigured).toBe(false);
    expect(r.fields.reasonCode).toBe("crop-required");
  });

  it("a high-DPI WRONG-RATIO master → crop-required; a valid crop makes it eligible (DPI from the crop)", () => {
    const sqrt2: MasterDims = { widthPx: 9920, heightPx: 7015, status: "ready" };
    const noCrop = deriveVariantFields("GLOBAL-HGE-12X16", sqrt2);
    expect(noCrop.ok && noCrop.fields.cropRequired).toBe(true);
    expect(noCrop.ok && noCrop.fields.reasonCode).toBe("crop-required");
    // With a valid crop (portrait 3:4 slice of the master) → eligible, DPI from the CROPPED region.
    const crop = { x: 0.235, y: 0, w: 0.53, h: 1 }; // ~3600:4800 (0.75) region of the √2 master
    const withCrop = deriveVariantFields("GLOBAL-HGE-12X16", sqrt2, crop);
    expect(withCrop.ok && withCrop.fields.eligible).toBe(true);
    expect(withCrop.ok && withCrop.fields.reasonCode).toBeNull();
    expect(withCrop.ok && (withCrop.fields.effectiveDpi ?? 0)).toBeLessThan(620); // cropping loses pixels
    // …and the SAME master is still eligible with NO crop at the matching A2 size.
    expect(deriveVariantFields("GLOBAL-HGE-A2", sqrt2)).toMatchObject({ fields: { eligible: true, cropRequired: false, reasonCode: null } });
  });

  it("eligible variant reports reasonCode null", () => {
    const r = deriveVariantFields("GLOBAL-HGE-12X16", readyMaster);
    expect(r.ok && r.fields.eligible).toBe(true);
    expect(r.ok && r.fields.reasonCode).toBeNull();
  });
});

describe("validateVariantSave — enabling requires genuine sellability", () => {
  const base = { sku: "GLOBAL-HGE-12X16", framed: false, frameColour: null, retailMinor: 6500, currency: "EUR", printReadyAssetUrl: "https://cdn/asset.tif", enabled: true };

  it("accepts an enable-able variant and merges server-derived fields", () => {
    const r = validateVariantSave(base, readyMaster);
    expect(r.ok).toBe(true);
    expect(r.row?.printAreaWidthPx).toBe(3600);
    expect(r.row?.eligible).toBe(true);
    expect(r.row?.minDpi).toBe(150);
  });

  it("blocks enabling when not eligible (no master)", () => {
    const r = validateVariantSave(base, { widthPx: null, heightPx: null, status: "missing" });
    expect(r.ok).toBe(false);
    expect(r.errors?.enabled).toMatch(/not eligible/);
  });

  it("blocks enabling when unpriced", () => {
    const r = validateVariantSave({ ...base, retailMinor: null }, readyMaster);
    expect(r.errors?.enabled).toMatch(/set a price/);
  });

  it("blocks enabling a FRAMED variant — framed SKUs are not verified yet", () => {
    const r = validateVariantSave({ ...base, framed: true, frameColour: "black" }, readyMaster);
    expect(r.ok).toBe(false);
    expect(r.errors?.enabled).toMatch(/Framed SKUs are not verified/);
  });

  it("rejects an invented SKU, a bad frame colour, a non-HTTPS asset, and a bad price", () => {
    expect(validateVariantSave({ ...base, sku: "NOPE" }, readyMaster).errors?.sku).toBeTruthy();
    expect(validateVariantSave({ ...base, enabled: false, framed: true, frameColour: "gold" }, readyMaster).errors?.frameColour).toBeTruthy();
    expect(validateVariantSave({ ...base, enabled: false, printReadyAssetUrl: "http://insecure/a.tif" }, readyMaster).errors?.printReadyAssetUrl).toBeTruthy();
    expect(validateVariantSave({ ...base, enabled: false, retailMinor: -5 }, readyMaster).errors?.retailMinor).toBeTruthy();
  });

  it("allows saving a DISABLED framed variant (architected, just not sellable)", () => {
    const r = validateVariantSave({ ...base, enabled: false, framed: true, frameColour: "white" }, readyMaster);
    expect(r.ok).toBe(true);
  });
});
