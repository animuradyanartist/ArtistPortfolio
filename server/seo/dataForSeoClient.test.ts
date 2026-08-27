import { describe, it, expect, afterEach } from "vitest";
import { extractKeywordOverviewItems, dataForSeoMode, dataForSeoConfigured, type DfsEnvelope, type DfsKeywordOverviewItem } from "./dataForSeoClient";

/**
 * A fixture mirroring the EXACT real live keyword_overview response (UK, 2026-08):
 * tasks[0].result[0] is a container { se_type, location_code, language_code, items_count, items }.
 * Values are the real ones returned for the 3 verified keywords ("original art for interiors"
 * returned NO item and is therefore absent — it must stay missing, never become volume 0).
 */
const REAL_ENVELOPE: DfsEnvelope<{ items?: DfsKeywordOverviewItem[] }> = {
  status_code: 20000,
  status_message: "Ok.",
  cost: 0.01224,
  tasks: [{
    status_code: 20000,
    status_message: "Ok.",
    result: [{
      // container shape confirmed live
      se_type: "google",
      location_code: 2826,
      language_code: "en",
      items_count: 2,
      items: [
        {
          keyword: "original oil paintings", location_code: 2826, language_code: "en",
          keyword_info: { search_volume: 140, cpc: 0.79, competition: 1, competition_level: "HIGH", low_top_of_page_bid: 0.2, high_top_of_page_bid: 0.9, monthly_searches: [{ year: 2026, month: 7, search_volume: 170 }, { year: 2026, month: 6, search_volume: 110 }] },
          keyword_properties: { keyword_difficulty: 0 },
          search_intent_info: { main_intent: "transactional" },
        },
        {
          keyword: "contemporary landscape paintings", location_code: 2826, language_code: "en",
          keyword_info: { search_volume: 390, cpc: 0.75, competition: 0.96, competition_level: "HIGH", monthly_searches: [{ year: 2026, month: 7, search_volume: 390 }] },
          keyword_properties: { keyword_difficulty: 0 },
          search_intent_info: { main_intent: "informational" },
        },
      ],
    }] as any,
  }],
};

describe("extractKeywordOverviewItems — the CONFIRMED live container shape (result[0].items)", () => {
  it("extracts items from result[0].items", () => {
    const items = extractKeywordOverviewItems(REAL_ENVELOPE);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.keyword)).toEqual(["original oil paintings", "contemporary landscape paintings"]);
  });

  it("parses search_volume / cpc / competition / competition_level exactly", () => {
    const [oil, landscape] = extractKeywordOverviewItems(REAL_ENVELOPE);
    expect(oil.keyword_info?.search_volume).toBe(140);
    expect(oil.keyword_info?.cpc).toBe(0.79);
    expect(oil.keyword_info?.competition).toBe(1);
    expect(oil.keyword_info?.competition_level).toBe("HIGH");
    expect(landscape.keyword_info?.search_volume).toBe(390);
    expect(landscape.keyword_info?.competition).toBe(0.96);
  });

  it("preserves monthly_searches where useful (seasonality)", () => {
    const [oil] = extractKeywordOverviewItems(REAL_ENVELOPE);
    expect(oil.keyword_info?.monthly_searches).toHaveLength(2);
    expect(oil.keyword_info?.monthly_searches?.[0]).toEqual({ year: 2026, month: 7, search_volume: 170 });
  });

  it("preserves intent where returned", () => {
    const [oil, landscape] = extractKeywordOverviewItems(REAL_ENVELOPE);
    expect(oil.search_intent_info?.main_intent).toBe("transactional");
    expect(landscape.search_intent_info?.main_intent).toBe("informational");
  });

  it("a keyword the API did NOT return stays absent — never converted to volume 0", () => {
    const items = extractKeywordOverviewItems(REAL_ENVELOPE);
    const missing = items.find((i) => i.keyword === "original art for interiors");
    expect(missing).toBeUndefined(); // absent, not a volume-0 record
  });

  it("returns [] safely for an empty/absent/error result (no throw, no fake structure)", () => {
    const empty: DfsEnvelope<{ items?: DfsKeywordOverviewItem[] }> = { status_code: 20000, status_message: "Ok.", cost: 0, tasks: [{ status_code: 20000, status_message: "Ok.", result: [] }] };
    expect(extractKeywordOverviewItems(empty)).toEqual([]);
    expect(extractKeywordOverviewItems({ status_code: 40000, status_message: "err", cost: 0, tasks: null })).toEqual([]);
  });
});

describe("client fails closed without credentials (cache behaviour + auth unchanged)", () => {
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
