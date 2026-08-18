/**
 * WHOSE TEXT WINS when Singulart and the site disagree about a painting.
 *
 * The sync has always refused to touch `description`, which was safe and left 52 of 54
 * works with nothing public to read. Now that the listing text is ingested, the question is
 * no longer "may we write it?" but "may we write it OVER something".
 *
 * PROVENANCE IS INFERRED, NOT STORED. No new column is needed, because the pair of fields
 * already present answers the question:
 *
 *   local empty                      → nothing to lose. Adopt the listing text.
 *   local === last synced text       → the site is showing the synced copy. A changed
 *                                      listing is an update, not a conflict.
 *   local differs from last synced   → somebody edited it here, or the listing changed
 *                                      under an edit. Either way a human's words are in
 *                                      that field, and the sync must not remove them.
 *
 * The third case is REPORTED rather than resolved. A conflict silently resolved in favour
 * of the machine is how an artist's own sentence about her painting disappears in a nightly
 * job, and nobody notices because the replacement reads fine.
 *
 * PURE. No I/O.
 */

export type DescriptionAction =
  /** Local was empty; the listing text is adopted. */
  | "adopted"
  /** Local matched the previous sync and the listing changed; the update is carried over. */
  | "updated"
  /** Local is hand-written or diverged; nothing is written. */
  | "conflict"
  /** Nothing to do — no listing text, or already identical. */
  | "unchanged";

export interface DescriptionDecision {
  action: DescriptionAction;
  /** The value to write to `description`, or null to leave it alone. */
  description: string | null;
  /** Human-readable, for the sync's report. Null when nothing happened. */
  note: string | null;
}

function norm(v: string | null | undefined): string {
  return (v ?? "").replace(/\s+/g, " ").trim();
}

/**
 * @param local          the site's current public description
 * @param incoming       the description on the Singulart listing right now
 * @param lastSynced     `sourceDescription` from the previous sync, if any
 */
export function decideDescription(
  local: string | null | undefined,
  incoming: string | null | undefined,
  lastSynced: string | null | undefined,
): DescriptionDecision {
  const l = norm(local);
  const i = norm(incoming);
  const s = norm(lastSynced);

  if (!i) return { action: "unchanged", description: null, note: null };
  if (l === i) return { action: "unchanged", description: null, note: null };

  if (!l) {
    return {
      action: "adopted",
      description: i,
      note: "the site had no description for this work, so the listing text was adopted",
    };
  }

  // The site is showing exactly what the last sync brought, so it is the sync's own copy
  // and updating it removes nothing a person wrote.
  if (s && l === s) {
    return {
      action: "updated",
      description: i,
      note: "the listing text changed and the site was showing the previously synced copy",
    };
  }

  return {
    action: "conflict",
    description: null,
    note:
      "the site's description differs from the listing and was not written by a previous sync — " +
      "left untouched so an edit made here cannot be overwritten",
  };
}
