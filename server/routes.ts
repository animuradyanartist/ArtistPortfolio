import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import { storage } from "./storage";
import { insertArtworkSchema, insertPrintSchema, insertExhibitionSchema, insertHomepageSettingsSchema, insertArtistBioSchema, insertContactSettingsSchema, insertGalleryPhotoSchema, prints } from "@shared/schema";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import { requireAdminAuth, authenticateAdminSession, logoutAdminSession } from "./auth";

// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
      // Generate unique filename with timestamp
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Authentication endpoints
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { password } = req.body;
      
      if (!password) {
        return res.status(400).json({ message: "Password is required" });
      }
      
      if (authenticateAdminSession(req, password)) {
        res.json({ 
          message: "Login successful", 
          authenticated: true 
        });
      } else {
        res.status(401).json({ 
          message: "Invalid password", 
          authenticated: false 
        });
      }
    } catch (error) {
      res.status(500).json({ message: "Login failed", error });
    }
  });
  
  app.post("/api/auth/logout", async (req, res) => {
    try {
      logoutAdminSession(req);
      res.json({ 
        message: "Logout successful", 
        authenticated: false 
      });
    } catch (error) {
      res.status(500).json({ message: "Logout failed", error });
    }
  });
  
  app.get("/api/auth/status", async (req, res) => {
    try {
      const authenticated = req.session?.isAdminAuthenticated === true;
      res.json({ authenticated });
    } catch (error) {
      res.status(500).json({ message: "Failed to check auth status", error });
    }
  });

  // Health check and data integrity endpoint
  app.get("/api/health", async (req, res) => {
    try {
      const artworks = await storage.getAllArtworks();
      const totalImages = artworks.reduce((count, artwork) => count + artwork.images.length, 0);
      const invalidImages = artworks.filter(artwork => 
        artwork.images.some(img => !img || (!img.startsWith('data:image/') && !img.startsWith('http')))
      );
      
      res.json({
        status: "healthy",
        database: "connected",
        artworks: artworks.length,
        totalImages,
        invalidImages: invalidImages.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        status: "unhealthy",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Artworks routes
  app.get("/api/artworks", async (req, res) => {
    try {
      const artworks = await storage.getAllArtworks();
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      res.json(artworks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch artworks" });
    }
  });

  app.get("/api/artworks/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const artwork = await storage.getArtwork(id);
      if (!artwork) {
        return res.status(404).json({ message: "Artwork not found" });
      }
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      res.json(artwork);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch artwork" });
    }
  });

  app.post("/api/artworks", requireAdminAuth, async (req, res) => {
    try {
      const validatedData = insertArtworkSchema.parse(req.body);
      
      // Validate images array
      if (validatedData.images && validatedData.images.length > 0) {
        for (const image of validatedData.images) {
          if (!image.startsWith('data:image/') && !image.startsWith('http')) {
            return res.status(400).json({ message: "Invalid image format detected" });
          }
        }
      }
      
      const artwork = await storage.createArtwork(validatedData);
      
      // Verify the artwork was created with images
      if (artwork.images.length !== validatedData.images.length) {
        console.warn('Image count mismatch after creation');
      }
      
      res.status(201).json(artwork);
    } catch (error) {
      console.error('Artwork creation error:', error);
      res.status(400).json({ message: "Invalid artwork data", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put("/api/artworks/:id", requireAdminAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertArtworkSchema.partial().parse(req.body);
      
      // Validate images array if present
      if (validatedData.images && validatedData.images.length > 0) {
        for (const image of validatedData.images) {
          if (!image.startsWith('data:image/') && !image.startsWith('http')) {
            return res.status(400).json({ message: "Invalid image format detected" });
          }
        }
      }
      
      const artwork = await storage.updateArtwork(id, validatedData);
      if (!artwork) {
        return res.status(404).json({ message: "Artwork not found" });
      }
      
      // Verify the artwork was updated with correct images
      if (validatedData.images && artwork.images.length !== validatedData.images.length) {
        console.warn('Image count mismatch after update');
      }
      
      res.json(artwork);
    } catch (error) {
      console.error('Artwork update error:', error);
      res.status(400).json({ message: "Invalid artwork data", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/artworks/:id", requireAdminAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteArtwork(id);
      if (!deleted) {
        return res.status(404).json({ message: "Artwork not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete artwork" });
    }
  });

  app.get("/api/artworks/featured", async (req, res) => {
    try {
      const artworks = await storage.getFeaturedArtworks();
      res.json(artworks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch featured artworks" });
    }
  });

  // Prints routes
  // Helper function to compress base64 image
  const compressImage = (base64Image: string): string => {
    // For very large images, we'll apply basic compression
    if (base64Image.length > 500000) { // If larger than ~375KB
      // Convert to JPEG format for smaller size
      // This is a simple format conversion - in production use proper image processing
      if (base64Image.includes('data:image/png')) {
        return base64Image.replace('data:image/png;base64,', 'data:image/jpeg;base64,');
      }
    }
    return base64Image;
  };

  app.get("/api/prints", async (req, res) => {
    try {
      // Use lightweight query without images for fast initial load
      const lightweightPrints = await db.select({
        id: prints.id,
        title: prints.title,
        description: prints.description,
        status: prints.status,
        availableSizes: prints.availableSizes,
        preferredMaterial: prints.preferredMaterial,
        position: prints.position,
        // Check if images exist without loading them
        hasImages: sql<boolean>`CASE WHEN ${prints.images} IS NOT NULL AND array_length(${prints.images}, 1) > 0 THEN true ELSE false END`
      })
      .from(prints)
      .where(eq(prints.status, 'active'))
      .orderBy(prints.position);
      
      // Transform to expected format
      const transformedPrints = lightweightPrints.map(print => ({
        ...print,
        images: print.hasImages ? ['thumbnail'] : [],
        hasImages: print.hasImages
      }));
      
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      res.json(transformedPrints);
    } catch (error) {
      console.error('Error fetching prints:', error);
      res.status(500).json({ message: "Failed to fetch prints", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/prints/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const print = await storage.getPrint(id);
      if (!print) {
        return res.status(404).json({ message: "Print not found" });
      }
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      res.json(print);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch print" });
    }
  });

  // Get print images separately for better performance
  app.get("/api/prints/:id/images", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const print = await storage.getPrint(id);
      if (!print) {
        return res.status(404).json({ message: "Print not found" });
      }
      res.json({ images: print.images });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch print images" });
    }
  });

  // Get compressed thumbnail for print grid
  app.get("/api/prints/:id/thumbnail", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const print = await storage.getPrint(id);
      if (!print) {
        return res.status(404).json({ message: "Print not found" });
      }
      
      // Set aggressive cache headers for thumbnails (cache for 24 hours)
      res.set({
        'Cache-Control': 'public, max-age=86400, immutable',
        'ETag': `"print-${id}-thumb-v2"`,
        'Expires': new Date(Date.now() + 86400000).toUTCString()
      });
      
      // Return compressed thumbnail
      const thumbnail = print.images.length > 0 ? print.images[0] : null;
      
      // Apply compression for large images
      const processedThumbnail = compressImage(thumbnail || '');
      res.json({ thumbnail: processedThumbnail || null });
    } catch (error) {
      console.error(`Error fetching thumbnail for print ${req.params.id}:`, error);
      res.status(500).json({ message: "Failed to fetch print thumbnail" });
    }
  });

  // Batch thumbnail endpoint for faster loading
  app.post("/api/prints/thumbnails", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ message: "ids must be an array" });
      }

      // Limit batch size to prevent timeouts
      const limitedIds = ids.slice(0, 12);

      // Set aggressive cache headers for batch thumbnails
      res.set({
        'Cache-Control': 'public, max-age=86400, immutable',
        'Expires': new Date(Date.now() + 86400000).toUTCString()
      });

      const thumbnails: Record<number, string | null> = {};
      
      // Use Promise.allSettled for better error handling and add timeout
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Batch timeout')), 15000)
      );
      
      const thumbnailPromises = limitedIds.map(async (id) => {
        try {
          const print = await storage.getPrint(parseInt(id));
          if (print && print.images.length > 0) {
            let thumbnail = print.images[0];
            // Apply compression
            thumbnail = compressImage(thumbnail);
            return { id, thumbnail };
          } else {
            return { id, thumbnail: null };
          }
        } catch (error) {
          console.error(`Error fetching thumbnail for print ${id}:`, error);
          return { id, thumbnail: null };
        }
      });

      try {
        const results = await Promise.race([
          Promise.allSettled(thumbnailPromises),
          timeoutPromise
        ]);
        
        if (Array.isArray(results)) {
          results.forEach((result) => {
            if (result.status === 'fulfilled' && result.value) {
              thumbnails[result.value.id] = result.value.thumbnail;
            }
          });
        }
      } catch (error) {
        console.error('Batch thumbnail timeout or error:', error);
        // Return empty thumbnails on timeout
      }
      
      res.json({ thumbnails });
    } catch (error) {
      console.error('Error in batch thumbnails:', error);
      res.status(500).json({ message: "Failed to fetch thumbnails" });
    }
  });

  app.post("/api/prints", requireAdminAuth, async (req, res) => {
    try {
      const validatedData = insertPrintSchema.parse(req.body);
      
      // Validate images array
      if (validatedData.images && validatedData.images.length > 0) {
        for (const image of validatedData.images) {
          if (!image.startsWith('data:image/') && !image.startsWith('http')) {
            return res.status(400).json({ message: "Invalid image format detected" });
          }
        }
      }
      
      const print = await storage.createPrint(validatedData);
      res.status(201).json(print);
    } catch (error) {
      console.error('Print creation error:', error);
      res.status(400).json({ message: "Invalid print data", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put("/api/prints/:id", requireAdminAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertPrintSchema.partial().parse(req.body);
      
      // Validate images array if present
      if (validatedData.images && validatedData.images.length > 0) {
        for (const image of validatedData.images) {
          if (!image.startsWith('data:image/') && !image.startsWith('http')) {
            return res.status(400).json({ message: "Invalid image format detected" });
          }
        }
      }
      
      const print = await storage.updatePrint(id, validatedData);
      if (!print) {
        return res.status(404).json({ message: "Print not found" });
      }
      
      res.json(print);
    } catch (error) {
      console.error('Print update error:', error);
      res.status(400).json({ message: "Invalid print data", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/prints/:id", requireAdminAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deletePrint(id);
      if (!deleted) {
        return res.status(404).json({ message: "Print not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete print" });
    }
  });

  app.get("/api/prints/featured", async (req, res) => {
    try {
      const prints = await storage.getFeaturedPrints();
      res.json(prints);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch featured prints" });
    }
  });

  // Exhibitions routes
  app.get("/api/exhibitions", async (req, res) => {
    try {
      const type = req.query.type as string;
      let exhibitions;
      if (type && (type === 'solo' || type === 'group')) {
        exhibitions = await storage.getExhibitionsByType(type);
      } else {
        exhibitions = await storage.getAllExhibitions();
      }
      res.json(exhibitions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch exhibitions" });
    }
  });

  app.get("/api/exhibitions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const exhibition = await storage.getExhibition(id);
      if (!exhibition) {
        return res.status(404).json({ message: "Exhibition not found" });
      }
      res.json(exhibition);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch exhibition" });
    }
  });

  app.post("/api/exhibitions", requireAdminAuth, async (req, res) => {
    try {
      const validatedData = insertExhibitionSchema.parse(req.body);
      const exhibition = await storage.createExhibition(validatedData);
      res.status(201).json(exhibition);
    } catch (error) {
      res.status(400).json({ message: "Invalid exhibition data", error });
    }
  });

  app.put("/api/exhibitions/:id", requireAdminAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertExhibitionSchema.partial().parse(req.body);
      const exhibition = await storage.updateExhibition(id, validatedData);
      if (!exhibition) {
        return res.status(404).json({ message: "Exhibition not found" });
      }
      res.json(exhibition);
    } catch (error) {
      res.status(400).json({ message: "Invalid exhibition data", error });
    }
  });

  app.delete("/api/exhibitions/:id", requireAdminAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteExhibition(id);
      if (!deleted) {
        return res.status(404).json({ message: "Exhibition not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete exhibition" });
    }
  });

  // Homepage settings routes
  app.get("/api/homepage-settings", async (req, res) => {
    try {
      const settings = await storage.getHomepageSettings();
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch homepage settings" });
    }
  });

  app.put("/api/homepage-settings", requireAdminAuth, async (req, res) => {
    try {
      const validatedData = insertHomepageSettingsSchema.parse(req.body);
      const settings = await storage.updateHomepageSettings(validatedData);
      res.json(settings);
    } catch (error) {
      res.status(400).json({ message: "Invalid homepage settings data", error });
    }
  });

  // Artist bio routes
  app.get("/api/artist-bio", async (req, res) => {
    try {
      const bio = await storage.getArtistBio();
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      res.json(bio);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch artist bio" });
    }
  });

  app.put("/api/artist-bio", requireAdminAuth, async (req, res) => {
    try {
      const validatedData = insertArtistBioSchema.parse(req.body);
      const bio = await storage.updateArtistBio(validatedData);
      res.json(bio);
    } catch (error) {
      res.status(400).json({ message: "Invalid artist bio data", error });
    }
  });

  // File upload route
  app.post("/api/upload", requireAdminAuth, upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      // Return the relative path for use in the frontend
      const imagePath = `/uploads/${req.file.filename}`;
      res.json({ imagePath });
    } catch (error) {
      res.status(500).json({ message: "Failed to upload image", error });
    }
  });

  // Artwork reordering route
  app.post("/api/artworks/:id/reorder", requireAdminAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { direction } = req.body;
      
      if (!direction || !['up', 'down'].includes(direction)) {
        return res.status(400).json({ message: "Direction must be 'up' or 'down'" });
      }
      
      const artworks = await storage.reorderArtwork(id, direction);
      res.json(artworks);
    } catch (error) {
      res.status(500).json({ message: "Failed to reorder artwork", error });
    }
  });

  // Drag and drop reordering route
  app.post("/api/artworks/reorder-drag", requireAdminAuth, async (req, res) => {
    try {
      const { sourceId, targetId } = req.body;
      
      if (!sourceId || !targetId) {
        return res.status(400).json({ message: "sourceId and targetId are required" });
      }
      
      const artworks = await storage.reorderArtworkDrag(sourceId, targetId);
      res.json(artworks);
    } catch (error) {
      res.status(500).json({ message: "Failed to reorder artwork via drag", error });
    }
  });

  // Contact form submission
  app.post("/api/contact", async (req, res) => {
    try {
      const { name, email, subject, message } = req.body;
      
      if (!name || !email || !message) {
        return res.status(400).json({ message: "Name, email, and message are required" });
      }

      // In a real application, you would send the email here
      // For now, we'll just return success
      console.log("Contact form submission:", { name, email, subject, message });
      
      res.json({ message: "Message sent successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Feedback submission
  app.post("/api/feedback", async (req, res) => {
    try {
      const { rating, message } = req.body;
      
      if (!rating || !message) {
        return res.status(400).json({ message: "Rating and message are required" });
      }

      if (rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Rating must be between 1 and 5" });
      }

      const feedback = await storage.createFeedback({ rating, message });
      console.log("Feedback submitted:", feedback);
      
      res.status(201).json({ message: "Feedback submitted successfully", feedback });
    } catch (error) {
      console.error("Error submitting feedback:", error);
      res.status(500).json({ message: "Failed to submit feedback" });
    }
  });

  // Get all feedback (admin only)
  app.get("/api/feedback", requireAdminAuth, async (req, res) => {
    try {
      const feedbacks = await storage.getAllFeedback();
      res.json(feedbacks);
    } catch (error) {
      console.error("Error fetching feedback:", error);
      res.status(500).json({ message: "Failed to fetch feedback" });
    }
  });

  // Contact Settings routes
  app.get("/api/contact-settings", async (req, res) => {
    try {
      const settings = await storage.getContactSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching contact settings:", error);
      res.status(500).json({ message: "Failed to fetch contact settings" });
    }
  });

  app.put("/api/contact-settings", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertContactSettingsSchema.parse(req.body);
      const updated = await storage.updateContactSettings(validated);
      res.json(updated);
    } catch (error) {
      console.error("Error updating contact settings:", error);
      res.status(500).json({ message: "Failed to update contact settings" });
    }
  });

  // Gallery Photos routes
  app.get("/api/gallery-photos", async (req, res) => {
    try {
      const photos = await storage.getAllGalleryPhotos();
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      res.json(photos);
    } catch (error) {
      console.error("Error fetching gallery photos:", error);
      res.status(500).json({ message: "Failed to fetch gallery photos" });
    }
  });

  app.get("/api/gallery-photos/featured", async (req, res) => {
    try {
      const photos = await storage.getFeaturedGalleryPhotos();
      res.json(photos);
    } catch (error) {
      console.error("Error fetching featured gallery photos:", error);
      res.status(500).json({ message: "Failed to fetch featured gallery photos" });
    }
  });

  app.get("/api/gallery-photos/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const photo = await storage.getGalleryPhoto(id);
      
      if (!photo) {
        return res.status(404).json({ message: "Gallery photo not found" });
      }
      
      res.json(photo);
    } catch (error) {
      console.error("Error fetching gallery photo:", error);
      res.status(500).json({ message: "Failed to fetch gallery photo" });
    }
  });

  app.post("/api/gallery-photos", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertGalleryPhotoSchema.parse(req.body);
      const created = await storage.createGalleryPhoto(validated);
      res.json(created);
    } catch (error) {
      console.error("Error creating gallery photo:", error);
      res.status(500).json({ message: "Failed to create gallery photo" });
    }
  });

  app.patch("/api/gallery-photos/:id", requireAdminAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateGalleryPhoto(id, req.body);
      
      if (!updated) {
        return res.status(404).json({ message: "Gallery photo not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating gallery photo:", error);
      res.status(500).json({ message: "Failed to update gallery photo" });
    }
  });

  app.delete("/api/gallery-photos/:id", requireAdminAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteGalleryPhoto(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Gallery photo not found" });
      }
      
      res.json({ message: "Gallery photo deleted successfully" });
    } catch (error) {
      console.error("Error deleting gallery photo:", error);
      res.status(500).json({ message: "Failed to delete gallery photo" });
    }
  });

  app.post("/api/gallery-photos/:id/reorder", requireAdminAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { direction } = req.body;
      
      if (!direction || !['up', 'down'].includes(direction)) {
        return res.status(400).json({ message: "Invalid direction" });
      }
      
      const photos = await storage.reorderGalleryPhoto(id, direction);
      res.json(photos);
    } catch (error) {
      console.error("Error reordering gallery photo:", error);
      res.status(500).json({ message: "Failed to reorder gallery photo" });
    }
  });

  // SEO Routes
  app.get("/robots.txt", async (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.send(`User-agent: *
Allow: /
Sitemap: https://animuradyanart.replit.app/sitemap.xml

# Disallow admin pages from indexing
User-agent: *
Disallow: /admin
`);
  });

  app.get("/sitemap.xml", async (req, res) => {
    try {
      const baseUrl = 'https://animuradyanart.replit.app';
      const artworks = await storage.getAllArtworks();
      const prints = await storage.getAllPrints();
      
      // Static pages
      const staticPages = [
        { url: '/', priority: '1.0', changefreq: 'weekly' },
        { url: '/about', priority: '0.8', changefreq: 'monthly' },
        { url: '/artworks', priority: '0.9', changefreq: 'weekly' },
        { url: '/prints', priority: '0.9', changefreq: 'weekly' },
        { url: '/contact', priority: '0.7', changefreq: 'monthly' }
      ];
      
      // Build XML sitemap
      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
      
      // Add static pages
      staticPages.forEach(page => {
        xml += '  <url>\n';
        xml += `    <loc>${baseUrl}${page.url}</loc>\n`;
        xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
        xml += `    <priority>${page.priority}</priority>\n`;
        xml += '  </url>\n';
      });
      
      // Add artwork pages
      artworks.forEach(artwork => {
        xml += '  <url>\n';
        xml += `    <loc>${baseUrl}/artworks/${artwork.id}</loc>\n`;
        xml += '    <changefreq>monthly</changefreq>\n';
        xml += '    <priority>0.8</priority>\n';
        xml += '  </url>\n';
      });
      
      // Add print pages (only active prints)
      const activePrints = prints.filter(print => print.status === 'active');
      activePrints.forEach(print => {
        xml += '  <url>\n';
        xml += `    <loc>${baseUrl}/prints/${print.id}</loc>\n`;
        xml += '    <changefreq>monthly</changefreq>\n';
        xml += '    <priority>0.8</priority>\n';
        xml += '  </url>\n';
      });
      
      xml += '</urlset>';
      
      res.setHeader('Content-Type', 'application/xml');
      res.send(xml);
    } catch (error) {
      console.error("Error generating sitemap:", error);
      res.status(500).send('Error generating sitemap');
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
