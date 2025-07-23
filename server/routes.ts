import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import { storage } from "./storage";
import { insertArtworkSchema, insertPrintSchema, insertExhibitionSchema, insertHomepageSettingsSchema, insertArtistBioSchema } from "@shared/schema";

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
      res.json(artwork);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch artwork" });
    }
  });

  app.post("/api/artworks", async (req, res) => {
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

  app.put("/api/artworks/:id", async (req, res) => {
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

  app.delete("/api/artworks/:id", async (req, res) => {
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
    // For very large images, we'll create a smaller version
    if (base64Image.length > 100000) { // If larger than ~75KB
      // Return a much smaller portion of the image to create a thumbnail effect
      const header = base64Image.substring(0, 50);
      const compressed = base64Image.substring(0, 30000); // Take first 30KB
      return compressed + '...'; // Add indicator it's compressed
    }
    return base64Image;
  };

  app.get("/api/prints", async (req, res) => {
    try {
      console.log('Fetching prints...');
      const prints = await storage.getAllPrints();
      console.log('Prints fetched:', prints.length);
      
      // Return lightweight prints for fast loading
      const lightweightPrints = prints.map(print => ({
        id: print.id,
        title: print.title,
        description: print.description,
        status: print.status,
        availableSizes: print.availableSizes,
        preferredMaterial: print.preferredMaterial,
        // Use thumbnail placeholders for grid view
        images: print.images.length > 0 ? ['thumbnail'] : [],
        hasImages: print.images.length > 0
      }));
      
      console.log('Lightweight prints created:', lightweightPrints.length);
      console.log('Active prints:', lightweightPrints.filter(p => p.status === 'active').length);
      
      res.json(lightweightPrints);
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
      
      // Return first image directly (already compressed from admin upload)
      const thumbnail = print.images.length > 0 ? print.images[0] : null;
      res.json({ thumbnail });
    } catch (error) {
      console.error(`Error fetching thumbnail for print ${req.params.id}:`, error);
      res.status(500).json({ message: "Failed to fetch print thumbnail" });
    }
  });

  app.post("/api/prints", async (req, res) => {
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

  app.put("/api/prints/:id", async (req, res) => {
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

  app.delete("/api/prints/:id", async (req, res) => {
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

  app.post("/api/exhibitions", async (req, res) => {
    try {
      const validatedData = insertExhibitionSchema.parse(req.body);
      const exhibition = await storage.createExhibition(validatedData);
      res.status(201).json(exhibition);
    } catch (error) {
      res.status(400).json({ message: "Invalid exhibition data", error });
    }
  });

  app.put("/api/exhibitions/:id", async (req, res) => {
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

  app.delete("/api/exhibitions/:id", async (req, res) => {
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
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch homepage settings" });
    }
  });

  app.put("/api/homepage-settings", async (req, res) => {
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
      res.json(bio);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch artist bio" });
    }
  });

  app.put("/api/artist-bio", async (req, res) => {
    try {
      const validatedData = insertArtistBioSchema.parse(req.body);
      const bio = await storage.updateArtistBio(validatedData);
      res.json(bio);
    } catch (error) {
      res.status(400).json({ message: "Invalid artist bio data", error });
    }
  });

  // File upload route
  app.post("/api/upload", upload.single('image'), async (req, res) => {
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
  app.post("/api/artworks/:id/reorder", async (req, res) => {
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
  app.post("/api/artworks/reorder-drag", async (req, res) => {
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
  app.get("/api/feedback", async (req, res) => {
    try {
      const feedbacks = await storage.getAllFeedback();
      res.json(feedbacks);
    } catch (error) {
      console.error("Error fetching feedback:", error);
      res.status(500).json({ message: "Failed to fetch feedback" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
