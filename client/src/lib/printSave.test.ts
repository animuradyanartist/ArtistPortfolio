import { describe, it, expect, vi } from "vitest";
import { buildPrintSaveBody, createPrintThenUploadMaster } from "./printSave";
import type { MasterUploadResult } from "./printMasterUpload";

const fields = {
  title: "  A Sign in the Distance  ",
  slug: "",
  description: "  desc  ",
  images: ["data:image/jpeg;base64,SMALL"], // a small, already-prepared public image
  artworkId: 7,
  status: "draft",
  availableSizes: "[]",
  preferredMaterial: "paper",
};

describe("buildPrintSaveBody — the prints request holds metadata + small images only", () => {
  it("contains no master_* fields and no File/Blob bytes", () => {
    const body = buildPrintSaveBody(fields);
    const keys = Object.keys(body);
    expect(keys.some((k) => k.toLowerCase().includes("master"))).toBe(false);
    const serialised = JSON.stringify(body);
    expect(serialised).not.toMatch(/master/i);
    // Nothing in the body is a Blob/File.
    for (const v of Object.values(body)) expect(v instanceof Blob).toBe(false);
    expect(body.title).toBe("A Sign in the Distance"); // trimmed
    expect(body.slug).toBeUndefined(); // blank slug omitted
  });
});

describe("createPrintThenUploadMaster — master bytes never enter the prints request", () => {
  it("selecting a 120 MB master keeps the /api/prints body small; master goes to the chunked uploader", async () => {
    const master = new Blob([new Uint8Array(120 * 1024 * 1024)]) as Blob & { name?: string };
    (master as any).name = "master.tif";

    const createPrint = vi.fn(async (body: Record<string, unknown>) => ({ id: 42, _body: body }));
    const uploadMaster = vi.fn(async (_printId: number, _file: Blob): Promise<MasterUploadResult> => ({ ok: true, master: { status: "ready" }, eligibleSizeCount: 3 }));

    const outcome = await createPrintThenUploadMaster(fields, master, { createPrint, uploadMaster });

    // 1) The metadata request was sent WITHOUT the master, and stayed tiny.
    const sentBody = createPrint.mock.calls[0][0];
    const bodyBytes = JSON.stringify(sentBody).length;
    expect(bodyBytes).toBeLessThan(10 * 1024); // kilobytes, not 120 MB
    expect(JSON.stringify(sentBody)).not.toMatch(/master/i);
    for (const v of Object.values(sentBody)) expect(v instanceof Blob).toBe(false);

    // 2) The print was created FIRST, then the master uploaded to the returned id via the chunked path.
    expect(createPrint).toHaveBeenCalledTimes(1);
    expect(uploadMaster).toHaveBeenCalledTimes(1);
    expect(uploadMaster.mock.calls[0][0]).toBe(42); // printId
    expect(uploadMaster.mock.calls[0][1]).toBe(master); // the exact File, handed off (not serialised)
    expect(outcome.masterUploaded).toBe(true);
  });

  it("a failed master upload does NOT falsely report the master as uploaded", async () => {
    const master = new Blob([new Uint8Array(1024)]) as Blob & { name?: string };
    const createPrint = vi.fn(async () => ({ id: 9 }));
    const uploadMaster = vi.fn(async (): Promise<MasterUploadResult> => ({ ok: false, stage: "complete", message: "boom" }));
    const outcome = await createPrintThenUploadMaster(fields, master, { createPrint, uploadMaster });
    expect(outcome.masterAttempted).toBe(true);
    expect(outcome.masterUploaded).toBe(false);
    expect(outcome.masterMessage).toBe("boom");
  });

  it("no master selected → create succeeds, no upload attempted", async () => {
    const createPrint = vi.fn(async () => ({ id: 5 }));
    const uploadMaster = vi.fn();
    const outcome = await createPrintThenUploadMaster(fields, null, { createPrint, uploadMaster });
    expect(outcome.masterAttempted).toBe(false);
    expect(uploadMaster).not.toHaveBeenCalled();
  });
});
