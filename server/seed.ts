import { db } from "./db";
import { users, artworks, exhibitions, homepageSettings, artistBio } from "@shared/schema";

async function seed() {
  console.log("Seeding database...");

  // Create admin user
  await db.insert(users).values({
    username: "admin",
    password: "$2b$12$LQv3c1yqBwEUaepTj/z0EeqJ2OzxbdgTrJdxI3zZ9PQpJ9xQ3vXZO" // admin123
  }).onConflictDoNothing();

  // Create homepage settings
  await db.insert(homepageSettings).values({
    heroQuote: "Art must bring hope to all who look upon it",
    heroImage: "https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=1200&h=800&fit=crop",
    featuredArtworkIds: ["1"]
  }).onConflictDoNothing();

  // Create artist bio
  await db.insert(artistBio).values({
    title: "About Ani Muradyan",
    description: "Ani Muradyan is a contemporary artist whose work explores the intersection of abstract and realistic elements, creating pieces that speak to the human condition through bold colors and emotional depth.",
    image: "https://images.unsplash.com/photo-1544717297-fa95b6ee9643?w=400&h=400&fit=crop&crop=face",
    statement: "My art is a reflection of the human experience - the joy, the pain, the hope, and the dreams that define us all.",
    education: "MFA in Fine Arts, California Institute of the Arts\nBFA in Painting, Rhode Island School of Design",
    awards: "2023 - Excellence in Contemporary Art Award\n2022 - Emerging Artist Grant, National Arts Foundation\n2021 - Best in Show, Modern Art Exhibition"
  }).onConflictDoNothing();

  // Create sample artwork
  await db.insert(artworks).values({
    title: "Whispers of Dawn",
    description: "A captivating piece that captures the ethereal beauty of early morning light filtering through abstract forms. This artwork explores themes of renewal and hope through warm, flowing colors that seem to dance across the canvas.",
    medium: "Oil on Canvas",
    dimensions: "24\" x 36\"",
    year: 2024,
    price: 2500,
    type: "oil",
    size: "medium",
    availability: "available",
    images: [
      "https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1578321272176-b7bbc0679853?w=800&h=600&fit=crop"
    ],
    saatchiUrl: "https://www.saatchiart.com/artist/whispers-of-dawn",
    buyLink: null,
    featured: true
  }).onConflictDoNothing();

  // Create sample exhibitions
  await db.insert(exhibitions).values([
    {
      title: "Whispers of the Soul",
      description: "A collection of abstract realism works exploring human emotion and connection.",
      type: "solo",
      venue: "Modern Art Gallery",
      location: "Los Angeles",
      year: 2024,
      startDate: "2024-03-15",
      endDate: "2024-04-15",
      image: "https://images.unsplash.com/photo-1578321272176-b7bbc0679853?w=800&h=600&fit=crop"
    },
    {
      title: "Contemporary Visions",
      description: "Group exhibition featuring emerging contemporary artists.",
      type: "group",
      venue: "City Arts Center",
      location: "New York",
      year: 2024,
      startDate: "2024-01-10",
      endDate: "2024-02-10",
      image: "https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=800&h=600&fit=crop"
    }
  ]).onConflictDoNothing();

  console.log("Database seeded successfully!");
}

seed().catch(console.error);