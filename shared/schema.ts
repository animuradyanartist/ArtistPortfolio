import { pgTable, text, serial, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const artworks = pgTable("artworks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug"),
  seoSlug: text("seo_slug"),
  description: text("description").notNull(),
  medium: text("medium").notNull(),
  dimensions: text("dimensions").notNull(),
  year: integer("year").notNull(),
  price: integer("price").notNull(),
  images: text("images").array().notNull(),
  type: text("type").notNull(), // oil, acrylic, mixed
  category: text("category"), // landscape, figurative (nullable — falls back to keyword classifier)
  size: text("size").notNull(), // small, medium, large
  availability: text("availability").notNull(), // available, sold
  saatchiUrl: text("saatchi_url"),
  buyLink: text("buy_link"),
  featured: boolean("featured").default(false),
  position: integer("position").default(0),
  availableForPrint: boolean("available_for_print").default(false),
  printSizes: text("print_sizes"),
  preferredPrintMaterial: text("preferred_print_material"),
  singulartId: text("singulart_id").unique(),
  source: text("source").notNull().default("manual"),
  // Marks that this artwork's Singulart DETAIL page has already been checked for
  // its full image set, so incremental syncs skip it (even if it genuinely has
  // only one image). Cleared manually to force a re-check. Added via boot
  // self-heal (ADD COLUMN IF NOT EXISTS) in server/index.ts — no manual migration.
  detailImagesChecked: boolean("detail_images_checked").default(false),
}, (t) => ({
  // Production has a plain UNIQUE INDEX named `artworks_seo_slug_unique` (created
  // outside Drizzle). Declaring it here as a uniqueIndex — NOT `.unique()` on the
  // column, which Drizzle emits as a CONSTRAINT — matches prod's exact form and
  // stops the post-merge `db:push` from dropping it out of the dev DB, keeping
  // the dev↔prod schemas identical so deploys generate no seo_slug migration.
  // Postgres allows multiple NULLs in a unique index and routes.ts stores blank
  // seoSlug as NULL, so this never blocks inserts.
  seoSlugUnique: uniqueIndex("artworks_seo_slug_unique").on(t.seoSlug),
}));

export const prints = pgTable("prints", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug"),
  description: text("description").notNull(),
  images: text("images").array().notNull(),
  artworkId: integer("artwork_id"),
  availableSizes: text("available_sizes").notNull(),
  preferredMaterial: text("preferred_material").notNull().default("paper"),
  status: text("status").notNull().default("active"),
  featured: boolean("featured").default(false),
  position: integer("position").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const exhibitions = pgTable("exhibitions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull(), // solo, group
  venue: text("venue").notNull(),
  location: text("location").notNull(),
  year: integer("year").notNull(),
  startDate: text("start_date"),
  endDate: text("end_date"),
  description: text("description"),
  image: text("image"),
});

export const homepageSettings = pgTable("homepage_settings", {
  id: serial("id").primaryKey(),
  heroQuote: text("hero_quote").notNull(),
  heroImage: text("hero_image").notNull(),
  featuredArtworkIds: text("featured_artwork_ids").array().notNull(),
  // "Where the work lives" section — a JSON array of { image, caption }.
  // Nullable so older rows keep working; admin manages it via the homepage tab.
  roomItems: text("room_items"),
});

