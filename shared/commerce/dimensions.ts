/**
 * WHAT SIZE IS THE PAINTING, REALLY?
 *
 * `artworks.dimensions` is free text she typed: "79x71cm", "119x109cm", '40" × 30"'. Shipping
 * is computed from it, so a parser that guesses is a parser that mis-charges. This one
 * returns null rather than a guess, and every caller treats null as "quote required" rather
 * than as zero — see shipping.ts, which never invents a cheap price from missing data.
 *
 * Both orders of magnitude are handled because both appear in her catalogue: centimetres
 * (the Singulart import) and inches (the older manual rows).
 */

export interface ArtworkSize {
  widthCm: number;
  heightCm: number;
  /** Which unit the text was written in, kept so a display can echo her own wording. */
  sourceUnit: "cm" | "in";
}

const CM_PER_INCH = 2.54;

/** Any of ×, x, X, * between two numbers, with optional spaces and a trailing unit. */
/**
 * A unit may follow EITHER number: she writes both `40" × 30"` and `60 x 50 cm`. Matching only
 * the trailing one silently failed on every inch-quoted row in the older manual catalogue.
 */
const PATTERN = /(\d+(?:[.,]\d+)?)\s*(cm|mm|in|inch(?:es)?|")?\s*[x×X*]\s*(\d+(?:[.,]\d+)?)\s*(cm|centimet(?:er|re)s?|mm|in|inch(?:es)?|")?/i;

const num = (s: string): number => Number(s.replace(",", "."));

/**
 * Read a size out of her free text, or return null.
 *
 * UNIT INFERENCE, and why it is safe. When no unit is written the number decides: her
 * canvases run 30–200cm, and the same works in inches are 12–80. A pair of numbers where
 * BOTH are under 30 is therefore inches — 20x16 is a real painting, 20x16cm is a postcard.
 * Above that, centimetres. A wrong guess here inflates or deflates a parcel by 2.54x, so
 * anything ambiguous enough to matter is left to the explicit unit.
 */
export function parseArtworkSize(dimensions: string | null | undefined): ArtworkSize | null {
  if (!dimensions) return null;
  const m = PATTERN.exec(dimensions);
  if (!m) return null;

  const a = num(m[1]!);
  const b = num(m[3]!);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;

  // The trailing unit wins when both are written; `40" × 30"` states the same unit twice.
  const unit = (m[4] || m[2] || "").toLowerCase();
  let widthCm = a, heightCm = b, sourceUnit: "cm" | "in" = "cm";

  if (unit.startsWith("in") || unit === '"') {
    widthCm = a * CM_PER_INCH; heightCm = b * CM_PER_INCH; sourceUnit = "in";
  } else if (unit === "mm") {
    widthCm = a / 10; heightCm = b / 10;
  } else if (!unit && a < 30 && b < 30) {
    widthCm = a * CM_PER_INCH; heightCm = b * CM_PER_INCH; sourceUnit = "in";
  }

  // A parcel this system is willing to reason about. Outside it, the caller asks for a quote
  // rather than pretending; 2cm is not a painting and 400cm is not a parcel.
  if (widthCm < 5 || heightCm < 5 || widthCm > 400 || heightCm > 400) return null;

  return { widthCm: round1(widthCm), heightCm: round1(heightCm), sourceUnit };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
