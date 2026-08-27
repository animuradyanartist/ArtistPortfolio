import { describe, it, expect } from "vitest";
import { classifyIntent, normalizeKeyword, intentStrength, SEED_KEYWORDS, NEXT_KEYWORD_BATCH } from "./keywords";

describe("intent separation — originals vs prints vs trade (Phase 4)", () => {
  it("keeps an 'original' buyer on originals even when decor words appear", () => {
    expect(classifyIntent("large original wall art").family).toBe("originals");
    expect(classifyIntent("original oil paintings").family).toBe("originals");
    expect(classifyIntent("original landscape painting").family).toBe("originals");
  });

  it("routes decor/print queries to prints", () => {
    expect(classifyIntent("blue wall art").family).toBe("prints");
    expect(classifyIntent("giclée prints").family).toBe("prints");
    expect(classifyIntent("living room wall art").family).toBe("prints");
    expect(classifyIntent("art above sofa").family).toBe("prints");
    expect(classifyIntent("large framed art").family).toBe("prints");
  });

  it("routes designer/hospitality queries to trade first, whatever else they contain", () => {
    expect(classifyIntent("art for interior designers").family).toBe("trade");
    expect(classifyIntent("original art for interior designers").family).toBe("trade");
    expect(classifyIntent("art for hotels").family).toBe("trade");
    expect(classifyIntent("large artwork for interior projects").family).toBe("trade");
  });

  it("routes branded (artist-name) searches to the branded family, above everything else", () => {
    expect(classifyIntent("ani muradyan").family).toBe("branded");
    expect(classifyIntent("ani muradyan original paintings").family).toBe("branded"); // brand wins over 'original'
    expect(classifyIntent("anymoore art").family).toBe("branded");
    expect(classifyIntent("contemporary landscape paintings").family).not.toBe("branded");
  });

  it("flags an original+print ambiguous keyword so mapping can avoid cannibalization", () => {
    expect(classifyIntent("original landscape wall art print").ambiguous).toBe(true);
    expect(classifyIntent("blue wall art").ambiguous).toBe(false);
  });

  it("defaults a bare painting query to originals", () => {
    expect(classifyIntent("contemporary landscape paintings").family).toBe("originals");
  });

  it("normalizes keywords consistently", () => {
    expect(normalizeKeyword("  Blue   Wall  ART ")).toBe("blue wall art");
  });

  it("intentStrength ranks transactional/commercial above informational", () => {
    expect(intentStrength("transactional")).toBeGreaterThan(intentStrength("commercial"));
    expect(intentStrength("commercial")).toBeGreaterThan(intentStrength("informational"));
    expect(intentStrength(null)).toBe(0.5);
  });

  it("seed taxonomy covers all 8 groups + 4 families, with natural phrasing (no dead 'original art for interiors')", () => {
    expect(SEED_KEYWORDS.length).toBeGreaterThan(20);
    const groups = new Set(SEED_KEYWORDS.map((s) => s.group));
    expect(groups.size).toBe(8); // A–H all present
    expect(SEED_KEYWORDS.some((s) => s.family === "branded")).toBe(true);
    expect(SEED_KEYWORDS.some((s) => s.family === "trade")).toBe(true);
    expect(SEED_KEYWORDS.some((s) => s.family === "prints")).toBe(true);
    // the phrase the live API returned no record for was removed
    expect(SEED_KEYWORDS.some((s) => s.keyword === "original art for interiors")).toBe(false);
    // each seed keyword declares its group + family
    for (const s of SEED_KEYWORDS) { expect(s.group).toBeTruthy(); expect(s.family).toBeTruthy(); }
  });

  it("has an auditable NEXT batch to validate later (not yet targeted)", () => {
    expect(NEXT_KEYWORD_BATCH.length).toBeGreaterThan(8);
    // no overlap with the active seeds — it's genuinely the next set
    const seedSet = new Set(SEED_KEYWORDS.map((s) => s.keyword));
    expect(NEXT_KEYWORD_BATCH.every((s) => !seedSet.has(s.keyword))).toBe(true);
  });
});