export const artistBio = pgTable("artist_bio", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  image: text("image").notNull(),
  statement: text("statement"),
  education: text("education"),
  awards: text("awards"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertArtworkSchema = createInsertSchema(artworks).omit({
  id: true,
});

export const insertPrintSchema = createInsertSchema(prints).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertExhibitionSchema = createInsertSchema(exhibitions).omit({
  id: true,
});

export const insertHomepageSettingsSchema = createInsertSchema(homepageSettings).omit({
  id: true,
});

export const insertArtistBioSchema = createInsertSchema(artistBio).omit({
  id: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertArtwork = z.infer<typeof insertArtworkSchema>;
export type Artwork = typeof artworks.$inferSelect;
export type InsertPrint = z.infer<typeof insertPrintSchema>;
export type Print = typeof prints.$inferSelect;
export type InsertExhibition = z.infer<typeof insertExhibitionSchema>;
export type Exhibition = typeof exhibitions.$inferSelect;
export type InsertHomepageSettings = z.infer<typeof insertHomepageSettingsSchema>;
export type HomepageSettings = typeof homepageSettings.$inferSelect;
export type InsertArtistBio = z.infer<typeof insertArtistBioSchema>;
export type ArtistBio = typeof artistBio.$inferSelect;

// Feedback table
export const contactSettings = pgTable("contact_settings", {
  id: serial("id").primaryKey(),
  instagramUrl: text("instagram_url").notNull(),
  saatchiUrl: text("saatchi_url").notNull(),
  email: text("email").notNull(),
  location: text("location").notNull(),
  instagramHandle: text("instagram_handle").notNull(),
});

export const feedback = pgTable('feedback', {
  id: serial('id').primaryKey(),
  rating: integer('rating').notNull(),
  message: text('message').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Collector List signups, captured from multiple surfaces (homepage, artwork pages, …).
// `source` records WHERE each signup converted, so acquisition is measurable per surface.
export const collectors = pgTable('collectors', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  source: text('source'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Messages left through the Contact page form.
export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  subject: text('subject'),
  message: text('message').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const galleryPhotos = pgTable('gallery_photos', {
  id: serial('id').primaryKey(),
  title: text('title'),
  image: text('image').notNull(),
  exhibitionName: text('exhibition_name'),
  location: text('location'),
  year: integer('year'),
  featured: boolean('featured').default(false),
  position: integer('position').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const insertContactSettingsSchema = createInsertSchema(contactSettings).omit({
  id: true,
});

export const insertFeedbackSchema = createInsertSchema(feedback).omit({
  id: true,
  createdAt: true,
});

export const insertGalleryPhotoSchema = createInsertSchema(galleryPhotos).omit({
  id: true,
  createdAt: true,
});

export type InsertContactSettings = z.infer<typeof insertContactSettingsSchema>;
export type ContactSettings = typeof contactSettings.$inferSelect;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type Feedback = typeof feedback.$inferSelect;
export type InsertGalleryPhoto = z.infer<typeof insertGalleryPhotoSchema>;
export type GalleryPhoto = typeof galleryPhotos.$inferSelect;

export const insertCollectorSchema = createInsertSchema(collectors).omit({
  id: true,
  createdAt: true,
});
export type InsertCollector = z.infer<typeof insertCollectorSchema>;
export type Collector = typeof collectors.$inferSelect;

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

/**
 * BLOG POSTS — articles the Career OS drafts from real evidence, and Ani publishes.
 *
 * Stored in the database rather than as files in the repo, for one decisive reason: a
 * file-backed post needs a commit and a deploy per article, which makes writing a
 * release. Rows mean the agent can prepare a DRAFT through the authenticated API, Ani
 * approves it, and it is live — the same shape the artworks CMS already has.
 *
 * `status` is the whole safety model. Nothing an agent writes is public until a human
 * moves it to `published`; the public API only ever serves published rows.
 */
export const blogPosts = pgTable("blog_posts", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  /** One-sentence summary — used for the index card, meta description and OG. */
  excerpt: text("excerpt").notNull(),
  /** Markdown. Rendered server-side into the prerendered HTML so it is indexable. */
  body: text("body").notNull(),
  /** draft | published — public routes serve `published` only. */
  status: text("status").notNull().default("draft"),
  /** Where the idea came from, in the owner's words: a real search query, an artwork,
   *  an AI-visibility gap. Kept so a post can always answer "why was this written?". */
  sourceNote: text("source_note"),
  /** The evidence the article was grounded in — search queries, artwork ids, page URLs.
   *  Never prose the model invented; the provenance the quality gate can inspect. */
  evidence: text("evidence").array(),
  /** Optional hero image (an absolute URL, or /img/artwork/<id>/0 for one of her works). */
  coverImage: text("cover_image"),
  /** Set when it actually went public — distinct from createdAt, which is when drafted.
   *  Stamped exactly once: a moving publication date silently moves the window every
   *  "did this work?" question is asked over. */
  publishedAt: timestamp("published_at"),
  /** WHO drafted this: "manual" (Ani, in the admin) or "career_os" (the agent). Shown in
   *  the admin list so she always knows what she is looking at, and used server-side to
   *  stop the agent editing anything but its own drafts. */
  origin: text("origin").notNull().default("manual"),
  /** THE MEASUREMENT CONTRACT — filled when an agent drafts from a real decision, so a
   *  published article can later be connected to the reasoning that produced it. Without
   *  these, an article is a thing that appeared, and no outcome can be attributed to it.
   *  `decisionRef` is the Career OS action/recommendation id. */
  decisionRef: text("decision_ref"),
  /** What publishing this is expected to move, chosen BEFORE it goes live, never after. */
  expectedOutcome: text("expected_outcome"),
  /** How long to wait before judging it, in days. 28 matches the GSC reporting window. */
  measurementHorizonDays: integer("measurement_horizon_days"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  slugUnique: uniqueIndex("blog_posts_slug_unique").on(t.slug),
}));

export const insertBlogPostSchema = createInsertSchema(blogPosts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBlogPost = z.infer<typeof insertBlogPostSchema>;
export type BlogPost = typeof blogPosts.$inferSelect;
