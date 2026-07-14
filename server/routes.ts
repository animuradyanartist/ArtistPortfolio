import express, { type Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import { storage } from "./storage";
import { insertArtworkSchema, insertPrintSchema, insertExhibitionSchema, insertHomepageSettingsSchema, insertArtistBioSchema, insertContactSettingsSchema, insertGalleryPhotoSchema, prints } from "@shared/schema";
import { db, hasDatabase } from "./db";
import { eq, sql } from "drizzle-orm";
import { requireAdminAuth, authenticateAdminSession, logoutAdminSession } from "./auth";
import {
  registerImageRoutes,
  refifyImages,
  refifyImagesList,
  refifyImageField,
  refifyImageFieldList,
  toImageRef,
  resolveImageRef,
  resolveImageRefs,
  isAcceptableImage,
  memoJson,
  invalidateApiCache,
} from "./images";

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
  // Serves base64 DB images as resized, cacheable WebP (see server/images.ts)
  registerImageRoutes(app);

  // Any mutation invalidates the in-memory API response cache — both before
  // the handler runs and after it finishes, so a concurrent GET can't
  // repopulate the cache with pre-mutation data.
  app.use("/api", (req, res, next) => {
    if (req.method !== "GET") {
      invalidateApiCache();
      res.on("finish", invalidateApiCache);
    }
    next();
  });

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
        artwork.images.some(img => !img || !isAcceptableImage(img))
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
      const artworks = await memoJson("artworks:list", 60_000, async () =>
        refifyImagesList("artwork", await storage.getAllArtworks())
      );
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      res.json(artworks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch artworks" });
    }
  });

  app.get("/api/artworks/seo/:seoSlug", async (req, res) => {
    try {
      const artwork = await storage.getArtworkBySeoSlug(req.params.seoSlug);
      if (!artwork) {
        return res.status(404).json({ message: "Artwork not found" });
      }
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      res.json(refifyImages("artwork", artwork));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch artwork" });
    }
  });

  app.get("/api/artworks/:id", async (req, res) => {
    try {
      const param = req.params.id;
      const isNumeric = /^\d+$/.test(param);
      let artwork;
      if (isNumeric) {
        artwork = await storage.getArtwork(parseInt(param));
      } else {
        const allArtworks = await storage.getAllArtworks();
        // Resolve in priority order so every URL form lands on the exact
        // piece — including duplicate titles:
        //   1. exact stored slug / seoSlug (legacy + Singulart slugs)
        //   2. our canonical "<title>-<id>" form: match the trailing id
        //   3. clean toSlug(title) (older short URLs; first match)
        const trailingId = param.match(/-(\d+)$/);
        artwork =
          allArtworks.find(a => a.slug === param || a.seoSlug === param) ||
          (trailingId ? allArtworks.find(a => a.id === parseInt(trailingId[1])) : undefined) ||
          allArtworks.find(a => toSlug(a.title) === param);
      }
      if (!artwork) {
        return res.status(404).json({ message: "Artwork not found" });
      }
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      // ?raw=1 keeps base64 originals — used by the admin edit form
      res.json(req.query.raw === "1" ? artwork : refifyImages("artwork", artwork));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch artwork" });
    }
  });

  app.post("/api/artworks", requireAdminAuth, async (req, res) => {
    try {
      const validatedData = insertArtworkSchema.parse(req.body);

      if (validatedData.images && validatedData.images.length > 0) {
        validatedData.images = await resolveImageRefs(validatedData.images);
        for (const image of validatedData.images) {
          if (!isAcceptableImage(image)) {
            return res.status(400).json({ message: "Invalid image format detected" });
          }
        }
      }

      const artworkData = {
        ...validatedData,
        slug: validatedData.slug || toSlug(validatedData.title),
        seoSlug: validatedData.seoSlug?.trim() || null,
      };
      
      const artwork = await storage.createArtwork(artworkData);
      
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

      // Validate images array if present (refs from non-raw GETs are resolved
      // back to the stored originals first)
      if (validatedData.images && validatedData.images.length > 0) {
        validatedData.images = await resolveImageRefs(validatedData.images);
        for (const image of validatedData.images) {
          if (!isAcceptableImage(image)) {
            return res.status(400).json({ message: "Invalid image format detected" });
          }
        }
      }

      if ('seoSlug' in validatedData) {
        validatedData.seoSlug = validatedData.seoSlug?.trim() || null;
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
      console.error('Delete artwork error:', error);
      res.status(500).json({ message: "Failed to delete artwork", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/artworks/featured", async (req, res) => {
    try {
      const artworks = refifyImagesList("artwork", await storage.getFeaturedArtworks());
      res.json(artworks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch featured artworks" });
    }
  });

  // Singulart sync — pulls artworks from singulart.com/en/artist/ani-muradyan-62448
  // and upserts them into the local artworks table. Intended to be called daily
  // (via Replit scheduled job) or on-demand from the admin UI.
  app.post("/api/admin/sync-singulart", requireAdminAuth, async (req, res) => {
    try {
      const { runSingulartSync } = await import("./singulart-sync");
      const result = await runSingulartSync();
      const status = result.error ? 500 : 200;
      res.status(status).json(result);
    } catch (error) {
      console.error('Singulart sync error:', error);
      res.status(500).json({
        scrapedCount: 0,
        inserted: 0,
        updated: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Prints routes
  app.get("/api/prints", async (req, res) => {
    try {
      // Local preview mode has no SQL connection — build the same
      // lightweight shape from MemStorage
      if (!hasDatabase) {
        const all = (await storage.getAllPrints()).filter(p => p.status === 'active');
        res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        return res.json(all.map(p => ({
          id: p.id,
          title: p.title,
          description: p.description,
          status: p.status,
          availableSizes: p.availableSizes,
          preferredMaterial: p.preferredMaterial,
          position: p.position,
          images: p.images.length > 0 ? ['thumbnail'] : [],
          hasImages: p.images.length > 0,
        })));
      }
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
      const param = req.params.id;
      const isNumeric = /^\d+$/.test(param);
      let print;
      if (isNumeric) {
        print = await storage.getPrint(parseInt(param));
      } else {
        const allPrints = await storage.getAllPrints();
        print = allPrints.find(p => (p.slug || toSlug(p.title)) === param);
      }
      if (!print) {
        return res.status(404).json({ message: "Print not found" });
      }
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      // ?raw=1 keeps base64 originals — used by the admin edit form
      res.json(req.query.raw === "1" ? print : refifyImages("print", print));
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
      res.json({ images: refifyImages("print", print).images });
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
      
      // Return a URL to the resized WebP instead of inlining base64
      const first = print.images.length > 0 ? print.images[0] : null;
      const thumbnail = first && first.startsWith("data:")
        ? `${toImageRef("print", id, 0, first)}&w=640`
        : first;
      res.json({ thumbnail: thumbnail || null });
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
            if (thumbnail.startsWith("data:")) {
              thumbnail = `${toImageRef("print", print.id, 0, thumbnail)}&w=640`;
            }
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

      if (validatedData.images && validatedData.images.length > 0) {
        validatedData.images = await resolveImageRefs(validatedData.images);
        for (const image of validatedData.images) {
          if (!isAcceptableImage(image)) {
            return res.status(400).json({ message: "Invalid image format detected" });
          }
        }
      }

      const printData = {
        ...validatedData,
        slug: validatedData.slug || toSlug(validatedData.title),
      };
      
      const print = await storage.createPrint(printData);
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
        validatedData.images = await resolveImageRefs(validatedData.images);
        for (const image of validatedData.images) {
          if (!isAcceptableImage(image)) {
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
      const prints = refifyImagesList("print", await storage.getFeaturedPrints());
      res.json(prints);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch featured prints" });
    }
  });

  // Exhibitions routes
  app.get("/api/exhibitions", async (req, res) => {
    try {
      const type = req.query.type as string;
      const exhibitions = await memoJson(`exhibitions:${type || "all"}`, 60_000, async () => {
        const list = type && (type === 'solo' || type === 'group')
          ? await storage.getExhibitionsByType(type)
          : await storage.getAllExhibitions();
        return refifyImageFieldList("exhibition", list, "image");
      });
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
      res.json(req.query.raw === "1" ? exhibition : refifyImageField("exhibition", exhibition, "image"));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch exhibition" });
    }
  });

  app.post("/api/exhibitions", requireAdminAuth, async (req, res) => {
    try {
      const validatedData = insertExhibitionSchema.parse(req.body);
      if (validatedData.image) validatedData.image = await resolveImageRef(validatedData.image);
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
      if (validatedData.image) validatedData.image = await resolveImageRef(validatedData.image);
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
      res.json(settings && req.query.raw !== "1" ? refifyImageField("hero", settings, "heroImage") : settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch homepage settings" });
    }
  });

  app.put("/api/homepage-settings", requireAdminAuth, async (req, res) => {
    try {
      const validatedData = insertHomepageSettingsSchema.parse(req.body);
      if (validatedData.heroImage) validatedData.heroImage = await resolveImageRef(validatedData.heroImage);
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
      res.json(bio && req.query.raw !== "1" ? refifyImageField("bio", bio, "image") : bio);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch artist bio" });
    }
  });

  app.put("/api/artist-bio", requireAdminAuth, async (req, res) => {
    try {
      const validatedData = insertArtistBioSchema.parse(req.body);
      if (validatedData.image) validatedData.image = await resolveImageRef(validatedData.image);
      const bio = await storage.updateArtistBio(validatedData);
      res.json(bio);
    } catch (error) {
      res.status(400).json({ message: "Invalid artist bio data", error });
    }
  });

  // ── Path page settings (which painting leads each chapter) ──
  const PATH_SLOT_KEYS = [
    "heroArtworkId",
    "chapterOneArtworkId",
    "chapterOneDetailArtworkId",
    "chapterTwoArtworkId",
    "chapterTwoDetailArtworkId",
    "chapterThreeArtworkId",
  ] as const;

  app.get("/api/path-settings", async (req, res) => {
    // Resilient: if the table doesn't exist yet or anything fails, return
    // empty settings so the public /path page always renders (it falls back
    // to its automatic painting picks).
    try {
      const settings = await storage.getPathSettings();
      res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
      res.json(settings || {});
    } catch (error) {
      console.error("path-settings GET failed (returning defaults):", error);
      res.json({});
    }
  });

  app.put("/api/path-settings", requireAdminAuth, async (req, res) => {
    try {
      const data: Record<string, string | null> = {};
      for (const key of PATH_SLOT_KEYS) {
        if (key in req.body) {
          const v = req.body[key];
          data[key] = v === "" || v == null ? null : String(v);
        }
      }
      const updated = await storage.updatePathSettings(data);
      res.json(updated);
    } catch (error) {
      res.status(500).json({
        message: "Failed to update path settings",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/upload", requireAdminAuth, upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const originalPath = req.file.path;
      const ext = path.extname(req.file.filename).toLowerCase();
      const titleHint = (req.body.title || '').trim();
      const baseSlug = titleHint
        ? toSlug(titleHint) + '-' + Date.now()
        : req.file.filename.replace(/\.[^.]+$/, '');

      if (['.jpg', '.jpeg', '.png', '.tiff', '.bmp'].includes(ext)) {
        const webpFilename = `${baseSlug}.webp`;
        const webpPath = path.join('public/uploads/', webpFilename);
        try {
          await sharp(originalPath)
            .webp({ quality: 82 })
            .toFile(webpPath);
          fs.unlinkSync(originalPath);
          return res.json({ imagePath: `/uploads/${webpFilename}` });
        } catch (sharpError) {
          console.error("WebP conversion failed, serving original:", sharpError);
          return res.json({ imagePath: `/uploads/${req.file.filename}` });
        }
      }

      res.json({ imagePath: `/uploads/${req.file.filename}` });
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

  // Collector List — public signup + admin-only list
  app.post("/api/collectors", async (req, res) => {
    try {
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return res.status(400).json({ message: "A valid email is required" });
      }
      const collector = await storage.addCollector(email);
      res.status(201).json({ ok: true, id: collector.id });
    } catch (error) {
      console.error("Error adding collector:", error);
      res.status(500).json({ message: "Failed to join the collector list" });
    }
  });

  app.get("/api/collectors", requireAdminAuth, async (req, res) => {
    try {
      const list = await storage.getAllCollectors();
      res.json(list);
    } catch (error) {
      console.error("Error fetching collectors:", error);
      res.status(500).json({ message: "Failed to fetch collectors" });
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
      const photos = await memoJson("gallery:list", 60_000, async () =>
        refifyImageFieldList("gallery", await storage.getAllGalleryPhotos(), "image")
      );
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      res.json(photos);
    } catch (error) {
      console.error("Error fetching gallery photos:", error);
      res.status(500).json({ message: "Failed to fetch gallery photos" });
    }
  });

  app.get("/api/gallery-photos/featured", async (req, res) => {
    try {
      const photos = refifyImageFieldList("gallery", await storage.getFeaturedGalleryPhotos(), "image");
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

      res.json(req.query.raw === "1" ? photo : refifyImageField("gallery", photo, "image"));
    } catch (error) {
      console.error("Error fetching gallery photo:", error);
      res.status(500).json({ message: "Failed to fetch gallery photo" });
    }
  });

  app.post("/api/gallery-photos", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertGalleryPhotoSchema.parse(req.body);
      if (validated.image) validated.image = await resolveImageRef(validated.image);
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
      const patch = { ...req.body };
      if (typeof patch.image === "string") patch.image = await resolveImageRef(patch.image);
      const updated = await storage.updateGalleryPhoto(id, patch);

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

  // Slug helper
  function toSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // SEO Routes
  const SEO_BASE_URL = 'https://animuradyan.com';

  app.get("/robots.txt", async (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.send(`User-agent: *
Allow: /
Allow: /about
Allow: /artworks
Allow: /artworks/*
Allow: /prints
Allow: /prints/*
Allow: /gallery
Allow: /exhibitions
Allow: /contact

Disallow: /admin
Disallow: /api

Sitemap: ${SEO_BASE_URL}/sitemap.xml
Sitemap: ${SEO_BASE_URL}/image-sitemap.xml

Crawl-delay: 1
`);
  });

  app.get("/sitemap.xml", async (req, res) => {
    try {
      const artworks = await storage.getAllArtworks();
      const today = new Date().toISOString().split('T')[0];

      // Static public pages — /prints is excluded (client redirects it to /),
      // /about is hidden for now (route still works, just not promoted/linked)
      const staticPages = [
        { url: '/', priority: '1.0', changefreq: 'weekly' },
        { url: '/artworks', priority: '0.9', changefreq: 'weekly' },
        { url: '/exhibitions', priority: '0.8', changefreq: 'monthly' },
        { url: '/gallery', priority: '0.8', changefreq: 'monthly' },
        { url: '/contact', priority: '0.7', changefreq: 'monthly' }
      ];

      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

      staticPages.forEach(page => {
        xml += '  <url>\n';
        xml += `    <loc>${SEO_BASE_URL}${page.url}</loc>\n`;
        xml += `    <lastmod>${today}</lastmod>\n`;
        xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
        xml += `    <priority>${page.priority}</priority>\n`;
        xml += '  </url>\n';
      });

      // One canonical URL per artwork — no duplicates
      const seenUrls = new Set<string>();
      artworks.forEach(artwork => {
        // Exclude untitled artworks
        const titleTrimmed = artwork.title?.trim() ?? '';
        if (!titleTrimmed || titleTrimmed.toLowerCase() === 'untitled') return;

        // Canonical: prefer seoSlug path; fall back to /artworks/slug
        let canonicalPath: string;
        if (artwork.seoSlug?.trim()) {
          canonicalPath = `/${artwork.seoSlug.trim()}`;
        } else {
          const slug = artwork.slug || toSlug(artwork.title);
          canonicalPath = `/artworks/${slug}`;
        }

        const canonicalUrl = `${SEO_BASE_URL}${canonicalPath}`;
        if (seenUrls.has(canonicalUrl)) return; // guard against accidental duplication
        seenUrls.add(canonicalUrl);

        xml += '  <url>\n';
        xml += `    <loc>${canonicalUrl}</loc>\n`;
        xml += `    <lastmod>${today}</lastmod>\n`;
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

  app.get("/image-sitemap.xml", async (req, res) => {
    try {
      const artworks = await storage.getAllArtworks();
      const galleryPhotos = await storage.getAllGalleryPhotos();

      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n';
      xml += '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n';

      artworks.forEach(artwork => {
        if (!artwork.images || artwork.images.length === 0) return;
        xml += '  <url>\n';
        xml += `    <loc>${SEO_BASE_URL}/artworks/${artwork.id}</loc>\n`;
        artwork.images.forEach((imgSrc: string) => {
          if (imgSrc.startsWith('data:')) return;
          const imgUrl = imgSrc.startsWith('http') ? imgSrc : `${SEO_BASE_URL}${imgSrc}`;
          xml += '    <image:image>\n';
          xml += `      <image:loc>${imgUrl}</image:loc>\n`;
          xml += `      <image:title>Abstract realism portrait painting – ${artwork.title} – Ani Muradyan</image:title>\n`;
          xml += `      <image:caption>Abstract portrait oil painting by Armenian contemporary artist Ani Muradyan – ${artwork.title}. ${artwork.medium || 'Oil on canvas'}, ${artwork.year || ''}.</image:caption>\n`;
          xml += '    </image:image>\n';
        });
        xml += '  </url>\n';
      });

      if (galleryPhotos.length > 0) {
        xml += '  <url>\n';
        xml += `    <loc>${SEO_BASE_URL}/gallery</loc>\n`;
        galleryPhotos.forEach(photo => {
          if (!photo.image || photo.image.startsWith('data:')) return;
          const imgUrl = photo.image.startsWith('http') ? photo.image : `${SEO_BASE_URL}${photo.image}`;
          xml += '    <image:image>\n';
          xml += `      <image:loc>${imgUrl}</image:loc>\n`;
          xml += `      <image:title>Abstract realism portrait painting – ${photo.title || 'Exhibition photo'} – Ani Muradyan</image:title>\n`;
          xml += `      <image:caption>Exhibition photo by Ani Muradyan – ${photo.exhibitionName || ''}${photo.location ? ', ' + photo.location : ''}${photo.year ? ' (' + photo.year + ')' : ''}.</image:caption>\n`;
          xml += '    </image:image>\n';
        });
        xml += '  </url>\n';
      }

      xml += '</urlset>';

      res.setHeader('Content-Type', 'application/xml');
      res.send(xml);
    } catch (error) {
      console.error("Error generating image sitemap:", error);
      res.status(500).send('Error generating image sitemap');
    }
  });

  // 301 redirect: /artworks/:slug → canonical URL when artwork has a seoSlug
  // This eliminates duplicate artwork URLs for search engines
  app.get("/artworks/:slug", async (req, res, next) => {
    const { slug } = req.params;
    if (/^\d+$/.test(slug)) return next(); // numeric IDs — no redirect needed
    try {
      const allArtworks = await storage.getAllArtworks();
      const artwork = allArtworks.find(
        a => (a.slug || toSlug(a.title)) === slug || toSlug(a.title) === slug
      );
      if (!artwork?.seoSlug) return next();

      const canonicalPath = `/${artwork.seoSlug.trim()}`;
      const currentPath = `/artworks/${slug}`;
      if (currentPath !== canonicalPath) {
        return res.redirect(301, canonicalPath);
      }
      next();
    } catch {
      next();
    }
  });

  // Production: serve static assets + inject correct canonical URL per page
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist/public');

    // Serve static assets (JS, CSS, images) without auto-serving index.html
    app.use(express.static(distPath, { index: false }));

    const escAttr = (s: string) =>
      String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // Resolve the artwork behind a detail URL (/artworks/<slug>-<id>,
    // /artworks/<id>, or a bare SEO slug /<seoSlug>). Mirrors the API's
    // resolution order and prefers cheap indexed lookups.
    const RESERVED_PATHS = new Set([
      '', 'artworks', 'about', 'path', 'exhibitions', 'gallery', 'contact',
      'admin', 'prints', 'img', 'sitemap.xml', 'image-sitemap.xml', 'robots.txt', 'favicon.ico',
    ]);
    const resolveArtworkForPath = async (pathname: string) => {
      let param: string | null = null;
      if (pathname.startsWith('/artworks/')) param = pathname.slice('/artworks/'.length);
      else {
        const seg = pathname.replace(/^\//, '');
        if (seg && !seg.includes('/')) param = seg;
      }
      if (!param) return null;
      param = decodeURIComponent(param.split('?')[0].split('#')[0]);
      if (!param || RESERVED_PATHS.has(param)) return null;
      if (/^\d+$/.test(param)) return (await storage.getArtwork(parseInt(param))) || null;
      const bySeo = await storage.getArtworkBySeoSlug(param);
      if (bySeo) return bySeo;
      const trailing = param.match(/-(\d+)$/);
      if (trailing) {
        const byId = await storage.getArtwork(parseInt(trailing[1]));
        if (byId) return byId;
      }
      const all = await storage.getAllArtworks();
      return all.find((a) => a.slug === param || toSlug(a.title) === param) || null;
    };

    // Rewrite the shared <head> tags (title, description, OG, Twitter,
    // canonical) to the specific painting + add VisualArtwork JSON-LD, so
    // shared links and crawlers show the actual work, not the generic home page.
    const injectArtworkMeta = (html: string, a: any) => {
      const medium = a.medium || 'oil on canvas';
      const bits = [a.dimensions, a.year ? String(a.year) : null].filter(Boolean).join(', ');
      const availLine =
        a.availability === 'sold'
          ? 'This original work is in a private collection.'
          : 'Original painting available — inquire to acquire.';
      const title = `${a.title} — Original ${medium} Painting by Ani Muradyan`;
      const desc = (a.description && a.description.trim())
        ? a.description.trim().replace(/\s+/g, ' ').slice(0, 300)
        : `${a.title}, an original ${medium} painting${bits ? ` (${bits})` : ''} by Armenian contemporary artist Ani Muradyan. ${availLine}`;
      const raw = Array.isArray(a.images) ? a.images[0] : undefined;
      const image = raw && /^https?:\/\//i.test(raw) ? raw : `${SEO_BASE_URL}/img/artwork/${a.id}/0`;
      const url = `${SEO_BASE_URL}/artworks/${toSlug(a.title)}-${a.id}`;

      const setMeta = (h: string, sel: string, val: string) => {
        const re = new RegExp(`(<meta\\s+${sel}\\s+content=")[^"]*(">)`, 'i');
        return re.test(h) ? h.replace(re, `$1${escAttr(val)}$2`) : h;
      };
      html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escAttr(title)}</title>`);
      html = setMeta(html, 'name="title"', title);
      html = setMeta(html, 'name="description"', desc);
      html = setMeta(html, 'property="og:title"', title);
      html = setMeta(html, 'property="og:description"', desc);
      html = setMeta(html, 'property="og:image"', image);
      html = setMeta(html, 'property="og:url"', url);
      html = setMeta(html, 'property="og:type"', 'article');
      html = setMeta(html, 'name="twitter:title"', title);
      html = setMeta(html, 'name="twitter:description"', desc);
      html = setMeta(html, 'name="twitter:image"', image);
      html = setMeta(html, 'name="twitter:url"', url);
      html = html.replace(/<link rel="canonical"[^>]*>/i, `<link rel="canonical" href="${escAttr(url)}">`);

      const jsonld: Record<string, any> = {
        '@context': 'https://schema.org',
        '@type': 'VisualArtwork',
        name: a.title,
        image,
        url,
        artform: 'Painting',
        artMedium: medium,
        artworkSurface: 'Canvas',
        creator: { '@type': 'Person', name: 'Ani Muradyan', url: SEO_BASE_URL },
      };
      if (a.year) jsonld.dateCreated = String(a.year);
      if (a.price && a.availability === 'available') {
        jsonld.offers = {
          '@type': 'Offer', price: a.price, priceCurrency: 'EUR',
          availability: 'https://schema.org/InStock', url,
        };
      }
      const jsonStr = JSON.stringify(jsonld).replace(/</g, '\\u003c');
      html = html.replace('</head>', `  <script type="application/ld+json">${jsonStr}</script>\n</head>`);
      return html;
    };

    // Catch-all: serve index.html with per-request canonical URL injected
    app.get('*', async (req, res, next) => {
      // Skip paths with file extensions (assets already handled above)
      if (/\.[a-zA-Z0-9]+$/.test(req.path)) return next();
      try {
        let html = fs.readFileSync(path.resolve(distPath, 'index.html'), 'utf8');
        const canonicalPath = req.path === '/' ? '' : req.path;
        const canonicalUrl = `https://animuradyan.com${canonicalPath}`;
        if (html.includes('<link rel="canonical"')) {
          html = html.replace(
            /<link rel="canonical"[^>]*>/,
            `<link rel="canonical" href="${canonicalUrl}">`
          );
        } else {
          html = html.replace('</head>', `  <link rel="canonical" href="${canonicalUrl}">\n  </head>`);
        }

        // /artworks: preload data so React renders immediately (no loading state),
        // AND inject static HTML so Google's first-wave crawl sees real content.
        if (req.path === '/artworks') {
          try {
            const artworks = await storage.getAllArtworks();
            const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

            // 1. Inline JSON for React Query initialData — eliminates API wait on mount.
            // Strip base64 images to keep the payload lightweight; React Query refetches
            // in the background and will populate images shortly after mount.
            const artworksWithoutImages = artworks.map(a => ({ ...a, images: [] as string[] }));
            const safeJson = JSON.stringify(artworksWithoutImages).replace(/<\/script>/gi, '<\\/script>');
            html = html.replace('</head>', `  <script>window.__PRELOADED_ARTWORKS__=${safeJson};</script>\n</head>`);

            // 2. Static visible HTML injected before #root — real content for first-wave crawlers
            const listItems = artworks
              .filter(a => a.title && a.title.toLowerCase().trim() !== 'untitled')
              .map(a => {
                const href = a.seoSlug ? `/${a.seoSlug.trim()}` : `/artworks/${a.slug || toSlug(a.title)}`;
                const meta = [a.medium, a.year ? String(a.year) : null].filter(Boolean).join(', ');
                return `<li style="margin-bottom:0.5rem"><a href="${esc(href)}" style="color:#1d4ed8;text-decoration:underline">${esc(a.title)}</a>${meta ? ' – ' + esc(meta) : ''}</li>`;
              }).join('');

            const ssrSection =
              `<section id="artworks-ssr" style="padding:3rem 1.5rem;max-width:1200px;margin:0 auto;font-family:system-ui,sans-serif">` +
              `<h1 style="font-size:2.5rem;font-weight:700;color:#0f172a;margin-bottom:1rem">Original Artworks by Ani Muradyan</h1>` +
              `<p style="font-size:1.1rem;color:#475569;margin-bottom:1.5rem">Browse ${artworks.length} original oil paintings and abstract realism works by Armenian contemporary artist Ani Muradyan.</p>` +
              `<ul style="list-style:disc;padding-left:1.5rem;color:#334155">${listItems}</ul>` +
              `</section>`;

            html = html.replace('<div id="root">', ssrSection + '<div id="root">');
          } catch (e) {
            console.error('[SSR] /artworks prerender failed:', e);
          }
        } else {
          // Artwork detail pages: rewrite title/description/OG/Twitter tags +
          // add VisualArtwork JSON-LD so shared links and crawlers see the piece.
          try {
            const artwork = await resolveArtworkForPath(req.path);
            if (artwork) html = injectArtworkMeta(html, artwork);
          } catch (e) {
            console.error('[SSR] artwork meta injection failed:', e);
          }
        }

        res.setHeader('Content-Type', 'text/html');
        res.send(html);
      } catch {
        next();
      }
    });
  }

  const httpServer = createServer(app);
  return httpServer;
}
