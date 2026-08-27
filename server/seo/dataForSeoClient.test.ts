import { describe, it, expect, afterEach } from "vitest";
import { extractKeywordOverviewItems, dataForSeoMode, dataForSeoConfigured, type DfsEnvelope, type DfsKeywordOverviewItem } from "./dataForSeoClient";

function env(result: unknown): DfsEnvelope<{ items?: DfsKeywordOverviewItem[] }> {
  return { status_code: 20000, status_message: "Ok.", cost: 0.01, tasks: [{ status_code: 20000, status_message: "Ok.", result: result as any }] };
}

const item = (keyword: string): DfsKeywordOverviewItem => ({
  keyword, location_code: 2826, language_code: "en",
  keyword_info: { search_volume: 320, cpc: 0.9, competition: 0.4, competition_level: "MEDIUM" },
  keyword_properties: { keyword_difficulty: 28 },
  search_intent_info: { main_intent: "commercial" },
});

describe("extractKeywordOverviewItems — tolerant of both real DataForSEO container shapes", () => {
  it("reads items nested under result[0].items", () => {
    const out = extractKeywordOverviewItems(env([{ items: [item("original oil paintings")] }]));
    expect(out).toHaveLength(1);
    expect(out[0].keyword).toBe("original oil paintings");
    expect(out[0].keyword_info?.search_volume).toBe(320);
  });

  it("reads items when result[] IS the items array", () => {
    const out = extractKeywordOverviewItems(env([item("a"), item("b")]));
    expect(out.map((i) => i.keyword)).toEqual(["a", "b"]);
  });

  it("returns [] for an empty/absent result rather than throwing", () => {
    expect(extractKeywordOverviewItems(env(null))).toEqual([]);
    expect(extractKeywordOverviewItems({ status_code: 40000, status_message: "err", cost: 0, tasks: null })).toEqual([]);
  });
});

describe("client fails closed without credentials", () => {
  afterEach(() => { delete process.env.DATAFORSEO_LOGIN; delete process.env.DATAFORSEO_PASSWORD; });
  it("is unconfigured with no creds and configured with both", () => {
    delete process.env.DATAFORSEO_LOGIN; delete process.env.DATAFORSEO_PASSWORD;
    expect(dataForSeoMode()).toBe("unconfigured");
    expect(dataForSeoConfigured()).toBe(false);
    process.env.DATAFORSEO_LOGIN = "user@example.com";
    process.env.DATAFORSEO_PASSWORD = "a-long-enough-password";
    expect(dataForSeoConfigured()).toBe(true);
  });
});
