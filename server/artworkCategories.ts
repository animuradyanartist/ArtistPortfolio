/**
 * CATEGORIES FROM HER OWN WORDS — derived, never guessed.
 *
 * Her site carries a category on 6 of 54 works, all of them "landscape", which is why an
 * SEO run looking for figurative work found none: the tag had simply never been applied.
 * The classification does exist, though — in the descriptions she wrote for her Singulart
 * listings, where the works are called portraits, landscapes, minimalist, abstract in her
 * own sentences.
 *
 * SO THE RULE IS EXPLICIT EVIDENCE ONLY. A category is derived when the description states
 * it. Nothing is inferred from a title, a filename, or what the picture might depict — an
 * artwork called "Vibrant Valleys" is not a landscape because of its name, and a painting
 * is not minimalist because the composition looks sparse to a machine that cannot see it.
 * Where the text only implies a category, no category is derived and the work is left
 * untagged for a human to decide.
 *
 * That deliberately produces gaps. Five works read as figurative or landscape without
 * saying so, and they stay unclassified rather than being quietly filled in — a wrong tag
 * is worse than a missing one, because it silently re-shapes which artworks an article is
 * allowed to claim as evidence.
 *
 * PURE. No I/O, no model.
 */

/** A category, and the exact phrase in her description that supports it. */
export interface DerivedCategory {
  category: string;
  /** The matched sentence fragment — checkable against the source text. */
  evidence: string;
}

/**
 * Terms that STATE a category. Deliberately narrow: each pattern is a claim that the word
 * cannot appear in one of her descriptions without the work genuinely being that thing.
 *
 * "figure" and "subject" are absent on purpose. Both appear in descriptions of works that
 * are not figurative ("the subject of this landscape"), and including them was what made
 * five works look classifiable when they are not.
 */
const RULES: Array<{ category: string; pattern: RegExp }> = [
  { category: "figurative", pattern: /\bfigurative\b|\bportraits?\b/i },
  { category: "portrait", pattern: /\bportraits?\b/i },
  { category: "landscape", pattern: /\blandscapes?\b/i },
  { category: "minimal", pattern: /\bminimalis[tm]\b/i },
  { category: "abstract", pattern: /\babstract\b/i },
  { category: "still life", pattern: /\bstill life\b/i },
];

/** The sentence containing the match, trimmed — so a tag can be argued with. */
function evidenceFor(text: string, pattern: RegExp): string | null {
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (pattern.test(sentence)) return sentence.trim().slice(0, 200);
  }
  return null;
}

/**
 * Categories the description explicitly supports.
 *
 * Returns an empty list rather than a guess when nothing is stated, which is the common
 * and correct outcome for a description that describes a feeling rather than a genre.
 */
export function deriveCategories(description: string | null | undefined): DerivedCategory[] {
  const text = (description ?? "").trim();
  if (!text) return [];
  const out: DerivedCategory[] = [];
  for (const { category, pattern } of RULES) {
    if (!pattern.test(text)) continue;
    const evidence = evidenceFor(text, pattern);
    if (!evidence) continue;
    out.push({ category, evidence });
  }
  return out;
}

/** Just the category names, for storage. */
export function categoryNames(description: string | null | undefined): string[] {
  return deriveCategories(description).map((c) => c.category);
}
