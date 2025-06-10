import { users, artworks, exhibitions, homepageSettings, type User, type InsertUser, type Artwork, type InsertArtwork, type Exhibition, type InsertExhibition, type HomepageSettings, type InsertHomepageSettings } from "@shared/schema";

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
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private artworks: Map<number, Artwork>;
  private exhibitions: Map<number, Exhibition>;
  private homepageSettings: HomepageSettings | undefined;
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
        featured: true
      },
      {
        id: 2,
        title: "Geometric Harmony",
        description: "An exploration of balance and rhythm through geometric abstraction, demonstrating the mathematical beauty found in nature.",
        medium: "Acrylic on canvas",
        dimensions: "24\" × 24\"",
        year: 2024,
        price: 1800,
        images: ["https://images.unsplash.com/photo-1549887534-1541e9326642?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600"],
        type: "acrylic",
        size: "small",
        availability: "available",
        saatchiUrl: "https://saatchiart.com",
        featured: true
      },
      {
        id: 3,
        title: "Ocean Dreams",
        description: "Inspired by the endless movement of ocean waves, capturing the fluid nature of water through abstract forms.",
        medium: "Oil on canvas",
        dimensions: "30\" × 40\"",
        year: 2023,
        price: 2400,
        images: ["https://images.unsplash.com/photo-1541961017774-22349e4a1262?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600"],
        type: "oil",
        size: "large",
        availability: "sold",
        saatchiUrl: "https://saatchiart.com",
        featured: true
      },
      {
        id: 4,
        title: "Earth's Memory",
        description: "A textured exploration of natural landscapes through mixed media techniques.",
        medium: "Mixed media",
        dimensions: "36\" × 24\"",
        year: 2023,
        price: 2200,
        images: ["https://images.unsplash.com/photo-1533158326339-7f3cf2404354?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600"],
        type: "mixed",
        size: "medium",
        availability: "available",
        saatchiUrl: "https://saatchiart.com",
        featured: false
      }
    ];

    // Sample exhibitions
    const sampleExhibitions: Exhibition[] = [
      {
        id: 1,
        title: "Whispers of the Soul",
        type: "solo",
        venue: "Galerie Moderne",
        location: "Paris, France",
        year: 2023,
        startDate: "March 15, 2023",
        endDate: "April 30, 2023",
        description: "A comprehensive showcase of recent works exploring themes of hope and resilience.",
        image: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&h=300"
      },
      {
        id: 2,
        title: "Contemporary Voices",
        type: "group",
        venue: "Museum of Contemporary Art",
        location: "Yerevan, Armenia",
        year: 2022,
        startDate: "May 20, 2022",
        endDate: "August 30, 2022",
        description: "Featured alongside 15 prominent Armenian contemporary artists.",
        image: "https://images.unsplash.com/photo-1545987796-b199d6abb1b4?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&h=300"
      },
      {
        id: 3,
        title: "Abstract Emotions",
        type: "solo",
        venue: "Chelsea Art Gallery",
        location: "New York, USA",
        year: 2021,
        startDate: "September 10, 2021",
        endDate: "October 25, 2021",
        description: "Debut international solo exhibition featuring 25 paintings.",
        image: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&h=300"
      }
    ];

    // Add to storage
    sampleArtworks.forEach(artwork => {
      this.artworks.set(artwork.id, artwork);
      if (artwork.id >= this.currentArtworkId) {
        this.currentArtworkId = artwork.id + 1;
      }
    });

    sampleExhibitions.forEach(exhibition => {
      this.exhibitions.set(exhibition.id, exhibition);
      if (exhibition.id >= this.currentExhibitionId) {
        this.currentExhibitionId = exhibition.id + 1;
      }
    });
  }

  // User methods
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

  // Artwork methods
  async getAllArtworks(): Promise<Artwork[]> {
    return Array.from(this.artworks.values()).sort((a, b) => b.year - a.year);
  }

  async getArtwork(id: number): Promise<Artwork | undefined> {
    return this.artworks.get(id);
  }

  async createArtwork(insertArtwork: InsertArtwork): Promise<Artwork> {
    const id = this.currentArtworkId++;
    const artwork: Artwork = { ...insertArtwork, id };
    this.artworks.set(id, artwork);
    return artwork;
  }

  async updateArtwork(id: number, updateData: Partial<InsertArtwork>): Promise<Artwork | undefined> {
    const artwork = this.artworks.get(id);
    if (!artwork) return undefined;
    
    const updatedArtwork = { ...artwork, ...updateData };
    this.artworks.set(id, updatedArtwork);
    return updatedArtwork;
  }

  async deleteArtwork(id: number): Promise<boolean> {
    return this.artworks.delete(id);
  }

  async getFeaturedArtworks(): Promise<Artwork[]> {
    return Array.from(this.artworks.values()).filter(artwork => artwork.featured);
  }

  // Exhibition methods
  async getAllExhibitions(): Promise<Exhibition[]> {
    return Array.from(this.exhibitions.values()).sort((a, b) => b.year - a.year);
  }

  async getExhibition(id: number): Promise<Exhibition | undefined> {
    return this.exhibitions.get(id);
  }

  async createExhibition(insertExhibition: InsertExhibition): Promise<Exhibition> {
    const id = this.currentExhibitionId++;
    const exhibition: Exhibition = { ...insertExhibition, id };
    this.exhibitions.set(id, exhibition);
    return exhibition;
  }

  async updateExhibition(id: number, updateData: Partial<InsertExhibition>): Promise<Exhibition | undefined> {
    const exhibition = this.exhibitions.get(id);
    if (!exhibition) return undefined;
    
    const updatedExhibition = { ...exhibition, ...updateData };
    this.exhibitions.set(id, updatedExhibition);
    return updatedExhibition;
  }

  async deleteExhibition(id: number): Promise<boolean> {
    return this.exhibitions.delete(id);
  }

  async getExhibitionsByType(type: string): Promise<Exhibition[]> {
    return Array.from(this.exhibitions.values())
      .filter(exhibition => exhibition.type === type)
      .sort((a, b) => b.year - a.year);
  }

  // Homepage settings methods
  async getHomepageSettings(): Promise<HomepageSettings | undefined> {
    return this.homepageSettings;
  }

  async updateHomepageSettings(settings: InsertHomepageSettings): Promise<HomepageSettings> {
    this.homepageSettings = { ...settings, id: 1 };
    return this.homepageSettings;
  }
}

export const storage = new MemStorage();
