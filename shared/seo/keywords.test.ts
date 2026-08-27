import { describe, it, expect } from "vitest";
import { classifyIntent, normalizeKeyword, intentStrength, SEED_KEYWORDS } from "./keywords";

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

  it("seed families are internally consistent", () => {
    expect(SEED_KEYWORDS.length).toBeGreaterThan(20);
    expect(SEED_KEYWORDS.filter((s) => s.family === "prints").length).toBeGreaterThan(5);
    expect(SEED_KEYWORDS.filter((s) => s.family === "trade").length).toBeGreaterThan(2);
  });
});
