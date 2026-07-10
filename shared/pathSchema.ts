import { pgTable, text, serial } from "drizzle-orm/pg-core";

/**
 * Settings for the storytelling "/path" page. A single row (id = 1) holds
 * the chosen artwork for each chapter image slot. Each value is an artwork
 * id (as text) or null; null means "use the automatic pick".
 *
 * Kept in its own file (not shared/schema.ts) so it never collides with
 * other in-flight schema edits. The table is auto-created on server boot
 * (see server/index.ts) so production never needs a manual migration.
 */
export const pathSettings = pgTable("path_settings", {
  id: serial("id").primaryKey(),
  heroArtworkId: text("hero_artwork_id"),
  chapterOneArtworkId: text("chapter_one_artwork_id"),
  chapterOneDetailArtworkId: text("chapter_one_detail_artwork_id"),
  chapterTwoArtworkId: text("chapter_two_artwork_id"),
  chapterTwoDetailArtworkId: text("chapter_two_detail_artwork_id"),
  chapterThreeArtworkId: text("chapter_three_artwork_id"),
});

export type PathSettings = typeof pathSettings.$inferSelect;
export type InsertPathSettings = typeof pathSettings.$inferInsert;

/** The editable slot keys, in display order — shared by API, admin, and page. */
export const PATH_SLOTS = [
  "heroArtworkId",
  "chapterOneArtworkId",
  "chapterOneDetailArtworkId",
  "chapterTwoArtworkId",
  "chapterTwoDetailArtworkId",
  "chapterThreeArtworkId",
] as const;
export type PathSlot = (typeof PATH_SLOTS)[number];

/** Raw SQL to create the table if it doesn't exist (boot-time safety net). */
export const PATH_SETTINGS_DDL = `CREATE TABLE IF NOT EXISTS path_settings (
  id serial PRIMARY KEY,
  hero_artwork_id text,
  chapter_one_artwork_id text,
  chapter_one_detail_artwork_id text,
  chapter_two_artwork_id text,
  chapter_two_detail_artwork_id text,
  chapter_three_artwork_id text
)`;
