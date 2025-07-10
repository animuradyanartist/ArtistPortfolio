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
  app.get("/api/prints", async (req, res) => {
    try {
      console.log('Fetching prints...');
      const prints = await storage.getAllPrints();
      console.log('Prints fetched:', prints.length);
      res.json(prints);
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

  const httpServer = createServer(app);
  return httpServer;
}
