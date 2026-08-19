/**
 * THE PILOT COHORT MUST RESOLVE COMPLETELY, OR NOT RUN.
 *
 * The first dry run in Replit printed eight "ready" lines and one
 * `SKIP artwork 79: not found`, then reported "8 images / 2.50 MB are ready" — a total that
 * reads like success unless you are counting against the frozen nine. Meanwhile production's
 * own server was emitting /artworks/no-measure-for-distance-79 and /img/artwork/79/0, both
 * built from that row.
 *
 * A database missing a row the live site is serving is not the live database, and migrating
 * into it would have "worked": eight images moved somewhere invisible, production unchanged,
 * and 30/60/90 measurements scheduled against an intervention that never happened.
 *
 * These pin the two properties that make that impossible: the cohort is complete or it fails,
 * and it is checked against what the site actually serves.
 */
import { describe, it, expect } from "vitest";
import { COHORT, EXPECTED_ARTWORKS, EXPECTED_IMAGES, resolveCohort } from "../scripts/pilotCohort.mjs";

/** Production-shaped rows: the five pilot artworks with their real image counts. */
const live = () => [
  { id: 78, title: "Path to Tranquility", images: ["https://www.singulart.com/a.jpeg", "https://www.singulart.com/b.jpeg", "https://www.singulart.com/c.jpeg"] },
  { id: 69, title: "Road to Tuscany", images: ["https://www.singulart.com/d.jpeg"] },
  { id: 63, title: "Strength in Shadows", images: ["https://www.singulart.com/e.jpeg"] },
  { id: 40, title: "Blue Drift", images: ["https://www.singulart.com/f.png", "https://www.singulart.com/g.jpeg", "https://www.singulart.com/h.jpeg"] },
  { id: 79, title: "No Measure for Distance", images: ["https://www.singulart.com/i.jpeg"] },
  { id: 11, title: "Pastel Voyage", images: ["data:image/png;base64,AAAA"] }, // not in the cohort
];

describe("the frozen cohort", () => {
  it("is five artworks and nine images, and says so as data", () => {
    expect(EXPECTED_ARTWORKS).toBe(5);
    expect(EXPECTED_IMAGES).toBe(9);
    expect(COHORT.map((c) => c.id)).toEqual([78, 69, 63, 40, 79]);
  });

  it("resolves all 5 artworks and all 9 images against live-shaped data", () => {
    const r = resolveCohort(live());
    expect(r.complete).toBe(true);
    expect(r.problems).toEqual([]);
    expect(r.slots).toHaveLength(9);
    expect(new Set(r.slots.map((s) => s.artworkId)).size).toBe(5);
  });

  it("includes artwork 79 — the one the first dry run could not find", () => {
    const r = resolveCohort(live());
    const s = r.slots.find((x) => x.artworkId === 79);
    expect(s).toBeDefined();
    expect(s!.imageIndex).toBe(0);
    expect(s!.url).toMatch(/^https?:/);
  });

  it("preserves slot order within each artwork", () => {
    const r = resolveCohort(live());
    expect(r.slots.filter((s) => s.artworkId === 78).map((s) => s.imageIndex)).toEqual([0, 1, 2]);
    expect(r.slots.filter((s) => s.artworkId === 40).map((s) => s.imageIndex)).toEqual([0, 1, 2]);
  });

  it("never touches an artwork outside the cohort", () => {
    const r = resolveCohort(live());
    expect(r.slots.some((s) => s.artworkId === 11)).toBe(false);
  });
});

describe("an incomplete source is a failure, not a smaller pilot", () => {
  it("reports the exact production symptom when artwork 79 is absent", () => {
    const stale = live().filter((a) => a.id !== 79);
    const r = resolveCohort(stale);
    expect(r.complete).toBe(false);
    expect(r.slots).toHaveLength(8); // the eight that "looked ready"
    expect(r.problems).toContainEqual({
      artworkId: 79, title: "No Measure for Distance",
      reason: "artwork not present in this data source",
    });
  });

  it("names an empty slot rather than silently shortening the run", () => {
    const rows = live();
    rows.find((a) => a.id === 40)!.images[1] = "";
    const r = resolveCohort(rows);
    expect(r.complete).toBe(false);
    expect(r.problems).toContainEqual({ artworkId: 40, imageIndex: 1, reason: "image slot is empty" });
  });

  it("treats an already-migrated slot as a problem, so a rerun cannot double-count", () => {
    const rows = live();
    rows.find((a) => a.id === 63)!.images[0] = "data:image/jpeg;base64,AAAA";
    const r = resolveCohort(rows);
    expect(r.complete).toBe(false);
    expect(r.problems).toContainEqual({
      artworkId: 63, imageIndex: 0, reason: "already first-party — nothing to migrate",
    });
    expect(r.slots).toHaveLength(8);
  });

  it("an empty database fails loudly rather than resolving nothing quietly", () => {
    const r = resolveCohort([]);
    expect(r.complete).toBe(false);
    expect(r.slots).toEqual([]);
    expect(r.problems).toHaveLength(5); // one per artwork, each named
  });
});
