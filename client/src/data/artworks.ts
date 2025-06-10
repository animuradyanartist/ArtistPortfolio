import type { Artwork } from "@shared/schema";

// This file is kept for reference but data is now managed through the API
// The actual data is stored in server/storage.ts

export const mockArtworks: Artwork[] = [
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
  }
];
