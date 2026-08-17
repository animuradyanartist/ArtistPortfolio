/**
 * THE TWO COPIES OF HER WRITING MUST STAY IDENTICAL.
 *
 * `/path` renders from JSX in `PathPage.tsx`; crawlers are served the same text from
 * `shared/pathNarrative.ts`. Two copies of anything drift, and this pair drifts in the
 * worst possible direction: the version a human sees would improve while the version
 * search engines and the article writer read would quietly go stale — and nobody would
 * notice, because nobody reads the second one on purpose.
 *
 * So this asserts every paragraph in the shared source still appears verbatim in the page.
 * It reads the page's SOURCE rather than rendering it, deliberately: the point is to catch
 * an edit to her words, not to test React.
 *
 * If this fails after an intentional edit, the fix is to copy the new wording across — not
 * to loosen the check.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PATH_NARRATIVE, pathParagraphs } from "@shared/pathNarrative";

const PAGE = path.resolve(__dirname, "../client/src/pages/PathPage.tsx");

/** JSX escapes a few characters; compare on the text as authored. */
function normalise(t: string): string {
  return t
    .replace(/\{"'"\}/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/\s+/g, " ")
    .trim();
}

describe("the path narrative has one source of truth", () => {
  const source = normalise(fs.readFileSync(PAGE, "utf8"));

  it("renders every shared paragraph verbatim on the page", () => {
    const missing = pathParagraphs().filter((p) => !source.includes(normalise(p)));
    expect(missing, `these paragraphs are in shared/pathNarrative.ts but not in PathPage.tsx:\n${missing.join("\n\n")}`).toEqual([]);
  });

  it("keeps every chapter title and arc", () => {
    for (const c of PATH_NARRATIVE.chapters) {
      expect(source, `chapter title "${c.title}"`).toContain(normalise(c.title));
      expect(source, `chapter arc for "${c.title}"`).toContain(normalise(c.arc));
    }
  });

  it("keeps every section heading", () => {
    for (const c of PATH_NARRATIVE.chapters) {
      for (const s of c.sections) {
        expect(source, `heading "${s.heading}"`).toContain(normalise(s.heading));
      }
    }
  });
});

describe("what the crawler will actually receive", () => {
  it("is substantially more than the 39-character shell it gets today", () => {
    // ~820 words at the time of writing. The floor is a guard against material silently
    // disappearing from the shared source, not a target: if she cuts the narrative on
    // purpose, lower it deliberately rather than deleting the check.
    const words = pathParagraphs().join(" ").split(/\s+/).length;
    expect(words).toBeGreaterThan(700);
  });

  it("includes the material an article about her landscapes would need", () => {
    const all = pathParagraphs().join(" ");
    expect(all).toContain("A landscape, for me, is never only a place");
    expect(all).toContain("minimalism is not emptiness");
  });
});
