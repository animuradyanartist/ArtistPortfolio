/**
 * SEO EXECUTION LOG — the auditable record of DECISIONS taken on the real opportunities, so
 * /admin/seo answers "what have we done, and what's left for me to decide?" rather than only
 * listing generated actions. Each entry is grounded in the stored keyword data + the real pages;
 * IMPLEMENTED entries name the files changed and how the change was verified. Nothing here claims a
 * ranking improved because code changed — it records the CHANGE and its verification, not an outcome.
 *
 * Curated + shared so it is version-controlled and surfaced in admin. Update it when a decision
 * changes (e.g. an owner approves a deferred page).
 */

export type ExecutionState =
  | "Implemented" // a safe, factual change was made and verified
  | "Keep" // the page already targets this correctly — no change needed
  | "Needs owner approval" // a business/positioning decision, not auto-implementable
  | "Deferred"; // real opportunity, blocked on a precondition (inventory, owner input)

export interface ExecutionEntry {
  keyword: string;
  intent: string;
  page: string;
  diagnosis: string;
  change: string;
  state: ExecutionState;
  confidence: "High" | "Medium" | "Low";
  files?: string[];
  verification?: string;
}

export const EXECUTION_LOG: readonly ExecutionEntry[] = [
  {
    keyword: "contemporary landscape paintings",
    intent: "commercial (390/mo, highest-volume commercial term)",
    page: "/collections/landscape-paintings",
    diagnosis: "The collection page is well-optimised (H1, intro, ItemList schema, links TO /artworks) but was internally UNDER-linked — no artwork page linked back to it — so it was losing landscape terms to /artworks.",
    change: "Added a symmetric internal link from every landscape artwork page to the collection (same isLandscape predicate the collection uses to include the work), in both the crawlable SSR body and the client page. The category eyebrow on a landscape artwork now links to the collection with descriptive anchor text.",
    state: "Implemented",
    confidence: "High",
    files: ["shared/artworkSsr.ts", "client/src/pages/ArtworkDetailPage.tsx"],
    verification: "SSR renders the collection link for a landscape work and omits it for a figurative one (unit-tested); typecheck + build clean.",
  },
  {
    keyword: "original oil paintings",
    intent: "transactional (140/mo)",
    page: "/artworks",
    diagnosis: "/artworks already targets this umbrella term correctly — served + rendered title is 'Original Oil Paintings for Sale — Ani Muradyan' (shared ARTWORKS_TITLE, no drift), and it links to the landscape collection.",
    change: "No change needed. Keeping /artworks as the single umbrella target for generic original-oil buyer terms avoids it competing with the landscape collection.",
    state: "Keep",
    confidence: "High",
  },
  {
    keyword: "landscape oil painting / modern landscape painting / atmospheric landscape painting",
    intent: "commercial",
    page: "/collections/landscape-paintings",
    diagnosis: "These landscape buyer terms belong to the collection, which the new inbound artwork links now strengthen.",
    change: "Covered by the artwork→collection internal-linking change above; no separate page needed.",
    state: "Implemented",
    confidence: "High",
    files: ["shared/artworkSsr.ts", "client/src/pages/ArtworkDetailPage.tsx"],
  },
  {
    keyword: "art for interior designers / art for luxury interiors / artwork for interior projects",
    intent: "trade / commercial",
    page: "/art-for-interior-designers (does not exist)",
    diagnosis: "Real trade intent maps here, but there is no page. Creating a trade landing page is a positioning decision and must use ONLY existing factual information (original oils, large-scale works, worldwide shipping, sourcing/portfolio contact, real exhibitions) — never invented designer clients, hospitality projects, trade discounts or testimonials.",
    change: "Recommend a factual /art-for-interior-designers page. NOT auto-created — it is a new landing page with ambiguous scope and a business voice, so it needs owner sign-off on positioning + which facts to include.",
    state: "Needs owner approval",
    confidence: "Medium",
  },
  {
    keyword: "statement wall art / large wall art prints",
    intent: "decor / print",
    page: "/prints/large-wall-art (does not exist)",
    diagnosis: "A print landing page is the right target, but there is no purchasable print inventory yet (no master → nothing sellable). Publishing an empty print landing page would be a thin/soft-404 page.",
    change: "Deferred until at least one matching print variant is genuinely purchasable (the print-SEO gate already enforces this).",
    state: "Deferred",
    confidence: "High",
  },
  {
    keyword: "Google Images — descriptive image URLs",
    intent: "image discovery",
    page: "artwork pages (/img/artwork/:id/0)",
    diagnosis: "Image URLs are id-based (non-descriptive). BUT the images already carry strong signals: a VisualArtwork/ImageObject with contentUrl + caption + representativeOfPage + width/height (CMT), honest generated alt, and image-sitemap inclusion. Re-emitting a descriptive canonical image URL everywhere risks the 'two URLs for one image' problem the code explicitly guards against.",
    change: "Deferred — descriptive filename is a weak signal versus schema/alt/context which are already in place; a cross-cutting image-URL change is not worth the pipeline risk without owner sign-off.",
    state: "Needs owner approval",
    confidence: "Medium",
  },
  {
    keyword: "Google Images — thin artwork-page copy (16 works < ~40 words)",
    intent: "image discovery + page quality",
    page: "individual artwork pages",
    diagnosis: "16 artworks have short descriptions; more unique surrounding copy would help Images and page quality.",
    change: "Not auto-implemented — writing artwork copy is Ani's voice and must not be invented or templated. Flagged for the owner to expand these descriptions in her own words.",
    state: "Needs owner approval",
    confidence: "High",
  },
];

/** Small roll-up for the dashboard header. */
export function executionSummary(): Record<ExecutionState, number> {
  const s: Record<ExecutionState, number> = { Implemented: 0, Keep: 0, "Needs owner approval": 0, Deferred: 0 };
  for (const e of EXECUTION_LOG) s[e.state]++;
  return s;
}
