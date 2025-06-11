import { users, artworks, exhibitions, homepageSettings, artistBio, type User, type InsertUser, type Artwork, type InsertArtwork, type Exhibition, type InsertExhibition, type HomepageSettings, type InsertHomepageSettings, type ArtistBio, type InsertArtistBio } from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Artworks
  getAllArtworks(): Promise<Artwork[]>;
  getArtwork(id: number): Promise<Artwork | undefined>;
  createArtwork(artwork: InsertArtwork): Promise<Artwork>;
  updateArtwork(id: number, artwork: Partial<InsertArtwork>): Promise<Artwork | undefined>;
  deleteArtwork(id: number): Promise<boolean>;
  getFeaturedArtworks(): Promise<Artwork[]>;

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
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private artworks: Map<number, Artwork>;
  private exhibitions: Map<number, Exhibition>;
  private homepageSettings: HomepageSettings | undefined;
  private artistBio: ArtistBio | undefined;
  private currentUserId: number;
  private currentArtworkId: number;
  private currentExhibitionId: number;

  constructor() {
    this.users = new Map();
    this.artworks = new Map();
    this.exhibitions = new Map();
    this.currentUserId = 1;
    this.currentArtworkId = 1;
    this.currentExhibitionId = 1;
    
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

    // Initialize with sample data
    this.initializeSampleData();
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
        featured: true
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
        featured: true
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
        featured: true
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
        featured: false
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

  async createArtwork(insertArtwork: InsertArtwork): Promise<Artwork> {
    const id = this.currentArtworkId++;
    const artwork: Artwork = { 
      ...insertArtwork, 
      id,
      saatchiUrl: insertArtwork.saatchiUrl || null,
      buyLink: insertArtwork.buyLink || null,
      featured: insertArtwork.featured || false
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
    this.artistBio = { ...bio, id: 1 };
    return this.artistBio;
  }
}

export const storage = new MemStorage();