/**
 * THE ACTION ENGINE (Phase 7) — the point where data becomes a decision. It reads a keyword's
 * mapping + opportunity score + current/previous rank and emits CONCRETE tasks ("strengthen #12,
 * don't create a new page", "Google is ranking the wrong URL", "create /prints/blue-wall-art only
 * because demand + a beatable SERP justify it"). No charts, no vanity metrics — each task carries a
 * reason, evidence, the exact recommended change, an objective, a priority, and a lifecycle status.
 *
 * The Weekly Plan (Phase 8) then reduces the full task list to the ~5–10 highest-value moves,
 * grouped so a 100-issue audit page can never bury a commercially valuable #11 opportunity.
 *
 * Pure + shared + unit-tested.
 */

import type { IntentFamily } from "./keywords";
import type { KeywordMapping } from "./mapping";
import type { OpportunityScore } from "./scoring";

export type ActionType =
  | "fix-wrong-page"
  | "fix-cannibalization"
  | "optimize-page"
  | "internal-links"
  | "strengthen-existing"
  | "refresh-article"
  | "improve-image-alt"
  | "create-print-landing"
  | "create-trade-landing"
  | "create-collection"
  | "create-supporting-article"
  | "add-interior-mockup"
  | "add-print-schema"
  | "deprioritize";

export type ActionGroup =
  | "Quick wins" | "Content/page changes" | "Technical SEO"
  | "Internal linking" | "New page opportunities" | "Print SEO opportunities";

export type ActionStatus = "todo" | "doing" | "done" | "ignored";

export interface SeoAction {
  type: ActionType;
  group: ActionGroup;
  keyword: string;
  family: IntentFamily;
  targetUrl: string | null;
  priority: number; // 0..100
  effort: "low" | "medium" | "high";
  quickWin: boolean;
  objective: string;
  reason: string;
  evidence: string;
  recommendedChange: string;
  status: ActionStatus;
}

export interface KeywordAnalysis {
  keyword: string;
  family: IntentFamily;
  mapping: KeywordMapping;
  score: OpportunityScore;
  currentRank: number | null;
  previousRank: number | null;
  searchVolume: number | null;
  /** SERP is dominated by marketplaces/social (from serpComposition.independentShare < ~0.25). */
  serpMarketplaceDominated: boolean;
  /** For a print keyword whose primary is a print PDP: is that product genuinely purchasable? */
  printPurchasable?: boolean;
}

const GROUP_OF: Record<ActionType, ActionGroup> = {
  "fix-wrong-page": "Technical SEO",
  "fix-cannibalization": "Technical SEO",
  "add-print-schema": "Technical SEO",
  "internal-links": "Internal linking",
  "optimize-page": "Content/page changes",
  "strengthen-existing": "Content/page changes",
  "refresh-article": "Content/page changes",
  "improve-image-alt": "Content/page changes",
  "create-print-landing": "Print SEO opportunities",
  "add-interior-mockup": "Print SEO opportunities",
  "create-trade-landing": "New page opportunities",
  "create-collection": "New page opportunities",
  "create-supporting-article": "New page opportunities",
  deprioritize: "Content/page changes",
};

const EFFORT_OF: Record<ActionType, "low" | "medium" | "high"> = {
  "fix-wrong-page": "low",
  "internal-links": "low",
  "improve-image-alt": "low",
  "add-print-schema": "low",
  "optimize-page": "low",
  "fix-cannibalization": "medium",
  "strengthen-existing": "medium",
  "refresh-article": "medium",
  "add-interior-mockup": "medium",
  "create-print-landing": "high",
  "create-trade-landing": "high",
  "create-collection": "high",
  "create-supporting-article": "high",
  deprioritize: "low",
};

function mk(a: Omit<SeoAction, "group" | "effort" | "quickWin" | "status">): SeoAction {
  const group = GROUP_OF[a.type];
  const effort = EFFORT_OF[a.type];
  return { ...a, group, effort, quickWin: effort === "low" && a.priority >= 60, status: "todo" };
}

