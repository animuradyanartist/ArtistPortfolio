import { describe, it, expect, vi } from "vitest";
import { uploadMasterInChunks, MASTER_UPLOAD_CHUNK_FALLBACK } from "./printMasterUpload";

// A File-like large blob without touching the disk. 120 MB of zeros → many 8 MB chunks.
function bigFile(bytes: number, name = "master.tif"): Blob & { name?: string } {
  const b = new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" }) as Blob & { name?: string };
  (b as any).name = name;
  return b;
}

/** A fake fetch that records calls and returns scripted responses per URL fragment. */
function makeFetch(handlers: { init?: any; chunk?: (i: number) => any; complete?: any }) {
  const calls: { url: string; method: string; body?: any; index?: number }[] = [];
  const json = (status: number, obj: any) => ({ ok: status >= 200 && status < 300, status, json: async () => obj });
  const impl = (async (url: string, opts: any = {}) => {
    const u = String(url);
    const rec: any = { url: u, method: opts.method, body: opts.body };
    if (u.includes("/upload/init")) { calls.push(rec); return handlers.init ?? json(200, { ok: true, uploadId: "a".repeat(24), chunkBytes: MASTER_UPLOAD_CHUNK_FALLBACK }); }
    if (u.includes("/chunk?index=")) {
      const i = Number(new URL("http://x" + u).searchParams.get("index"));
      rec.index = i; calls.push(rec);
      return handlers.chunk ? handlers.chunk(i) : json(200, { ok: true, index: i });
    }
    if (u.includes("/complete")) { calls.push(rec); return handlers.complete ?? json(200, { ok: true, master: { status: "ready", widthPx: 7000, heightPx: 5000 }, eligibleSizeCount: 3 }); }
    if (u.includes("/abort")) { calls.push(rec); return json(200, { ok: true }); }
    calls.push(rec); return json(404, {});
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("uploadMasterInChunks — the ONLY master path (never the prints request)", () => {
  it("a 120 MB master uploads as init → N chunks (each ≤ 8 MB) → complete, in order", async () => {
    const size = 120 * 1024 * 1024;
    const { impl, calls } = makeFetch({});
    const progress: number[] = [];
    const res = await uploadMasterInChunks(1, bigFile(size), { fetchImpl: impl, onProgress: (p) => progress.push(p) });

    expect(res.ok).toBe(true);
    const seq = calls.map((c) => (c.url.includes("/init") ? "init" : c.url.includes("/chunk") ? "chunk" : c.url.includes("/complete") ? "complete" : "other"));
    expect(seq[0]).toBe("init");
    expect(seq[seq.length - 1]).toBe("complete");

    const chunks = calls.filter((c) => c.url.includes("/chunk"));
    expect(chunks.length).toBe(Math.ceil(size / MASTER_UPLOAD_CHUNK_FALLBACK)); // 15
    // Indexes are 0..N-1 in order.
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
    // EVERY chunk body is a Blob of at most 8 MB — no single request is large.
    for (const c of chunks) {
      expect(c.body).toBeInstanceOf(Blob);
      expect((c.body as Blob).size).toBeLessThanOrEqual(MASTER_UPLOAD_CHUNK_FALLBACK);
    }
    // Sum of chunk sizes == the whole file (nothing dropped).
    expect(chunks.reduce((n, c) => n + (c.body as Blob).size, 0)).toBe(size);
    expect(progress[progress.length - 1]).toBe(100);
  });

  it("honours the server-advertised chunkBytes and never exceeds it", async () => {
    const json = (o: any) => ({ ok: true, status: 200, json: async () => o });
    const { impl, calls } = makeFetch({ init: json({ ok: true, uploadId: "b".repeat(24), chunkBytes: 4 * 1024 * 1024 }) });
    await uploadMasterInChunks(2, bigFile(20 * 1024 * 1024), { fetchImpl: impl });
    const chunks = calls.filter((c) => c.url.includes("/chunk"));
    expect(chunks.length).toBe(5); // 20 MB / 4 MB
    for (const c of chunks) expect((c.body as Blob).size).toBeLessThanOrEqual(4 * 1024 * 1024);
  });

  it("a failed chunk aborts and returns ok:false (never falsely 'uploaded')", async () => {
    const bad = (i: number) => (i === 1 ? { ok: false, status: 502, json: async () => ({ message: "storage down" }) } : { ok: true, status: 200, json: async () => ({ ok: true }) });
    const { impl, calls } = makeFetch({ chunk: bad });
    const res = await uploadMasterInChunks(3, bigFile(30 * 1024 * 1024), { fetchImpl: impl });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.stage).toBe("chunk");
    expect(calls.some((c) => c.url.includes("/abort"))).toBe(true); // aborted
    expect(calls.some((c) => c.url.includes("/complete"))).toBe(false); // never completed
  });

  it("a failed complete returns ok:false (readiness must not go green)", async () => {
    const { impl } = makeFetch({ complete: { ok: false, status: 400, json: async () => ({ message: "not a readable image" }) } });
    const res = await uploadMasterInChunks(4, bigFile(10 * 1024 * 1024), { fetchImpl: impl });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.stage).toBe("complete");
  });

  it("a failed init returns ok:false and uploads no chunks", async () => {
    const { impl, calls } = makeFetch({ init: { ok: false, status: 404, json: async () => ({ message: "Save the print first" }) } });
    const res = await uploadMasterInChunks(5, bigFile(10 * 1024 * 1024), { fetchImpl: impl });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.stage).toBe("init");
    expect(calls.some((c) => c.url.includes("/chunk"))).toBe(false);
  });

  it("success returns the committed master + eligibility for a readiness refresh", async () => {
    const { impl } = makeFetch({ complete: { ok: true, status: 200, json: async () => ({ ok: true, master: { status: "ready", widthPx: 8000, heightPx: 6000 }, eligibleSizeCount: 2 }) } });
    const res = await uploadMasterInChunks(6, bigFile(9 * 1024 * 1024), { fetchImpl: impl });
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.master.status).toBe("ready"); expect(res.eligibleSizeCount).toBe(2); }
  });
});
