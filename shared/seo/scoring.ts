/**
 * SEO OPPORTUNITY SCORE (Phase 5) — a transparent 0–100 that an artist can read, not a black box.
 * Every factor is a 0..1 sub-score with a stated weight and a plain-English note, and the weights
 * deliberately favour REALISTIC WINS for an independent artist site: a volume-300 keyword where Ani
 * sits at #13 on a SERP full of other independent artists scores HIGHER than a volume-10,000 term
 * owned by Etsy/Saatchi/Pinterest.
 *
 * Pure + shared + unit-tested. The breakdown is exposed in admin so a decision can be trusted.
 */

import { intentStrength, type SearchIntent } from "./keywords";

export interface ScoreInput {
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null; // 0..1 (DataForSEO competition)
  difficulty: number | null; // 0..100 (DataForSEO keyword_difficulty)
  intent: SearchIntent | null;
  /** Our current organic rank for the keyword; null if we do not rank in the tracked depth. */
  currentRank: number | null;
  /** Does a suitable primary target page already exist (from the mapping)? */
  hasSuitableTarget: boolean;
  /** Relevance 0..1 of the mapped primary page to the keyword. */
  targetRelevance: number;
  /** Fraction 0..1 of the top SERP that is independent artists / small sites (i.e. beatable). */
  serpIndependentShare: number;
}

export interface ScoreFactor {
  name: string;
  value: number; // 0..1
  weight: number; // 0..1
  contribution: number; // value * weight * 100
  note: string;
}

export interface OpportunityScore {
  score: number; // 0..100
  band: "high" | "medium" | "low";
  factors: ScoreFactor[];
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Demand, log-scaled so a huge head term doesn't swamp a winnable mid-tail one. */
function demandScore(volume: number | null): number {
  if (!volume || volume <= 0) return 0.05;
  return clamp01(Math.log10(volume + 1) / Math.log10(10000)); // 300→~0.62, 10k→1
}

/** Rank proximity: page-2 (#11–20) is the sweet spot; already-#1 has little upside. */
function rankProximityScore(rank: number | null): { value: number; note: string } {
  if (rank == null) return { value: 0.4, note: "Not yet ranking — unproven; a target page may be missing" };
  if (rank <= 3) return { value: 0.2, note: `Already ranking #${rank} — little remaining upside` };
  if (rank <= 10) return { value: 0.6, note: `Page 1 (#${rank}) — realistic push to the top` };
  if (rank <= 20) return { value: 1.0, note: `Page 2 (#${rank}) — the highest-leverage position to move` };
  if (rank <= 50) return { value: 0.7, note: `#${rank} — a real climb but reachable` };
  return { value: 0.3, note: `#${rank} — far back` };
}

/**
 * Difficulty inverse — but ONLY a genuine keyword-difficulty value (>0) is trusted. The live UK
 * data showed keyword_overview returns KD=0 for competitive art terms (it doesn't populate real
 * organic KD) while its `competition` is AD-AUCTION competition (HIGH), which is a MISLEADING proxy
 * for whether an independent artist can rank organically. So with no real KD we stay neutral and let
 * the winnable-SERP factor carry the difficulty judgement (confirmed by a SERP check, not ads).
 */
function difficultyScore(difficulty: number | null): { value: number; note: string } {
  if (difficulty != null && difficulty > 0) return { value: clamp01((100 - difficulty) / 100), note: `Keyword difficulty ${difficulty}/100` };
  return { value: 0.5, note: "No reliable organic difficulty yet — ad competition is ignored (misleading for art SEO); confirm with a SERP check" };
}

function commercialScore(cpc: number | null): { value: number; note: string } {
  if (cpc == null || cpc <= 0) return { value: 0.2, note: "No CPC signal — low commercial pressure" };
  return { value: clamp01(0.2 + cpc / 3), note: `CPC ${cpc.toFixed(2)} — a commercial buyer signal` };
}

const WEIGHTS = {
  winnability: 0.2,
  rankProximity: 0.2,
  intent: 0.15,
  relevance: 0.15,
  difficulty: 0.12,
  commercial: 0.1,
  demand: 0.08,
} as const;

/**
 * Compute the opportunity score with a fully transparent breakdown. `serpIndependentShare` is the
 * single most important "can an independent site win here" input, so it carries the top weight
 * alongside rank proximity.
 */
export function opportunityScore(input: ScoreInput): OpportunityScore {
  const rank = rankProximityScore(input.currentRank);
  const diff = difficultyScore(input.difficulty);
  const comm = commercialScore(input.cpc);
  const intent = intentStrength(input.intent);
  const demand = demandScore(input.searchVolume);
  const winnability = clamp01(input.serpIndependentShare);
  const relevance = input.hasSuitableTarget ? clamp01(input.targetRelevance) : clamp01(input.targetRelevance) * 0.5;

  const factors: ScoreFactor[] = [
    { name: "Winnable SERP", value: winnability, weight: WEIGHTS.winnability, contribution: winnability * WEIGHTS.winnability * 100, note: `${(winnability * 100).toFixed(0)}% of the top results are independent artists / small sites` },
    { name: "Rank proximity", value: rank.value, weight: WEIGHTS.rankProximity, contribution: rank.value * WEIGHTS.rankProximity * 100, note: rank.note },
    { name: "Buyer intent", value: intent, weight: WEIGHTS.intent, contribution: intent * WEIGHTS.intent * 100, note: `${input.intent ?? "unknown"} intent` },
    { name: "Target fit", value: relevance, weight: WEIGHTS.relevance, contribution: relevance * WEIGHTS.relevance * 100, note: input.hasSuitableTarget ? "A suitable page exists to rank" : "No suitable page yet (a new-page opportunity)" },
    { name: "Beatable difficulty", value: diff.value, weight: WEIGHTS.difficulty, contribution: diff.value * WEIGHTS.difficulty * 100, note: diff.note },
    { name: "Commercial value", value: comm.value, weight: WEIGHTS.commercial, contribution: comm.value * WEIGHTS.commercial * 100, note: comm.note },
    { name: "Search demand", value: demand, weight: WEIGHTS.demand, contribution: demand * WEIGHTS.demand * 100, note: input.searchVolume ? `${input.searchVolume} searches/mo (log-scaled)` : "No/low volume" },
  ];

  const score = Math.round(factors.reduce((s, f) => s + f.contribution, 0));
  const band: OpportunityScore["band"] = score >= 65 ? "high" : score >= 40 ? "medium" : "low";
  return { score, band, factors };
}