/** Generate every concrete action for ONE analysed keyword. May emit several. */
export function actionsForKeyword(a: KeywordAnalysis): SeoAction[] {
  const out: SeoAction[] = [];
  const url = a.mapping.primary?.url ?? null;
  const base = a.score.score;

  // 0. Too competitive → an explicit deprioritize decision (so it stops resurfacing).
  if (a.serpMarketplaceDominated && a.score.band === "low" && (a.currentRank == null || a.currentRank > 20)) {
    out.push(mk({
      type: "deprioritize", keyword: a.keyword, family: a.family, targetUrl: url, priority: 10,
      objective: "Spend effort where an independent site can actually win",
      reason: "The SERP is dominated by marketplaces/social and the opportunity score is low.",
      evidence: `Score ${base}/100; marketplace-dominated SERP; ${a.currentRank == null ? "not ranking" : `#${a.currentRank}`}.`,
      recommendedChange: "Do not target now. Revisit only if demand rises or the SERP changes.",
    }));
    return out; // nothing else is worth doing on this keyword
  }

  // 1. Google ranks the WRONG page — highest-leverage structural fix.
  if (a.mapping.wrongPageRanking && url) {
    out.push(mk({
      type: "fix-wrong-page", keyword: a.keyword, family: a.family, targetUrl: url,
      priority: Math.min(100, base + 20),
      objective: "Get the intended page ranking instead of the wrong one",
      reason: "Google is ranking a different URL than the correct primary target for this keyword.",
      evidence: `Ranking URL: ${a.mapping.currentRankingUrl}; correct target: ${url}.`,
      recommendedChange: `Strengthen ${url} for this keyword (title/H1/intro + internal links pointing here with matching anchor), and de-emphasise the keyword on ${a.mapping.currentRankingUrl}.`,
    }));
  }

  // 2. Cannibalization — multiple pages fighting for the same term.
  if (a.mapping.cannibalizationRisk && url) {
    out.push(mk({
      type: "fix-cannibalization", keyword: a.keyword, family: a.family, targetUrl: url,
      priority: Math.min(100, base + 10),
      objective: "Concentrate ranking signals on one page",
      reason: "Several pages target this keyword, splitting relevance.",
      evidence: `Competing pages: ${a.mapping.cannibalizingUrls.join(", ")}.`,
      recommendedChange: `Make ${url} the single primary target; on the others, shift the on-page keyword and internally link them to ${url}.`,
    }));
  }

  // 3. A new landing page is the right target and demand justifies it.
  if (a.mapping.recommendNewPage && a.score.band !== "low") {
    const isPrint = a.mapping.recommendNewPage.type === "print-landing";
    out.push(mk({
      type: isPrint ? "create-print-landing" : "create-trade-landing",
      keyword: a.keyword, family: a.family, targetUrl: a.mapping.primary?.url ?? null,
      priority: base,
      objective: isPrint ? "Own a decor/room-intent query with a real print landing page" : "Capture interior-designer / trade demand with a dedicated page",
      reason: a.mapping.recommendNewPage.reason,
      evidence: `Score ${base}/100; ${a.searchVolume ?? "unknown"} searches/mo; no existing page targets this.`,
      recommendedChange: isPrint
        ? `Build ${a.mapping.primary?.url} listing the matching print products; index it ONLY once at least one variant is genuinely purchasable.`
        : `Build /${a.mapping.recommendNewPage.slug} for trade buyers (sizing, editions, sourcing, contact).`,
    }));
  }

  // 4. Page exists and is on page 2 (#11–20) — strengthen it, don't build new.
  if (url && a.mapping.primary?.exists && a.currentRank != null && a.currentRank >= 11 && a.currentRank <= 20) {
    out.push(mk({
      type: "strengthen-existing", keyword: a.keyword, family: a.family, targetUrl: url,
      priority: Math.min(100, base + 15),
      objective: "Move a page-2 ranking onto page 1",
      reason: `An existing page already ranks #${a.currentRank}. Strengthen it rather than creating a competing page.`,
      evidence: `#${a.currentRank}, score ${base}/100.`,
      recommendedChange: `On ${url}: align the H1/title/intro to the exact query, add a concise on-page answer, and add 2–3 internal links with matching anchor text.`,
    }));
    out.push(mk({
      type: "internal-links", keyword: a.keyword, family: a.family, targetUrl: url,
      priority: base,
      objective: "Pass internal relevance to the page-2 target",
      reason: "Internal links are the cheapest lever to lift a near-miss ranking.",
      evidence: `#${a.currentRank} target with few internal links.`,
      recommendedChange: `Add contextual links to ${url} from the homepage and 2 topically-related pages, using "${a.keyword}" as the anchor where natural.`,
    }));
  }

  // 5. Page 1 but not top-3 — a light on-page optimize.
  if (url && a.mapping.primary?.exists && a.currentRank != null && a.currentRank >= 4 && a.currentRank <= 10) {
    out.push(mk({
      type: "optimize-page", keyword: a.keyword, family: a.family, targetUrl: url,
      priority: base,
      objective: "Push a page-1 ranking toward the top",
      reason: `Ranking #${a.currentRank} — small on-page gains can move it up.`,
      evidence: `#${a.currentRank}, score ${base}/100.`,
      recommendedChange: `Tighten the title tag and H1 on ${url} to lead with "${a.keyword}"; ensure the first paragraph answers the query directly.`,
    }));
  }

  // 6. An article target whose ranking DROPPED — refresh it.
  if (url && a.mapping.primary?.type === "article" && a.previousRank != null && a.currentRank != null && a.currentRank - a.previousRank >= 6) {
    out.push(mk({
      type: "refresh-article", keyword: a.keyword, family: a.family, targetUrl: url,
      priority: Math.min(100, base + 10),
      objective: "Recover lost rankings on a decaying article",
      reason: `Ranking dropped from #${a.previousRank} to #${a.currentRank}.`,
      evidence: `Δ ${a.currentRank - a.previousRank} positions.`,
      recommendedChange: `Refresh ${url}: update facts/examples, add current internal links, refresh the published date, and re-submit in the sitemap.`,
    }));
  }

  // 7. Print PDP target that is purchasable → suggest an interior/room mockup (decor conversion).
  if (url && a.mapping.primary?.type === "print-pdp" && a.printPurchasable) {
    out.push(mk({
      type: "add-interior-mockup", keyword: a.keyword, family: a.family, targetUrl: url,
      priority: Math.max(30, base - 10),
      objective: "Match room/decor buyer intent and improve conversion",
      reason: "Print buyers search by room; an above-the-sofa mockup earns the click and the sale.",
      evidence: `Print PDP ranking/target for a decor query.`,
      recommendedChange: `Add a scaled in-room ("above the sofa") mockup image with descriptive alt text to ${url}.`,
    }));
  }

  return out;
}

