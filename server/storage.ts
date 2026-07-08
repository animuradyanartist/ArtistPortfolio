import { users, artworks, prints, exhibitions, homepageSettings, artistBio, feedback, contactSettings, galleryPhotos, type User, type InsertUser, type Artwork, type InsertArtwork, type Print, type InsertPrint, type Exhibition, type InsertExhibition, type HomepageSettings, type InsertHomepageSettings, type ArtistBio, type InsertArtistBio, type Feedback, type InsertFeedback, type ContactSettings, type InsertContactSettings, type GalleryPhoto, type InsertGalleryPhoto } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Artworks
  getAllArtworks(): Promise<Artwork[]>;
  getArtwork(id: number): Promise<Artwork | undefined>;
  getArtworkBySeoSlug(seoSlug: string): Promise<Artwork | undefined>;
  createArtwork(artwork: InsertArtwork): Promise<Artwork>;
  updateArtwork(id: number, artwork: Partial<InsertArtwork>): Promise<Artwork | undefined>;
  deleteArtwork(id: number): Promise<boolean>;
  getFeaturedArtworks(): Promise<Artwork[]>;
  reorderArtwork(id: number, direction: 'up' | 'down'): Promise<Artwork[]>;
  reorderArtworkDrag(sourceId: number, targetId: number): Promise<Artwork[]>;

  // Prints
  getAllPrints(): Promise<Print[]>;
  getPrint(id: number): Promise<Print | undefined>;
  createPrint(print: InsertPrint): Promise<Print>;
  updatePrint(id: number, print: Partial<InsertPrint>): Promise<Print | undefined>;
  deletePrint(id: number): Promise<boolean>;
  getFeaturedPrints(): Promise<Print[]>;
  reorderPrint(id: number, direction: 'up' | 'down'): Promise<Print[]>;

  // Exhibitions
  getAllExhibitions(): Promise<Exhibition[]>;
  getExhibition(id: number): Promise<Exhibition | undefined>;
  createExhibition(exhibition: InsertExhibition): Promise<Exhibition>;
  updateExhibition(id: number, exhibition: Partial<InsertExhibition>): Promise<Exhibition | undefined>;
  deleteExhibition(id: number): Promise<boolean>;
  getExhibitionsByType(type: string): Promise<Exhibition[]>;

  // Homepage Settings
  getHomepageSettings(): Promise<HomepageSettings | undefined>;
  updateHomepageSettings(settings: InsertHomepageSettings): Promise<HomepageSettings>;

  // Artist Bio
  getArtistBio(): Promise<ArtistBio | undefined>;
  updateArtistBio(bio: InsertArtistBio): Promise<ArtistBio>;

  // Feedback
  createFeedback(feedback: InsertFeedback): Promise<Feedback>;
  getAllFeedback(): Promise<Feedback[]>;

  // Contact Settings
  getContactSettings(): Promise<ContactSettings | undefined>;
  updateContactSettings(settings: InsertContactSettings): Promise<ContactSettings>;

  // Gallery Photos
  getAllGalleryPhotos(): Promise<GalleryPhoto[]>;
  getGalleryPhoto(id: number): Promise<GalleryPhoto | undefined>;
  createGalleryPhoto(photo: InsertGalleryPhoto): Promise<GalleryPhoto>;
  updateGalleryPhoto(id: number, photo: Partial<InsertGalleryPhoto>): Promise<GalleryPhoto | undefined>;
  deleteGalleryPhoto(id: number): Promise<boolean>;
  getFeaturedGalleryPhotos(): Promise<GalleryPhoto[]>;
  reorderGalleryPhoto(id: number, direction: 'up' | 'down'): Promise<GalleryPhoto[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private artworks: Map<number, Artwork>;
  private prints: Map<number, Print>;
  private exhibitions: Map<number, Exhibition>;
  private homepageSettings: HomepageSettings | undefined;
  private artistBio: ArtistBio | undefined;
  private contactSettings: ContactSettings | undefined;
  private feedbacks: Map<number, Feedback>;
  private galleryPhotos: Map<number, GalleryPhoto>;
  private currentUserId: number;
  private currentArtworkId: number;
  private currentPrintId: number;
  private currentExhibitionId: number;
  private currentFeedbackId: number;
  private currentGalleryPhotoId: number;

  constructor() {
    this.users = new Map();
    this.artworks = new Map();
    this.prints = new Map();
    this.exhibitions = new Map();
    this.feedbacks = new Map();
    this.galleryPhotos = new Map();
    this.currentUserId = 1;
    this.currentArtworkId = 1;
    this.currentPrintId = 1;
    this.currentExhibitionId = 1;
    this.currentFeedbackId = 1;
    this.currentGalleryPhotoId = 1;
    
    // Initialize with default homepage settings
    this.homepageSettings = {
      id: 1,
      heroQuote: "Art must bring hope into people's lives.",
      heroImage: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&h=1080",
      featuredArtworkIds: ["1", "2", "3"]
    };

    // Initialize with default artist bio
    this.artistBio = {
      id: 1,
      title: "About Ani Muradyan",
      description: "Ani Muradyan is a contemporary abstract realism artist whose work explores the intersection of emotion and form through vibrant compositions and thoughtful use of color.",
      image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600",
      statement: "My art seeks to capture the essence of human experience through abstract forms that speak to the soul.",
      education: "MFA in Fine Arts, California College of the Arts",
      awards: "Best Emerging Artist 2023, Contemporary Art Society"
    };

    // Initialize with default contact settings
    this.contactSettings = {
      id: 1,
      instagramUrl: "https://www.instagram.com/animoria.art/",
      saatchiUrl: "https://www.saatchiart.com/account/profile/1980379",
      email: "animuradyan.artist@gmail.com",
      location: "Yerevan, Armenia",
      instagramHandle: "@animoria.art"
    };

    // Initialize with sample data
    this.initializeSampleData();

    // If a snapshot of the live site exists (scripts/snapshot-preview-data.mjs),
    // replace the stock samples with the real portfolio content.
    this.loadPreviewSnapshot();
  }

  private loadPreviewSnapshot() {
    try {
      const file = path.join(process.cwd(), "server/preview-data.json");
      if (!fs.existsSync(file)) return;
      const snap = JSON.parse(fs.readFileSync(file, "utf-8"));

      if (Array.isArray(snap.artworks) && snap.artworks.length > 0) {
        this.artworks = new Map(snap.artworks.map((a: Artwork) => [a.id, a]));
        this.currentArtworkId = Math.max(...snap.artworks.map((a: Artwork) => a.id)) + 1;
      }
      if (Array.isArray(snap.galleryPhotos) && snap.galleryPhotos.length > 0) {
        this.galleryPhotos = new Map(snap.galleryPhotos.map((g: GalleryPhoto) => [g.id, g]));
        this.currentGalleryPhotoId = Math.max(...snap.galleryPhotos.map((g: GalleryPhoto) => g.id)) + 1;
      }
      if (Array.isArray(snap.exhibitions) && snap.exhibitions.length > 0) {
        this.exhibitions = new Map(snap.exhibitions.map((e: Exhibition) => [e.id, e]));
        this.currentExhibitionId = Math.max(...snap.exhibitions.map((e: Exhibition) => e.id)) + 1;
      }
      if (Array.isArray(snap.prints) && snap.prints.length > 0) {
        this.prints = new Map(snap.prints.map((p: Print) => [p.id, p]));
        this.currentPrintId = Math.max(...snap.prints.map((p: Print) => p.id)) + 1;
      }
      if (snap.homepageSettings) this.homepageSettings = snap.homepageSettings;
      if (snap.artistBio) this.artistBio = snap.artistBio;
      if (snap.contactSettings) this.contactSettings = snap.contactSettings;

      console.log(
        `[preview] Loaded live-site snapshot (${snap.snapshotFrom || "unknown"}): ` +
          `${this.artworks.size} artworks, ${this.galleryPhotos.size} gallery photos, ` +
          `${this.exhibitions.size} exhibitions, ${this.prints.size} prints`
      );
    } catch (err) {
      console.warn("[preview] Failed to load preview snapshot, using stock samples:", err);
    }
  }

  private initializeSampleData() {
    // Sample artworks
    const sampleArtworks: Artwork[] = [
      {
        id: 1,
        title: "Whispers of Dawn",
        description: "A meditation on hope and renewal, capturing the gentle awakening of a new day through abstract forms and warm tones.",
        medium: "Oil on canvas",
        dimensions: "40\" × 30\"",
        year: 2024,
        price: 2800,
        images: ["https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600"],
        type: "oil",
        size: "medium",
        availability: "available",
        saatchiUrl: "https://saatchiart.com",
        buyLink: null,
        featured: true,
        position: 0,
        availableForPrint: false,
        printSizes: null,
        preferredPrintMaterial: null,
        singulartId: null,
        source: "manual",
      },
      {
        id: 2,
        title: "Geometric Harmony",
        description: "An exploration of balance and rhythm through geometric abstraction, demonstrating the mathematical beauty found in nature.",
        medium: "Acrylic on canvas",
        dimensions: "36\" × 24\"",
        year: 2024,
        price: 2200,
        images: ["https://images.unsplash.com/photo-1549490349-8643362247b5?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600"],
        type: "acrylic",
        size: "medium",
        availability: "available",
        saatchiUrl: "https://saatchiart.com",
        buyLink: null,
        featured: true,
        position: 1,
        availableForPrint: false,
        printSizes: null,
        preferredPrintMaterial: null,
        singulartId: null,
        source: "manual",
      },
      {
        id: 3,
        title: "Emotional Landscape",
        description: "A journey through inner terrain, where color and texture merge to create an emotional topography of the human experience.",
        medium: "Mixed media on canvas",
        dimensions: "48\" × 36\"",
        year: 2023,
        price: 3500,
        images: ["https://images.unsplash.com/photo-1541961017774-22349e4a1262?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600"],
        type: "mixed",
        size: "large",
        availability: "available",
        saatchiUrl: "https://saatchiart.com",
        buyLink: null,
        featured: true,
        position: 2,
        availableForPrint: false,
        printSizes: null,
        preferredPrintMaterial: null,
        singulartId: null,
        source: "manual",
      },
      {
        id: 4,
        title: "Urban Reflections",
        description: "A reflection on city life and modern existence, rendered through dynamic brushstrokes and urban color palettes.",
        medium: "Oil on canvas",
        dimensions: "30\" × 24\"",
        year: 2023,
        price: 1800,
        images: ["https://images.unsplash.com/photo-1578321272176-b7bbc0679853?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600"],
        type: "oil",
        size: "small",
        availability: "sold",
        saatchiUrl: "https://saatchiart.com",
        buyLink: null,
        featured: false,
        position: 3,
        availableForPrint: false,
        printSizes: null,
        preferredPrintMaterial: null,
        singulartId: null,
        source: "manual",
      }
    ];

    sampleArtworks.forEach(artwork => {
      this.artworks.set(artwork.id, artwork);
      if (artwork.id >= this.currentArtworkId) {
        this.currentArtworkId = artwork.id + 1;
      }
    });

    // Sample exhibitions
    const sampleExhibitions: Exhibition[] = [
      {
        id: 1,
        title: "Whispers of the Soul",
        type: "solo",
        venue: "Modern Art Gallery",
        location: "San Francisco, CA",
        year: 2024,
        startDate: "2024-03-15",
        endDate: "2024-04-30",
        description: "A solo exhibition featuring Ani's latest abstract realism works exploring themes of inner reflection and emotional landscapes.",
        image: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600"
      }
    ];

    sampleExhibitions.forEach(exhibition => {
      this.exhibitions.set(exhibition.id, exhibition);
      if (exhibition.id >= this.currentExhibitionId) {
        this.currentExhibitionId = exhibition.id + 1;
      }
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getAllArtworks(): Promise<Artwork[]> {
    return Array.from(this.artworks.values());
  }

  async getArtwork(id: number): Promise<Artwork | undefined> {
    return this.artworks.get(id);
  }

  async getArtworkBySeoSlug(seoSlug: string): Promise<Artwork | undefined> {
    return Array.from(this.artworks.values()).find(a => a.seoSlug === seoSlug);
  }

  async createArtwork(insertArtwork: InsertArtwork): Promise<Artwork> {
    const id = this.currentArtworkId++;
    const artwork: Artwork = {
      ...insertArtwork,
      id,
      saatchiUrl: insertArtwork.saatchiUrl || null,
      buyLink: insertArtwork.buyLink || null,
      featured: insertArtwork.featured || false,
      position: insertArtwork.position ?? 0,
      availableForPrint: insertArtwork.availableForPrint ?? false,
      printSizes: insertArtwork.printSizes ?? null,
      preferredPrintMaterial: insertArtwork.preferredPrintMaterial ?? "paper",
      singulartId: insertArtwork.singulartId ?? null,
      source: insertArtwork.source ?? "manual",
    };
    this.artworks.set(id, artwork);
    return artwork;
  }

  async updateArtwork(id: number, updateData: Partial<InsertArtwork>): Promise<Artwork | undefined> {
    const existing = this.artworks.get(id);
    if (!existing) return undefined;

    const updated: Artwork = { 
      ...existing, 
      ...updateData,
      id,
      saatchiUrl: updateData.saatchiUrl !== undefined ? updateData.saatchiUrl : existing.saatchiUrl,
      buyLink: updateData.buyLink !== undefined ? updateData.buyLink : existing.buyLink,
      featured: updateData.featured !== undefined ? updateData.featured : existing.featured
    };
    this.artworks.set(id, updated);
    return updated;
  }

  async deleteArtwork(id: number): Promise<boolean> {
    return this.artworks.delete(id);
  }

  async getFeaturedArtworks(): Promise<Artwork[]> {
    return Array.from(this.artworks.values()).filter(artwork => artwork.featured);
  }

  async reorderArtwork(id: number, direction: 'up' | 'down'): Promise<Artwork[]> {
    const artworksList = Array.from(this.artworks.values()).sort((a, b) => (a.position || 0) - (b.position || 0));
    const currentIndex = artworksList.findIndex(artwork => artwork.id === id);
    
    if (currentIndex === -1) {
      return artworksList;
    }
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    if (newIndex < 0 || newIndex >= artworksList.length) {
      return artworksList;
    }
    
    // Swap positions
    const currentArtwork = artworksList[currentIndex];
    const targetArtwork = artworksList[newIndex];
    
    const tempPosition = currentArtwork.position || 0;
    currentArtwork.position = targetArtwork.position || 0;
    targetArtwork.position = tempPosition;
    
    this.artworks.set(currentArtwork.id, currentArtwork);
    this.artworks.set(targetArtwork.id, targetArtwork);
    
    return Array.from(this.artworks.values()).sort((a, b) => (a.position || 0) - (b.position || 0));
  }

  async reorderArtworkDrag(sourceId: number, targetId: number): Promise<Artwork[]> {
    const sourceArtwork = this.artworks.get(sourceId);
    const targetArtwork = this.artworks.get(targetId);
    
    if (!sourceArtwork || !targetArtwork) {
      return Array.from(this.artworks.values()).sort((a, b) => (a.position || 0) - (b.position || 0));
    }
    
    // Get all artworks sorted by position
    const artworksList = Array.from(this.artworks.values()).sort((a, b) => (a.position || 0) - (b.position || 0));
    const sourceIndex = artworksList.findIndex(artwork => artwork.id === sourceId);
    const targetIndex = artworksList.findIndex(artwork => artwork.id === targetId);
    
    if (sourceIndex === -1 || targetIndex === -1) {
      return artworksList;
    }
    
    // Remove source from its current position
    const [movedArtwork] = artworksList.splice(sourceIndex, 1);
    
    // Insert at target position
    artworksList.splice(targetIndex, 0, movedArtwork);
    
    // Update positions for all artworks
    artworksList.forEach((artwork, index) => {
      artwork.position = index;
      this.artworks.set(artwork.id, artwork);
    });
    
    return artworksList;
  }

  // Prints methods
  async getAllPrints(): Promise<Print[]> {
    return Array.from(this.prints.values());
  }

  async getPrint(id: number): Promise<Print | undefined> {
    return this.prints.get(id);
  }

  async createPrint(insertPrint: InsertPrint): Promise<Print> {
    const id = this.currentPrintId++;
    const print: Print = { 
      ...insertPrint, 
      id,
      status: insertPrint.status || "active",
      featured: insertPrint.featured || false,
      position: insertPrint.position ?? 0,
      artworkId: insertPrint.artworkId ?? null,
      preferredMaterial: insertPrint.preferredMaterial || "paper",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.prints.set(id, print);
    return print;
  }

  async updatePrint(id: number, updateData: Partial<InsertPrint>): Promise<Print | undefined> {
    const existing = this.prints.get(id);
    if (!existing) return undefined;

    const updated: Print = { 
      ...existing, 
      ...updateData,
      id,
      updatedAt: new Date()
    };
    this.prints.set(id, updated);
    return updated;
  }

  async deletePrint(id: number): Promise<boolean> {
    return this.prints.delete(id);
  }

  async getFeaturedPrints(): Promise<Print[]> {
    return Array.from(this.prints.values()).filter(print => print.featured);
  }

  async reorderPrint(id: number, direction: 'up' | 'down'): Promise<Print[]> {
    const printsList = Array.from(this.prints.values()).sort((a, b) => (a.position || 0) - (b.position || 0));
    const currentIndex = printsList.findIndex(print => print.id === id);
    
    if (currentIndex === -1) {
      return printsList;
    }
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    if (newIndex < 0 || newIndex >= printsList.length) {
      return printsList;
    }
    
    // Swap positions
    const currentPrint = printsList[currentIndex];
    const targetPrint = printsList[newIndex];
    
    const tempPosition = currentPrint.position || 0;
    currentPrint.position = targetPrint.position || 0;
    targetPrint.position = tempPosition;
    
    this.prints.set(currentPrint.id, currentPrint);
    this.prints.set(targetPrint.id, targetPrint);
    
    return printsList;
  }

  async getAllExhibitions(): Promise<Exhibition[]> {
    return Array.from(this.exhibitions.values());
  }

  async getExhibition(id: number): Promise<Exhibition | undefined> {
    return this.exhibitions.get(id);
  }

  async createExhibition(insertExhibition: InsertExhibition): Promise<Exhibition> {
    const id = this.currentExhibitionId++;
    const exhibition: Exhibition = { 
      ...insertExhibition, 
      id,
      description: insertExhibition.description || null,
      startDate: insertExhibition.startDate || null,
      endDate: insertExhibition.endDate || null,
      image: insertExhibition.image || null
    };
    this.exhibitions.set(id, exhibition);
    return exhibition;
  }

  async updateExhibition(id: number, updateData: Partial<InsertExhibition>): Promise<Exhibition | undefined> {
    const existing = this.exhibitions.get(id);
    if (!existing) return undefined;

    const updated: Exhibition = { 
      ...existing, 
      ...updateData,
      id,
      description: updateData.description !== undefined ? updateData.description : existing.description,
      startDate: updateData.startDate !== undefined ? updateData.startDate : existing.startDate,
      endDate: updateData.endDate !== undefined ? updateData.endDate : existing.endDate,
      image: updateData.image !== undefined ? updateData.image : existing.image
    };
    this.exhibitions.set(id, updated);
    return updated;
  }

  async deleteExhibition(id: number): Promise<boolean> {
    return this.exhibitions.delete(id);
  }

  async getExhibitionsByType(type: string): Promise<Exhibition[]> {
    return Array.from(this.exhibitions.values()).filter(exhibition => exhibition.type === type);
  }

  async getHomepageSettings(): Promise<HomepageSettings | undefined> {
    return this.homepageSettings;
  }

  async updateHomepageSettings(settings: InsertHomepageSettings): Promise<HomepageSettings> {
    this.homepageSettings = { ...settings, id: 1 };
    return this.homepageSettings;
  }

  async getArtistBio(): Promise<ArtistBio | undefined> {
    return this.artistBio;
  }

  async updateArtistBio(bio: InsertArtistBio): Promise<ArtistBio> {
    this.artistBio = { 
      ...bio, 
      id: 1,
      statement: bio.statement ?? null,
      education: bio.education ?? null,
      awards: bio.awards ?? null
    };
    return this.artistBio;
  }

  async createFeedback(insertFeedback: InsertFeedback): Promise<Feedback> {
    const id = this.currentFeedbackId++;
    const feedback: Feedback = {
      ...insertFeedback,
      id,
      createdAt: new Date(),
    };
    this.feedbacks.set(id, feedback);
    return feedback;
  }

  async getAllFeedback(): Promise<Feedback[]> {
    return Array.from(this.feedbacks.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getContactSettings(): Promise<ContactSettings | undefined> {
    return this.contactSettings;
  }

  async updateContactSettings(settings: InsertContactSettings): Promise<ContactSettings> {
    const updated: ContactSettings = {
      id: this.contactSettings?.id || 1,
      ...settings
    };
    this.contactSettings = updated;
    return updated;
  }

  // Gallery Photos
  async getAllGalleryPhotos(): Promise<GalleryPhoto[]> {
    return Array.from(this.galleryPhotos.values()).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }

  async getGalleryPhoto(id: number): Promise<GalleryPhoto | undefined> {
    return this.galleryPhotos.get(id);
  }

  async createGalleryPhoto(photo: InsertGalleryPhoto): Promise<GalleryPhoto> {
    const newPhoto: GalleryPhoto = {
      id: this.currentGalleryPhotoId++,
      title: photo.title,
      image: photo.image,
      exhibitionName: photo.exhibitionName ?? null,
      location: photo.location ?? null,
      year: photo.year ?? null,
      featured: photo.featured ?? false,
      position: photo.position ?? 0,
      createdAt: new Date()
    };
    this.galleryPhotos.set(newPhoto.id, newPhoto);
    return newPhoto;
  }

  async updateGalleryPhoto(id: number, photo: Partial<InsertGalleryPhoto>): Promise<GalleryPhoto | undefined> {
    const existing = this.galleryPhotos.get(id);
    if (!existing) return undefined;
    
    const updated: GalleryPhoto = {
      ...existing,
      ...photo
    };
    this.galleryPhotos.set(id, updated);
    return updated;
  }

  async deleteGalleryPhoto(id: number): Promise<boolean> {
    return this.galleryPhotos.delete(id);
  }

  async getFeaturedGalleryPhotos(): Promise<GalleryPhoto[]> {
    return Array.from(this.galleryPhotos.values())
      .filter(photo => photo.featured)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }

  async reorderGalleryPhoto(id: number, direction: 'up' | 'down'): Promise<GalleryPhoto[]> {
    const photos = await this.getAllGalleryPhotos();
    const currentIndex = photos.findIndex(p => p.id === id);
    
    if (currentIndex === -1) return photos;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    if (newIndex < 0 || newIndex >= photos.length) return photos;
    
    // Swap positions
    const temp = photos[currentIndex].position;
    photos[currentIndex].position = photos[newIndex].position;
    photos[newIndex].position = temp;
    
    // Update in storage
    this.galleryPhotos.set(photos[currentIndex].id, photos[currentIndex]);
    this.galleryPhotos.set(photos[newIndex].id, photos[newIndex]);
    
    return this.getAllGalleryPhotos();
  }
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async getAllArtworks(): Promise<Artwork[]> {
    return await db.select().from(artworks).orderBy(artworks.position);
  }

  async getArtwork(id: number): Promise<Artwork | undefined> {
    const [artwork] = await db.select().from(artworks).where(eq(artworks.id, id));
    return artwork || undefined;
  }

  async getArtworkBySeoSlug(seoSlug: string): Promise<Artwork | undefined> {
    const [artwork] = await db.select().from(artworks).where(eq(artworks.seoSlug, seoSlug));
    return artwork || undefined;
  }

  async createArtwork(insertArtwork: InsertArtwork): Promise<Artwork> {
    const [artwork] = await db
      .insert(artworks)
      .values(insertArtwork)
      .returning();
    return artwork;
  }

  async updateArtwork(id: number, updateData: Partial<InsertArtwork>): Promise<Artwork | undefined> {
    const [artwork] = await db
      .update(artworks)
      .set(updateData)
      .where(eq(artworks.id, id))
      .returning();
    return artwork || undefined;
  }

  async deleteArtwork(id: number): Promise<boolean> {
    const result = await db.delete(artworks).where(eq(artworks.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getFeaturedArtworks(): Promise<Artwork[]> {
    return await db.select().from(artworks).where(eq(artworks.featured, true));
  }

  async reorderArtwork(id: number, direction: 'up' | 'down'): Promise<Artwork[]> {
    // Get all artworks ordered by position
    const allArtworks = await db.select().from(artworks).orderBy(artworks.position);
    const currentIndex = allArtworks.findIndex(artwork => artwork.id === id);
    
    if (currentIndex === -1) {
      throw new Error('Artwork not found');
    }
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    // Check if the move is valid
    if (newIndex < 0 || newIndex >= allArtworks.length) {
      return allArtworks; // Return unchanged if invalid move
    }
    
    // Swap positions
    const currentArtwork = allArtworks[currentIndex];
    const swapArtwork = allArtworks[newIndex];
    
    // Update positions in database
    await db.update(artworks)
      .set({ position: swapArtwork.position })
      .where(eq(artworks.id, currentArtwork.id));
    
    await db.update(artworks)
      .set({ position: currentArtwork.position })
      .where(eq(artworks.id, swapArtwork.id));
    
    // Return updated artwork list
    return await db.select().from(artworks).orderBy(artworks.position);
  }

  async reorderArtworkDrag(sourceId: number, targetId: number): Promise<Artwork[]> {
    // Get all artworks ordered by position
    const allArtworks = await db.select().from(artworks).orderBy(artworks.position);
    const sourceIndex = allArtworks.findIndex(artwork => artwork.id === sourceId);
    const targetIndex = allArtworks.findIndex(artwork => artwork.id === targetId);
    
    if (sourceIndex === -1 || targetIndex === -1) {
      return allArtworks;
    }
    
    // Remove source from its current position
    const [movedArtwork] = allArtworks.splice(sourceIndex, 1);
    
    // Insert at target position
    allArtworks.splice(targetIndex, 0, movedArtwork);
    
    // Update positions for all artworks in a transaction
    for (let i = 0; i < allArtworks.length; i++) {
      await db.update(artworks)
        .set({ position: i })
        .where(eq(artworks.id, allArtworks[i].id));
    }
    
    // Return updated artwork list
    return await db.select().from(artworks).orderBy(artworks.position);
  }

  // Prints methods
  async getAllPrints(): Promise<Print[]> {
    return await db.select().from(prints).orderBy(prints.position);
  }

  async getPrint(id: number): Promise<Print | undefined> {
    const [print] = await db.select().from(prints).where(eq(prints.id, id));
    return print || undefined;
  }

  async createPrint(insertPrint: InsertPrint): Promise<Print> {
    const [print] = await db
      .insert(prints)
      .values(insertPrint)
      .returning();
    return print;
  }

  async updatePrint(id: number, updateData: Partial<InsertPrint>): Promise<Print | undefined> {
    const [print] = await db
      .update(prints)
      .set(updateData)
      .where(eq(prints.id, id))
      .returning();
    return print || undefined;
  }

  async deletePrint(id: number): Promise<boolean> {
    const result = await db.delete(prints).where(eq(prints.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getFeaturedPrints(): Promise<Print[]> {
    return await db.select().from(prints).where(eq(prints.featured, true));
  }

  async reorderPrint(id: number, direction: 'up' | 'down'): Promise<Print[]> {
    // Get all prints ordered by position
    const allPrints = await db.select().from(prints).orderBy(prints.position);
    const currentIndex = allPrints.findIndex(print => print.id === id);
    
    if (currentIndex === -1) {
      throw new Error('Print not found');
    }
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    // Check if the move is valid
    if (newIndex < 0 || newIndex >= allPrints.length) {
      return allPrints; // Return unchanged if invalid move
    }
    
    // Swap positions
    const currentPrint = allPrints[currentIndex];
    const swapPrint = allPrints[newIndex];
    
    // Update positions in database
    await db.update(prints)
      .set({ position: swapPrint.position })
      .where(eq(prints.id, currentPrint.id));
    
    await db.update(prints)
      .set({ position: currentPrint.position })
      .where(eq(prints.id, swapPrint.id));
    
    // Return updated print list
    return await db.select().from(prints).orderBy(prints.position);
  }

  async getAllExhibitions(): Promise<Exhibition[]> {
    return await db.select().from(exhibitions);
  }

  async getExhibition(id: number): Promise<Exhibition | undefined> {
    const [exhibition] = await db.select().from(exhibitions).where(eq(exhibitions.id, id));
    return exhibition || undefined;
  }

  async createExhibition(insertExhibition: InsertExhibition): Promise<Exhibition> {
    const [exhibition] = await db
      .insert(exhibitions)
      .values(insertExhibition)
      .returning();
    return exhibition;
  }

  async updateExhibition(id: number, updateData: Partial<InsertExhibition>): Promise<Exhibition | undefined> {
    const [exhibition] = await db
      .update(exhibitions)
      .set(updateData)
      .where(eq(exhibitions.id, id))
      .returning();
    return exhibition || undefined;
  }

  async deleteExhibition(id: number): Promise<boolean> {
    const result = await db.delete(exhibitions).where(eq(exhibitions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getExhibitionsByType(type: string): Promise<Exhibition[]> {
    return await db.select().from(exhibitions).where(eq(exhibitions.type, type));
  }

  async getHomepageSettings(): Promise<HomepageSettings | undefined> {
    const [settings] = await db.select().from(homepageSettings).limit(1);
    return settings || undefined;
  }

  async updateHomepageSettings(settings: InsertHomepageSettings): Promise<HomepageSettings> {
    // First try to update existing record
    const [existing] = await db.select().from(homepageSettings).limit(1);
    
    if (existing) {
      const [updated] = await db
        .update(homepageSettings)
        .set(settings)
        .where(eq(homepageSettings.id, existing.id))
        .returning();
      return updated;
    } else {
      // Create new record if none exists
      const [created] = await db
        .insert(homepageSettings)
        .values(settings)
        .returning();
      return created;
    }
  }

  async getArtistBio(): Promise<ArtistBio | undefined> {
    const [bio] = await db.select().from(artistBio).limit(1);
    return bio || undefined;
  }

  async updateArtistBio(bio: InsertArtistBio): Promise<ArtistBio> {
    // First try to update existing record
    const [existing] = await db.select().from(artistBio).limit(1);
    
    if (existing) {
      const [updated] = await db
        .update(artistBio)
        .set(bio)
        .where(eq(artistBio.id, existing.id))
        .returning();
      return updated;
    } else {
      // Create new record if none exists
      const [created] = await db
        .insert(artistBio)
        .values(bio)
        .returning();
      return created;
    }
  }

  async createFeedback(insertFeedback: InsertFeedback): Promise<Feedback> {
    const [feedbackRecord] = await db
      .insert(feedback)
      .values(insertFeedback)
      .returning();
    return feedbackRecord;
  }

  async getAllFeedback(): Promise<Feedback[]> {
    return await db.select().from(feedback).orderBy(feedback.createdAt);
  }

  async getContactSettings(): Promise<ContactSettings | undefined> {
    const [settings] = await db.select().from(contactSettings).limit(1);
    return settings || undefined;
  }

  async updateContactSettings(settings: InsertContactSettings): Promise<ContactSettings> {
    // First try to update existing record
    const [existing] = await db.select().from(contactSettings).limit(1);
    
    if (existing) {
      const [updated] = await db
        .update(contactSettings)
        .set(settings)
        .where(eq(contactSettings.id, existing.id))
        .returning();
      return updated;
    } else {
      // Create new record if none exists
      const [created] = await db
        .insert(contactSettings)
        .values(settings)
        .returning();
      return created;
    }
  }

  // Gallery Photos
  async getAllGalleryPhotos(): Promise<GalleryPhoto[]> {
    return await db.select().from(galleryPhotos).orderBy(galleryPhotos.position);
  }

  async getGalleryPhoto(id: number): Promise<GalleryPhoto | undefined> {
    const [photo] = await db.select().from(galleryPhotos).where(eq(galleryPhotos.id, id));
    return photo || undefined;
  }

  async createGalleryPhoto(photo: InsertGalleryPhoto): Promise<GalleryPhoto> {
    const [created] = await db
      .insert(galleryPhotos)
      .values(photo)
      .returning();
    return created;
  }

  async updateGalleryPhoto(id: number, photo: Partial<InsertGalleryPhoto>): Promise<GalleryPhoto | undefined> {
    const [updated] = await db
      .update(galleryPhotos)
      .set(photo)
      .where(eq(galleryPhotos.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteGalleryPhoto(id: number): Promise<boolean> {
    const result = await db.delete(galleryPhotos).where(eq(galleryPhotos.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getFeaturedGalleryPhotos(): Promise<GalleryPhoto[]> {
    return await db
      .select()
      .from(galleryPhotos)
      .where(eq(galleryPhotos.featured, true))
      .orderBy(galleryPhotos.position);
  }

  async reorderGalleryPhoto(id: number, direction: 'up' | 'down'): Promise<GalleryPhoto[]> {
    const photos = await this.getAllGalleryPhotos();
    const currentIndex = photos.findIndex(p => p.id === id);
    
    if (currentIndex === -1) return photos;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    if (newIndex < 0 || newIndex >= photos.length) return photos;
    
    // Swap positions
    const tempPosition = photos[currentIndex].position;
    await db
      .update(galleryPhotos)
      .set({ position: photos[newIndex].position })
      .where(eq(galleryPhotos.id, photos[currentIndex].id));
    
    await db
      .update(galleryPhotos)
      .set({ position: tempPosition })
      .where(eq(galleryPhotos.id, photos[newIndex].id));
    
    return this.getAllGalleryPhotos();
  }
}

import { hasDatabase } from "./db";

// Local preview mode: no DATABASE_URL → in-memory sample data
export const storage: IStorage = hasDatabase ? new DatabaseStorage() : new MemStorage();