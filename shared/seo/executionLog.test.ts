import { describe, it, expect } from "vitest";
import { EXECUTION_LOG, executionSummary } from "./executionLog";

describe("SEO execution log — honest, auditable decisions", () => {
  it("every entry has a keyword, page, diagnosis, change and a valid state", () => {
    const valid = new Set(["Implemented", "Keep", "Needs owner approval", "Deferred"]);
    for (const e of EXECUTION_LOG) {
      expect(e.keyword).toBeTruthy();
      expect(e.page).toBeTruthy();
      expect(e.diagnosis).toBeTruthy();
      expect(e.change).toBeTruthy();
      expect(valid.has(e.state)).toBe(true);
    }
  });

  it("IMPLEMENTED entries name the files changed (accountability)", () => {
    for (const e of EXECUTION_LOG.filter((x) => x.state === "Implemented")) {
      expect(e.files && e.files.length).toBeTruthy();
    }
  });

  it("records the landscape collection internal-linking change as implemented", () => {
    const impl = EXECUTION_LOG.find((e) => e.keyword.includes("contemporary landscape paintings") && e.state === "Implemented");
    expect(impl).toBeTruthy();
    expect(impl!.files).toContain("shared/artworkSsr.ts");
  });

  it("does NOT auto-implement the trade landing page or thin-copy rewrites (owner decisions)", () => {
    const trade = EXECUTION_LOG.find((e) => e.page.includes("art-for-interior-designers"));
    expect(trade?.state).toBe("Needs owner approval");
    const thin = EXECUTION_LOG.find((e) => e.keyword.includes("thin"));
    expect(thin?.state).toBe("Needs owner approval");
  });

  it("summary counts add up to the log length", () => {
    const s = executionSummary();
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBe(EXECUTION_LOG.length);
  });
});
