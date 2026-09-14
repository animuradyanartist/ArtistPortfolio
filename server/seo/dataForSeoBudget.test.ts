import { describe, it, expect } from "vitest";
import { withBudgetHold, estimateCostUsd, provablyNotCharged, DataForSeoBudgetError, RESERVE_MARGIN } from "./dataForSeoBudget";
import { DataForSeoApiError, DataForSeoNotConfiguredError } from "./dataForSeoClient";

const ENV = { DATAFORSEO_BUDGET_URL: "https://x.supabase.co", DATAFORSEO_BUDGET_ANON_KEY: "anon", DATAFORSEO_BUDGET_TOKEN: "t".repeat(40) } as NodeJS.ProcessEnv;

function fakeBudget(answers: Record<string, Record<string, unknown> | number> = {}) {
  const calls: Array<{ fn: string; body: Record<string, unknown> }> = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const fn = String(url).split("/").pop()!;
    calls.push({ fn, body: JSON.parse(String(init?.body)) });
    const a = answers[fn] ?? { ok: true };
    if (typeof a === "number") return new Response("", { status: a });
    return new Response(JSON.stringify(a), { status: 200 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const params = { keywords: ["a", "b", "c"], location_code: 2826, language_code: "en" };

describe("estimates are upper bounds from the published prices", () => {
  it("keyword_overview: task + per requested keyword", () => {
    expect(estimateCostUsd("keyword_overview", params)).toBeCloseTo(0.01236, 6); // live UK check cost 0.01224
  });
  it("keyword_ideas uses the requested limit", () => {
    expect(estimateCostUsd("keyword_ideas", { limit: 200 })).toBeCloseTo(0.036, 6);
  });
  it("live SERP is priced per 10 results", () => {
    expect(estimateCostUsd("serp_organic", { depth: 20 })).toBeCloseTo(0.004, 6);
  });
});

describe("nothing is bought without a reservation", () => {
  it("fails closed when the shared budget is not configured", async () => {
    let calls = 0;
    await expect(withBudgetHold("keyword_overview", params, "e", async () => (calls++, { data: [], cost: 0.01 }), { env: {} })).rejects.toBeInstanceOf(DataForSeoBudgetError);
    expect(calls).toBe(0);
  });

  it("a refusal (cap) never calls DataForSEO", async () => {
    const b = fakeBudget({ dataforseo_budget_reserve: { ok: false, reason: "cap" } });
    let calls = 0;
    await expect(withBudgetHold("keyword_overview", params, "e", async () => (calls++, { data: [], cost: 0.01 }), { env: ENV, fetchImpl: b.fetchImpl })).rejects.toThrow(/cap/);
    expect(calls).toBe(0);
  });

  it("an unreachable budget never calls DataForSEO", async () => {
    const b = fakeBudget({ dataforseo_budget_reserve: 503 });
    let calls = 0;
    await expect(withBudgetHold("keyword_overview", params, "e", async () => (calls++, { data: [], cost: 0.01 }), { env: ENV, fetchImpl: b.fetchImpl })).rejects.toBeInstanceOf(DataForSeoBudgetError);
    expect(calls).toBe(0);
  });
});

describe("settle / uncertain / release", () => {
  it("settles the same hold with the API-reported cost", async () => {
    const b = fakeBudget();
    const out = await withBudgetHold("keyword_overview", params, "e", async () => ({ data: [1], cost: 0.01224 }), { env: ENV, fetchImpl: b.fetchImpl });
    expect(b.calls.map((c) => c.fn)).toEqual(["dataforseo_budget_reserve", "dataforseo_budget_settle"]);
    expect(b.calls[0]!.body.p_estimated_usd).toBe(Number((0.01236 * RESERVE_MARGIN).toFixed(6)));
    expect(b.calls[1]!.body.p_hold_id).toBe(b.calls[0]!.body.p_hold_id);
    expect(b.calls[1]!.body.p_actual_usd).toBe(0.01224);
    expect(out.settled).toBe(true);
  });

  it("a DataForSEO refusal in the response body releases the hold", async () => {
    const b = fakeBudget();
    await expect(withBudgetHold("keyword_overview", params, "e", async () => { throw new DataForSeoApiError(200, "OK", 40501, null); }, { env: ENV, fetchImpl: b.fetchImpl })).rejects.toThrow();
    expect(b.calls.at(-1)!.fn).toBe("dataforseo_budget_release");
  });

  it("a network failure or a 5xx without a status body may have been billed: uncertain, not released", async () => {
    for (const err of [new TypeError("fetch failed"), new DataForSeoApiError(502, "Bad Gateway", null, "<html>")]) {
      const b = fakeBudget();
      await expect(withBudgetHold("keyword_overview", params, "e", async () => { throw err; }, { env: ENV, fetchImpl: b.fetchImpl })).rejects.toThrow();
      expect(b.calls.at(-1)!.fn).toBe("dataforseo_budget_mark_uncertain");
    }
  });

  it("classifies unbilled failures", () => {
    expect(provablyNotCharged(new DataForSeoNotConfiguredError())).toBe(true);
    expect(provablyNotCharged(new DataForSeoApiError(401, "Unauthorized", null, null))).toBe(true);
    expect(provablyNotCharged(new Error("socket hang up"))).toBe(false);
  });
});
