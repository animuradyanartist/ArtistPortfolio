import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
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
  description: text("description").notNull(),
  medium: text("medium").notNull(),
  dimensions: text("dimensions").notNull(),
  year: integer("year").notNull(),
  price: integer("price").notNull(),
  images: text("images").array().notNull(),
  type: text("type").notNull(), // oil, acrylic, mixed
  size: text("size").notNull(), // small, medium, large
  availability: text("availability").notNull(), // available, sold
  saatchiUrl: text("saatchi_url"),
  buyLink: text("buy_link"),
  featured: boolean("featured").default(false),
  position: integer("position").default(0),
  // Print-related fields
  availableForPrint: boolean("available_for_print").default(false),
  printSizes: text("print_sizes"), 
  preferredPrintMaterial: text("preferred_print_material"),
});

export const prints = pgTable("prints", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  images: text("images").array().notNull(),
  artworkId: integer("artwork_id"), // Optional reference to original artwork
  availableSizes: text("available_sizes").notNull(), // JSON string of {width, height, material, price?}[]
  preferredMaterial: text("preferred_material").notNull().default("paper"), // paper, canvas
  status: text("status").notNull().default("active"), // active, discontinued
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

export const galleryPhotos = pgTable('gallery_photos', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
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