/** Generate + rank actions across many analysed keywords. Highest priority first. */
export function generateActions(analyses: KeywordAnalysis[]): SeoAction[] {
  return analyses.flatMap(actionsForKeyword).sort((a, b) => b.priority - a.priority);
}

export interface WeeklyPlan {
  quickWins: SeoAction[];
  groups: Array<{ group: ActionGroup; actions: SeoAction[] }>;
  total: number;
  shown: number;
}

const GROUP_ORDER: ActionGroup[] = [
  "Quick wins", "Technical SEO", "Internal linking", "Content/page changes", "Print SEO opportunities", "New page opportunities",
];

/**
 * The "what should I do this week?" view: at most `limit` highest-value actions, quick wins surfaced
 * first, then grouped. Deliberately small so minor audit noise can never outrank a real opportunity.
 */
export function weeklyPlan(actions: SeoAction[], limit = 8): WeeklyPlan {
  const ranked = [...actions].filter((a) => a.status === "todo").sort((a, b) => b.priority - a.priority);
  const top = ranked.slice(0, limit);
  const quickWins = top.filter((a) => a.quickWin);
  const grouped = new Map<ActionGroup, SeoAction[]>();
  for (const a of top) {
    if (a.quickWin) continue; // already surfaced above
    grouped.set(a.group, [...(grouped.get(a.group) ?? []), a]);
  }
  const groups = GROUP_ORDER
    .filter((g) => g !== "Quick wins" && grouped.has(g))
    .map((group) => ({ group, actions: grouped.get(group)! }));
  return { quickWins, groups, total: ranked.length, shown: top.length };
}
