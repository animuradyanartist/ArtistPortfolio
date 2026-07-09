import type { Artwork } from "@shared/schema";

export type ArtworkCategory = "landscape" | "figurative";

// Landscape cues found in titles/descriptions. Ani's practice is
// portrait-first, so a piece is treated as figurative unless it clearly
// reads as a landscape. When a real `category` column is added to the
// schema/admin later, this classifier defers to it automatically.
const LANDSCAPE_WORDS = [
  "landscape",
  "horizon",
  "valley",
  "field",
  "meadow",
  "hill",
  "mountain",
  "barn",
  "road",
  "path",
  "pathway",
  "drift",
  "voyage",
  "gold",
  "dawn",
  "dusk",
  "evening",
  "morning",
  "afternoon",
  "winter",
  "autumn",
  "summer",
  "spring",
  "sky",
  "sea",
  "coast",
  "shore",
  "village",
  "homeward",
  "sunset",
  "sunrise",
  "pastel voyage",
];

export function artworkCategory(artwork: Artwork): ArtworkCategory {
  // Forward-compatible: honor an explicit category if one is ever stored.
  const explicit = (artwork as { category?: string }).category;
  if (explicit === "landscape" || explicit === "figurative") return explicit;

  const haystack = `${artwork.title} ${artwork.description ?? ""}`.toLowerCase();
  return LANDSCAPE_WORDS.some((w) => haystack.includes(w)) ? "landscape" : "figurative";
}
