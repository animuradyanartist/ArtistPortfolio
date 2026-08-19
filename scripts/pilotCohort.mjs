/**
 * THE FROZEN PILOT COHORT — five artworks, nine image slots.
 *
 * Exported rather than inlined so the migration script and its regression test agree by
 * construction. The first dry run silently resolved eight of nine and the shortfall was only
 * visible by reading the log; a cohort that is data can be asserted against.
 *
 * These ids are frozen in exp-002-first-party-images. They are not adjusted to make a run
 * pass — a cohort that changes when the tooling struggles is not a cohort.
 */
export const COHORT = [
  { id: 78, title: "Path to Tranquility", idx: [0, 1, 2] },
  { id: 69, title: "Road to Tuscany", idx: [0] },
  { id: 63, title: "Strength in Shadows", idx: [0] },
  { id: 40, title: "Blue Drift", idx: [0, 1, 2] },
  { id: 79, title: "No Measure for Distance", idx: [0] },
];

export const EXPECTED_ARTWORKS = COHORT.length;
export const EXPECTED_IMAGES = COHORT.reduce((n, c) => n + c.idx.length, 0);

/**
 * Which cohort slots a given set of artwork rows can actually supply.
 *
 * Returns the resolvable slots AND the reasons for every one that is not, so a caller can
 * fail loudly with specifics rather than printing a count that happens to be short.
 */
export function resolveCohort(artworks) {
  const byId = new Map(artworks.map((a) => [Number(a.id), a]));
  const slots = [];
  const problems = [];

  for (const c of COHORT) {
    const row = byId.get(c.id);
    if (!row) {
      problems.push({ artworkId: c.id, title: c.title, reason: "artwork not present in this data source" });
      continue;
    }
    for (const i of c.idx) {
      const src = (row.images ?? [])[i];
      if (typeof src !== "string" || !src) {
        problems.push({ artworkId: c.id, imageIndex: i, reason: "image slot is empty" });
      } else if (!/^https?:/i.test(src)) {
        problems.push({ artworkId: c.id, imageIndex: i, reason: "already first-party — nothing to migrate" });
      } else {
        slots.push({ artworkId: c.id, title: row.title, imageIndex: i, url: src });
      }
    }
  }
  return { slots, problems, complete: problems.length === 0 && slots.length === EXPECTED_IMAGES };
}
