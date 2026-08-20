import { pgTable, text, serial, integer, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
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
  /**
   * The description she wrote for the work on its marketplace listing, ingested as SOURCE
   * MATERIAL. Deliberately separate from `description`, which is the public copy on this
   * site: overwriting that would change what her site says without her deciding to. This
   * field exists so a claim about a work — including a derived category — can be traced to
   * a sentence she actually wrote.
   */
  sourceDescription: text("source_description"),
  /** Where `sourceDescription` came from, e.g. "singulart". Provenance, not decoration. */
  sourceDescriptionProvider: text("source_description_provider"),
  /**
   * Categories the source description EXPLICITLY states — never inferred from a title or
   * from what the picture might show. Empty is the correct and common answer; a wrong tag
   * silently changes which works an article may cite as evidence.
   */
  derivedCategories: text("derived_categories").array(),

  // ── DIRECT WEBSITE SALE ──────────────────────────────────────────────────────────────
  //
  // SEPARATE FROM `price` ON PURPOSE, and the separation is the whole point.
  //
  // `price` above is the MARKETPLACE figure, imported from Singulart. It is a different
  // number for a different channel — it carries a gallery's commission, it is denominated by
  // their listing, and 19 of her 54 rows carry 0 because the work was never listed. Reusing
  // it as the website price would publish a wrong number for a third of the catalogue and
  // would mean an edit in one channel silently repricing the other. Nothing below is derived
  // from it and nothing below writes to it.
  //
  // Minor units (cents), because Stripe charges in minor units and a float cannot hold 2420.50
  // exactly. `price` stays an integer of whole marketplace units; the two never convert.

  /** The master switch. Off means the work is not for sale here, whatever else is set. */
  directSaleEnabled: boolean("direct_sale_enabled").default(false),
  /** What she charges on her own site, in minor units. Null means unpriced, never free. */
  websitePriceMinor: integer("website_price_minor"),
  /** ISO-4217. EUR unless she chooses otherwise per work. */
  websiteCurrency: text("website_currency").default("EUR"),
  /** Whether this work may be shipped at all. A work she will only hand over in person
   *  can be priced and still not shippable. */
  shippingEnabled: boolean("shipping_enabled").default(true),
  /** A flat shipping figure she has set by hand, minor units, any destination. Beats the
   *  estimator and is never labelled "estimated". */
  shippingOverrideMinor: integer("shipping_override_minor"),
  /** Per-country overrides as JSON, e.g. {"DE":19000}. Beats the flat override. Kept as
   *  text rather than jsonb so the boot self-heal can add it to any Postgres without a type
   *  migration; parsed and validated on read. */
  shippingDestinationOverrides: text("shipping_destination_overrides"),
  /** Crated depth for THIS work, cm, when the default crate is wrong for it. */
  packedDepthCm: integer("packed_depth_cm"),
  /** Padding added to width and height for THIS work, cm. */
  packingMarginCm: integer("packing_margin_cm"),
  /** Anything she needs to remember when packing it — "ships unstretched", "frame is loose". */
  fulfilmentNotes: text("fulfilment_notes"),

  // ── COMMITMENTS ──────────────────────────────────────────────────────────────────────
  //
  // A work can be technically available and still not hers to sell: promised to a gallery for
  // a show, held for a collector who asked for first refusal.
  //
  // THE NAMES AND SEMANTICS ARE BORROWED DELIBERATELY, not invented. The separate
  // ani-muradyan-portfolio project already models exactly this as
  // `hasCommitment` + `commitment { type, details, until }`, and that is the vocabulary she
  // already uses. Matching it means a future reconciliation of the two systems is a copy
  // rather than a translation — and means this is not a second, competing idea of what a
  // commitment is.
  //
  // NOT COPIED: `artistPrice` and `retailPrice`. Those are private internal figures belonging
  // to that project's own commercial workflow. Duplicating them here would create exactly the
  // parallel pricing model that must not exist — the website sale price is `websitePriceMinor`
  // and nothing else.
  hasCommitment: boolean("has_commitment").default(false),
  /** gallery | collector | other — free text, to stay compatible with the other system. */
  commitmentType: text("commitment_type"),
  commitmentDetails: text("commitment_details"),
  /** ISO date. A commitment past this date no longer blocks a sale. Blank means open-ended,
   *  which blocks until she clears it — the safe reading of "promised, no end date". */
  commitmentUntil: text("commitment_until"),

  // ── CHECKOUT RESERVATION ─────────────────────────────────────────────────────────────
  //
  // The unique-original guard. `reservedUntil` in the FUTURE means a checkout is holding this
  // work; the conditional UPDATE that sets it is what stops two people buying one painting
  // (see server/commerce/reservation.ts). `availability` is NOT set to "sold" here — a person
  // who opens checkout and wanders off must not mark a painting sold.
  /** When the current hold lapses. Past or null means nobody holds it. */
  reservedUntil: timestamp("reserved_until"),
  /** Which order holds it, so expiry and payment can both find their own reservation. */
  reservedByOrderId: integer("reserved_by_order_id"),
}, (t) => ({
  // Production has a plain UNIQUE INDEX named `artworks_seo_slug_unique` (created
  // outside Drizzle). Declaring it here as a uniqueIndex — NOT `.unique()` on the
  // column, which Drizzle emits as a CONSTRAINT — matches prod's exact form and
  // stops the post-merge `db:push` from dropping it out of the dev DB, keeping
  // the dev↔prod schemas identical so deploys generate no seo_slug migration.
  // Postgres allows multiple NULLs in a unique index and routes.ts stores blank
  // seoSlug as NULL, so this never blocks inserts.
  seoSlugUnique: uniqueIndex("artworks_seo_slug_unique").on(t.seoSlug),
  // THE SWEEPER'S INDEX, declared here because the boot DDL alone is not enough.
  //
  // It was created by ADD-COLUMN-style boot DDL and nowhere else, so drizzle-kit saw an index
  // in the database that the schema did not know about and DROPPED it on every push —
  // silently, and verifiably: created, pushed, gone. The reservation sweeper scans
  // `reserved_until <= now()` every minute, so losing it costs a sequential scan of the whole
  // catalogue on a timer.
  reservedUntilIdx: index("artworks_reserved_until_idx").on(t.reservedUntil),
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
  // SYSTEM-OWNED, and therefore not writable through the artwork editor.
  //
  // These two are the unique-original guard. They are set by the conditional UPDATE in
  // server/commerce/reservation.ts and cleared by payment or expiry. Leaving them in the
  // admin's accepted shape would mean a save on an unrelated field could release a hold that
  // a live checkout is relying on — which is precisely the race the guard exists to prevent.
  reservedUntil: true,
  reservedByOrderId: true,
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
  /** Optional hero image. Either an upload path from the site's existing image pipeline
   *  ("/uploads/x.webp", via POST /api/upload) or a reference to one of her own paintings
   *  ("/img/artwork/<id>/0"). No separate media system: both forms are already served. */
  coverImage: text("cover_image"),
  /** What the image shows, for people who cannot see it. Stored beside the image rather
   *  than derived from the title, because "the article's title" is rarely a description of
   *  the picture — and an empty alt is better than a wrong one. */
  coverImageAlt: text("cover_image_alt"),
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

// ─────────────────────────────────────────────────────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * WHAT SOMEBODY BOUGHT, AND WHAT IT COST THEM ON THE DAY.
 *
 * The snapshot columns are not duplication. She will reprice a work, adjust her packing
 * defaults, and change a shipping tariff — and none of that may retroactively rewrite what a
 * buyer was charged in August. So the price, the currency, the shipping figure, the
 * destination and the parcel calculation are all COPIED here at checkout and never read back
 * from `artworks` again. An order is a historical fact; the artwork row is a current one.
 *
 * `artworkId` is kept alongside the snapshot so fulfilment can still find the painting, but
 * it is deliberately NOT a foreign key with a cascade: deleting an artwork must not delete
 * the record that somebody paid for it.
 *
 * PRINTS LATER (PART 33). The line is `artwork_id` + `item_type`, defaulted to "artwork".
 * A print order adds a row with `item_type: "print"` and its own snapshot; nothing about
 * originals has to move for that to happen.
 */
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  /** Human-facing reference, e.g. AM-2026-0007. Shown to the buyer; never the raw id. */
  reference: text("reference").notNull(),

  status: text("status").notNull().default("pending"),
  paymentStatus: text("payment_status").notNull().default("unpaid"),

  // ── the buyer ──
  buyerName: text("buyer_name"),
  buyerEmail: text("buyer_email"),
  buyerPhone: text("buyer_phone"),

  // ── where it goes ──
  shipCountry: text("ship_country"),
  shipAddress1: text("ship_address1"),
  shipAddress2: text("ship_address2"),
  shipCity: text("ship_city"),
  shipRegion: text("ship_region"),
  shipPostalCode: text("ship_postal_code"),

  // ── what was bought, as it stood at purchase time ──
  itemType: text("item_type").notNull().default("artwork"),
  artworkId: integer("artwork_id"),
  /** Title, dimensions, medium, year, image — so an order still reads correctly after edits. */
  artworkSnapshot: text("artwork_snapshot"),
  itemPriceMinor: integer("item_price_minor"),
  currency: text("currency").notNull().default("EUR"),
  shippingMinor: integer("shipping_minor"),
  totalMinor: integer("total_minor"),
  /** How the shipping figure was reached — the estimator's own provenance string, or the
   *  fact that a human set it. An order must be able to explain its shipping line. */
  shippingBasis: text("shipping_basis"),
  /** Packed dimensions, chargeable weight and the tariff breakdown, as JSON. */
  shippingCalculation: text("shipping_calculation"),

  // ── Stripe, for reconciliation ──
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),

  // ── the reservation this order holds ──
  reservedAt: timestamp("reserved_at"),
  reservationExpiresAt: timestamp("reservation_expires_at"),
  paidAt: timestamp("paid_at"),

  // ── fulfilment ──
  shippingCarrier: text("shipping_carrier"),
  trackingNumber: text("tracking_number"),
  shippedAt: timestamp("shipped_at"),
  deliveredAt: timestamp("delivered_at"),

  /** Where the buyer came from, when the page knew — utm_* and the landing path. JSON.
   *  Kept so search and image traffic can eventually be judged against sales, not clicks. */
  attribution: text("attribution"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  referenceUnique: uniqueIndex("orders_reference_unique").on(t.reference),
  // PARTIAL, matching the boot DDL exactly. Most orders have no session id until Stripe is
  // called, and a plain unique index would be fine in Postgres (it permits many NULLs) — but
  // the DDL writes `WHERE stripe_checkout_session_id IS NOT NULL` and a declaration that says
  // something different is a drift waiting to be "corrected" by a future drizzle-kit that
  // does diff index predicates. Declared as it actually is.
  sessionUnique: uniqueIndex("orders_stripe_session_unique")
    .on(t.stripeCheckoutSessionId)
    .where(sql`${t.stripeCheckoutSessionId} IS NOT NULL`),
}));

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

/**
 * EVERY STRIPE EVENT WE HAVE ALREADY ACTED ON.
 *
 * Stripe retries. It also delivers out of order, and it delivers the same event twice when a
 * response is slow. The webhook is made idempotent by INSERTing the event id here inside the
 * same work as the state change: the unique index means the second delivery loses the race
 * and is acknowledged without doing anything. That is cheaper and far more reliable than
 * trying to detect duplication from the order's own state.
 */
export const stripeEvents = pgTable("stripe_events", {
  id: serial("id").primaryKey(),
  eventId: text("event_id").notNull(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at").defaultNow(),
}, (t) => ({
  eventUnique: uniqueIndex("stripe_events_event_id_unique").on(t.eventId),
}));
export type StripeEvent = typeof stripeEvents.$inferSelect;
