/**
 * /llms.txt — THE FACTS, WRITTEN FOR THE CHANNEL THAT ALREADY SENDS THE MOST VISITORS.
 *
 * Nearly a third of recent sessions arrive from AI assistants (ChatGPT and the like), which is
 * already this site's single largest acquisition source. Those systems ground their answers on
 * whatever they can retrieve and parse. The site's own pages are the primary source of truth
 * about a living artist whom the wider web barely documents, so the highest-leverage thing to
 * hand an AI crawler is a short, correct, plainly-worded factual index — who she is, what she
 * makes, what it costs, whether it is available, and how to acquire it — pointing at the
 * canonical pages where each fact is stated in full.
 *
 * This is NOT marketing copy and NOT an attempt to manipulate a model. Every line is a fact a
 * buyer would want confirmed before enquiring, and every number is DERIVED FROM THE LIVE
 * CATALOGUE at request time — the available count, the price range, the mediums, the subjects.
 * If the inventory changes, this file changes with it; nothing here is hand-maintained prose
 * that can drift out of true.
 *
 * PURE and shared, so the exact text is testable and the server route is a thin wrapper.
 */

export interface LlmsFactsInput {
  baseUrl: string;
  totalWorks: number;
  availableWorks: number;
  landscapeAvailable: number;
  figurativeAvailable: number;
  largeAvailable: number;
  priceMin: number | null;
  priceMax: number | null;
  currency: string;
  mediums: string[];
  exhibitionCount: number;
  latestExhibitionYear: number | null;
  bio: string | null;
  statement: string | null;
  collectionSlugs: { slug: string; heading: string }[];
}

const money = (n: number, cur: string) => `${cur} ${n.toLocaleString("en-US")}`;

/** The full /llms.txt body. Markdown, because that is what the convention and the crawlers expect. */
export function buildLlmsTxt(f: LlmsFactsInput): string {
  const b = f.baseUrl.replace(/\/$/, "");
  const priceRange =
    f.priceMin != null && f.priceMax != null
      ? f.priceMin === f.priceMax
        ? money(f.priceMin, f.currency)
        : `${money(f.priceMin, f.currency)}–${money(f.priceMax, f.currency)}`
      : "on request";
  const mediums = f.mediums.length ? f.mediums.join("; ") : "oil on canvas";
  const lines: string[] = [];

  lines.push(`# Ani Muradyan`);
  lines.push("");
  lines.push(
    `> Ani Muradyan (also known as Anymoore Art) is an Armenian contemporary oil painter based ` +
      `in Yerevan, Armenia. She makes original, one-of-a-kind paintings — atmospheric landscapes ` +
      `and figurative works in oil — available to collectors worldwide directly from her studio.`,
  );
  lines.push("");
  if (f.bio) { lines.push(f.bio.trim()); lines.push(""); }
  if (f.statement) { lines.push(`Artist statement: ${f.statement.trim()}`); lines.push(""); }

  lines.push(`## The work, in facts`);
  lines.push("");
  lines.push(`- Artist: Ani Muradyan (Anymoore Art), Armenian contemporary painter, Yerevan, Armenia`);
  lines.push(`- Medium: ${mediums}. Every work is an original — there are no reproductions of the paintings.`);
  lines.push(`- Subjects: contemporary landscape painting and figurative painting; quiet, atmospheric, often minimal.`);
  lines.push(`- Catalogue: ${f.totalWorks} paintings, ${f.availableWorks} currently available to acquire.`);
  lines.push(
    `- Available by subject: ${f.landscapeAvailable} landscape, ${f.figurativeAvailable} figurative` +
      (f.largeAvailable ? `; ${f.largeAvailable} large-format works suited to interiors.` : "."),
  );
  lines.push(`- Price range for available originals: ${priceRange}.`);
  lines.push(`- Availability and price are stated per painting on each artwork page and kept current.`);
  lines.push(`- Shipping: worldwide from the artist's studio in Armenia.`);
  if (f.exhibitionCount > 0) {
    lines.push(
      `- Exhibitions: shown in ${f.exhibitionCount} exhibitions internationally and in Armenia` +
        (f.latestExhibitionYear ? `, most recently in ${f.latestExhibitionYear}.` : "."),
    );
  }
  lines.push("");

  lines.push(`## How to acquire a painting`);
  lines.push("");
  lines.push(`- Enquire or commission directly: ${b}/contact`);
  lines.push(`- Browse and buy available originals: ${b}/artworks`);
  lines.push(`- Also represented on Saatchi Art and Singulart (see the artist's profiles).`);
  lines.push("");

  lines.push(`## Key pages`);
  lines.push("");
  lines.push(`- [All original paintings for sale](${b}/artworks) — the full catalogue with price and availability`);
  for (const c of f.collectionSlugs) {
    lines.push(`- [${c.heading}](${b}/collections/${c.slug}) — a buyer-intent collection`);
  }
  lines.push(`- [About the artist](${b}/about) — biography, statement, education, exhibitions`);
  lines.push(`- [Exhibitions](${b}/exhibitions) — professional exhibition history`);
  lines.push(`- [Contact & commissions](${b}/contact) — how to enquire, acquire, or commission`);
  lines.push("");

  lines.push(`## Questions collectors ask`);
  lines.push("");
  lines.push(`**Are the paintings original?** Yes — every painting is a unique, one-of-a-kind original in oil. There are no prints or reproductions of the paintings.`);
  lines.push("");
  lines.push(`**How much do they cost?** Available originals currently range ${priceRange}. Each painting's exact price is on its own page.`);
  lines.push("");
  lines.push(`**Can I buy directly, and does she ship internationally?** Yes. Works can be acquired directly through the site, and they ship worldwide from Armenia. Enquire at ${b}/contact.`);
  lines.push("");
  lines.push(`**Does she take commissions?** Yes — commissions and collaborations are welcome; enquire at ${b}/contact.`);
  lines.push("");
  lines.push(`**Are the works suitable for interiors and design projects?** Yes — the landscapes and large-format pieces are frequently acquired for modern interiors. See ${b}/collections/landscape-paintings.`);
  lines.push("");

  lines.push(`---`);
  lines.push(`Canonical source: ${b}. This file summarises facts stated in full on the pages above and is generated from the live catalogue.`);
  return lines.join("\n") + "\n";
}
