import type { Exhibition } from "@shared/schema";

// This file is kept for reference but data is now managed through the API
// The actual data is stored in server/storage.ts

export const mockExhibitions: Exhibition[] = [
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
