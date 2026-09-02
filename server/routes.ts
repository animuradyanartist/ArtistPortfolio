import express, { type Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import { storage } from "./storage";
import { insertArtworkSchema, insertPrintSchema, insertExhibitionSchema, insertHomepageSettingsSchema, insertArtistBioSchema, insertContactSettingsSchema, insertGalleryPhotoSchema, insertBlogPostSchema, prints } from "@shared/schema";
import { artworkCanonicalUrl, artworkCanonicalPath, toSlug } from "@shared/canonical";
import { injectBreadcrumb } from "@shared/breadcrumb";
import { artworkFigure, figureImageUrl, parseArticle, parseInline } from "@shared/articleMarkdown";
import { ARTWORKS_TITLE } from "@shared/pageMeta";
import {
  ARTWORK_PRICE_CURRENCY,
  artworkImageUrl,
  artworkJsonLd,
  artworkNarrative,
  artworkOffer,
  renderArtworkHtml,
  artworkSitemapImageLocs,
} from "@shared/artworkSsr";
import { isKnownAddressFor, knownAddresses } from "@shared/artworkAddress";
import { isMissingArtworkPath } from "@shared/artworkNotFound";
import { isMissingBlogPath } from "@shared/blogNotFound";
import { isKnownRouteShape, markNotFoundHtml } from "@shared/publicRoutes";
import { collectionBySlug, collectionMembers, COLLECTIONS, isLandscape } from "@shared/collections";
import { buildLlmsTxt } from "@shared/llmsTxt";
import { renderCollectionHtml, collectionJsonLd, type CollectionRenderWork } from "@shared/collectionPrerender";
import { artworkDimensions } from "@shared/artworkSsr";
import { measurePrimaryImage } from "./imageDimensions";
import { db, hasDatabase } from "./db";
import { eq, sql } from "drizzle-orm";
import { requireAdminAuth, authenticateAdminSession, logoutAdminSession } from "./auth";
import { checkLoginAllowed, recordLoginFailure, recordLoginSuccess, clientIpOf } from "./loginRateLimit";
import { requireBlogAgent, agentFields, agentReadable, agentMayEdit, blogAgentConfigured } from "./blogAgent";
import { PATH_NARRATIVE } from "@shared/pathNarrative";
import { renderAboutHtml, renderExhibitionsHtml, renderGalleryHtml, renderContactHtml } from "./staticPagePrerender";
import { buildInfo } from "./buildInfo";
import { registerCommerceRoutes } from "./commerce/routes";
import { registerTestCheckoutRoutes } from "./commerce/testCheckout";
import { registerTestArtworkRoutes } from "./commerce/testArtwork";
import { registerAdminCommerceRoutes } from "./commerce/adminRoutes";
import { registerPromoAdminRoutes } from "./commerce/promoAdminRoutes";
import { registerPrintRoutes } from "./commerce/prints/printRoutes";
import { registerAdminPrintRoutes } from "./commerce/prints/adminPrintRoutes";
import { registerProdigiCallbackRoute } from "./commerce/prodigi/prodigiCallbackRoute";
import { registerSeoAdminRoutes } from "./seo/seoAdminRoutes";

/**
 * Render an article body to crawlable HTML.
 *
 * A deliberately small Markdown subset — headings, paragraphs, lists, links, bold — and
 * everything is ESCAPED FIRST, then a fixed set of patterns is re-introduced. That order
 * matters: it means no author, human or agent, can inject markup through a post body, and
 * it avoids taking a Markdown dependency into the server bundle for six constructs.
 *
 * The output is plain semantic HTML with inline styles, matching how /artworks injects its
 * prerendered section, so an article is real text to a first-wave crawler rather than an
 * empty shell waiting on JavaScript.
 */
/**
 * The crawlable article, built from the SAME parser the reader and the admin preview use
 * (shared/articleMarkdown). Three hand-rolled copies of this subset had drifted: none
 * handled blockquotes, and the admin preview did no inline formatting at all, so a draft
 * reached the owner showing raw link syntax. Parsing happens once; only the output idiom
 * differs here.
 */
function renderArticleHtml(
  post: {
    title: string; excerpt: string; body: string;
    publishedAt: Date | null; createdAt: Date | null;
    coverImage?: string | null; coverImageAlt?: string | null;
  },
  esc: (t: string) => string,
  artworks: Array<{ id: number; title: string; seoSlug?: string | null; medium?: string | null;
                    dimensions?: string | null; year?: number | null; availability?: string | null;
                    images?: (string | null)[] | null }> = [],
): string {
  const inline = (text: string) =>
    parseInline(text)
      .map((n) => {
        if (n.kind === "strong") return `<strong>${esc(n.text)}</strong>`;
        if (n.kind === "link") return `<a href="${esc(n.href)}" style="color:#1d4ed8;text-decoration:underline">${esc(n.text)}</a>`;
        return esc(n.text);
      })
      .join("");

  const blocks = parseArticle(post.body).map((b) => {
    if (b.kind === "heading") {
      const size = b.level === 2 ? "1.6rem" : "1.25rem";
      return `<h${b.level} style="font-size:${size};font-weight:700;color:#0f172a;margin:2rem 0 0.75rem">${inline(b.text)}</h${b.level}>`;
    }
    if (b.kind === "list") {
      return `<ul style="list-style:disc;padding-left:1.5rem;color:#334155;margin-bottom:1rem">${
        b.items.map((i) => `<li style="margin-bottom:0.35rem">${inline(i)}</li>`).join("")}</ul>`;
    }
    if (b.kind === "quote") {
      return `<blockquote style="border-left:3px solid #94a3b8;padding-left:1.25rem;margin:2rem 0;font-style:italic;color:#334155">${
        b.paragraphs.map((q) => `<p style="margin-bottom:0.75rem">${inline(q)}</p>`).join("")}</blockquote>`;
    }
    if (b.kind === "artwork") {
      const fig = artworkFigure(b.title, artworks, {
        canonicalPath: (a) => artworkCanonicalPath({ id: a.id, title: a.title, seoSlug: a.seoSlug ?? null }),
        imageUrl: figureImageUrl,
      });
      // A named work that is not hers renders as nothing — never an invented image.
      if (!fig) return "";
      const status = fig.status ? `<span style="display:block;color:#94a3b8">${esc(fig.status)}</span>` : "";
      return `<figure style="margin:2.5rem 0">` +
        `<a href="${esc(fig.href)}"><img src="${esc(fig.imageUrl)}" alt="${esc(fig.alt)}" loading="lazy" style="width:100%;height:auto;border-radius:8px;border:1px solid #e2e8f0" /></a>` +
        `<figcaption style="margin-top:0.75rem;font-size:0.9rem;color:#64748b">` +
        `<a href="${esc(fig.href)}" style="color:#334155;text-decoration:underline">${esc(fig.title)}</a>` +
        `${esc(fig.caption.slice(fig.title.length))}${status}</figcaption></figure>`;
    }
    return `<p style="font-size:1.05rem;line-height:1.75;color:#334155;margin-bottom:1rem">${inline(b.text)}</p>`;
  }).join("");

  const published = post.publishedAt ?? post.createdAt;
  const dateLine = published
    ? `<p style="color:#64748b;font-size:0.9rem;margin-bottom:1.5rem"><time datetime="${published.toISOString()}">${published.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</time> \u00b7 Ani Muradyan</p>`
    : "";
  const cover = post.coverImage
    ? `<img src="${esc(post.coverImage)}" alt="${esc(post.coverImageAlt ?? "")}" style="width:100%;height:auto;border-radius:12px;margin-bottom:2rem" />`
    : "";

  return `<article id="blog-post-ssr" style="padding:3rem 1.5rem;max-width:720px;margin:0 auto;font-family:system-ui,sans-serif">` +
    cover +
    `<h1 style="font-size:2.4rem;font-weight:700;color:#0f172a;margin-bottom:0.5rem">${esc(post.title)}</h1>` +
    dateLine +
    `<p style="font-size:1.15rem;color:#475569;margin-bottom:2rem">${esc(post.excerpt)}</p>` +
    blocks +
    `<p style="margin-top:2.5rem"><a href="/blog" style="color:#1d4ed8;text-decoration:underline">\u2190 All writing</a> \u00b7 <a href="/artworks" style="color:#1d4ed8;text-decoration:underline">See the paintings</a> \u00b7 <a href="/prints" style="color:#1d4ed8;text-decoration:underline">Fine-art prints</a></p>` +
    `</article>`;
}
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

  /**
   * THE ADDRESS INDEX — read once a minute, not once a visitor.
   *
   * Three places resolve a URL to a painting: this redirect, /api/artworks/:id, and the SSR
   * handler. All three used to answer the question by pulling the whole table, base64 images
   * and all, out of Neon. On the live site that was the single largest cost on an artwork
   * page: /artworks/69 (a bare id, which skips this redirect) answered in 0.85-1.88s while
   * the identical /artworks/road-to-tuscany-69 took 3.52-4.12s for a byte-identical 9,615-byte
   * response. The whole difference was one full-catalogue read.
   *
   * It is memoised on the same cache and the same TTL as /api/artworks, so an admin edit
   * clears it through the existing invalidateApiCache() and nothing can go stale for longer
   * than the list already could.
   */
  const artworkAddresses = () =>
    memoJson("artworks:addresses", 60_000, () => storage.getArtworkAddressIndex());


  // Direct artwork sales. Self-contained under /api/commerce/* — nothing above or below
  // changes behaviour when payment is unconfigured, which is what lets the whole system
  // ship and be verified before a Stripe key exists.
  registerCommerceRoutes(app);
  registerTestCheckoutRoutes(app);
  registerTestArtworkRoutes(app);
  registerAdminCommerceRoutes(app);
  registerPromoAdminRoutes(app);
  // Print storefront read API + Pinterest feed, and the Prodigi fulfilment callback endpoint.
  // One commerce system — these extend it; they never introduce a second checkout or order store.
  registerPrintRoutes(app);
  registerAdminPrintRoutes(app);
  registerProdigiCallbackRoute(app);
  // SEO growth system (DataForSEO). Admin-only; fails closed without credentials.
  registerSeoAdminRoutes(app);

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
    // THROTTLED BEFORE THE PASSWORD IS EVEN READ. Unlimited guesses at one secret is a
    // problem bounded only by bandwidth, and this endpoint is public.
    const ip = clientIpOf(req);
    const gate = checkLoginAllowed(ip);
    if (!gate.allowed) {
      res.setHeader("Retry-After", String(gate.retryAfterSeconds));
      return res.status(429).json({
        message: "Too many login attempts. Try again later.",
        authenticated: false,
      });
    }
    try {
      const { password } = req.body ?? {};

      if (!password) {
        return res.status(400).json({ message: "Password is required" });
      }

      if (await authenticateAdminSession(req, password)) {
        recordLoginSuccess(ip);
        res.json({ 
          message: "Login successful", 
          authenticated: true 
        });
      } else {
        recordLoginFailure(ip);
        // SAME ANSWER FOR EVERY FAILURE. A wrong password, an unconfigured server and a
        // session-store error are indistinguishable from outside: a probe learns nothing
        // about which one it hit.
        res.status(401).json({ 
          message: "Invalid password", 
          authenticated: false 
        });
      }
    } catch (error) {
      recordLoginFailure(ip);
      // Never echo the error: it can carry configuration detail to an unauthenticated caller.
      console.error("Login failed:", error);
      res.status(500).json({ message: "Login failed" });
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
        // WHICH CODE IS ANSWERING. Everything else here is true of any running build, so
        // without this a deploy can only be attested to, not observed. See buildInfo.ts.
        build: buildInfo,
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

      // ?limit=N — FOR PAGES THAT WANT A FEW WORKS, NOT THE COLLECTION.
      //
      // The artwork detail page shows three other paintings under "More from the collection"
      // and was downloading all 54 rows (111KB) to render them. The gallery still asks for
      // everything and gets everything; this only lets a caller say how many it actually
      // needs. Served from the same memoised list, so it costs the database nothing extra.
      const limit = Number.parseInt(String(req.query.limit ?? ""), 10);
      const body =
        Number.isInteger(limit) && limit > 0 ? artworks.slice(0, limit) : artworks;

      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      res.json(body);
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
        // Resolve in priority order so every URL form lands on the exact
        // piece — including duplicate titles:
        //   1. exact stored slug / seoSlug (legacy + Singulart slugs)
        //   2. our canonical "<title>-<id>" form: match the trailing id
        //   3. clean toSlug(title) (older short URLs; first match)
        //
        // THE ORDER IS UNCHANGED; WHAT IT READS IS NOT. This matched against every full row
        // in the table — every base64 image — to compare four strings, and then returned one
        // of them. Now the comparison runs on the address index and the winner is fetched by
        // its indexed id. On the live database that is the difference between 2.3-3.4s and
        // 0.5-1.2s for the same JSON.
        const addresses = await artworkAddresses();
        const trailingId = param.match(/-(\d+)$/);
        const found =
          addresses.find(a => a.slug === param || a.seoSlug === param) ||
          (trailingId ? addresses.find(a => a.id === parseInt(trailingId[1])) : undefined) ||
          addresses.find(a => toSlug(a.title) === param);
        artwork = found ? await storage.getArtwork(found.id) : undefined;
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

      // Persist the message so it shows up in the admin Messages tab.
      await storage.addMessage({
        name: String(name).trim(),
        email: String(email).trim(),
        subject: subject ? String(subject).trim() : null,
        message: String(message).trim(),
      });

      res.json({ message: "Message sent successfully" });
    } catch (error) {
      console.error("Error saving contact message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  app.get("/api/messages", requireAdminAuth, async (req, res) => {
    try {
      const list = await storage.getAllMessages();
      res.json(list);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
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
      // Where the signup converted (homepage / artwork / …) — for per-surface measurement.
      const source = typeof req.body?.source === "string" ? req.body.source.slice(0, 40) : null;
      const collector = await storage.addCollector(email, source);
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

  // ── Blog ──────────────────────────────────────────────────────────────────
  //
  // Two audiences, one store. The PUBLIC routes never pass `includeDrafts`, so an
  // unpublished post cannot leak by omission; the admin routes require the same session
  // auth as the artworks CMS. The Career OS writes here as an authenticated client — it
  // creates DRAFTS, and only Ani moves one to `published`.

  app.get("/api/blog", async (_req, res) => {
    try {
      res.json(await storage.getBlogPosts());
    } catch (error) {
      console.error("Error fetching blog posts:", error);
      res.status(500).json({ message: "Failed to fetch blog posts" });
    }
  });

  app.get("/api/blog/:slug", async (req, res) => {
    try {
      const post = await storage.getBlogPostBySlug(req.params.slug);
      if (!post) return res.status(404).json({ message: "Post not found" });
      res.json(post);
    } catch (error) {
      console.error("Error fetching blog post:", error);
      res.status(500).json({ message: "Failed to fetch blog post" });
    }
  });

  /** Admin view — the only route that returns drafts. */
  app.get("/api/admin/blog", requireAdminAuth, async (_req, res) => {
    try {
      res.json(await storage.getBlogPosts({ includeDrafts: true }));
    } catch (error) {
      console.error("Error fetching blog drafts:", error);
      res.status(500).json({ message: "Failed to fetch blog drafts" });
    }
  });

  app.post("/api/admin/blog", requireAdminAuth, async (req, res) => {
    try {
      const parsed = insertBlogPostSchema.parse({
        ...req.body,
        // A post arrives as a draft whatever the caller says. Publishing is a separate,
        // deliberate act — an agent must never be able to go live in one call.
        status: "draft",
        slug: toSlug(String(req.body?.slug || req.body?.title || "")),
      });
      if (!parsed.slug) return res.status(400).json({ message: "A title or slug is required" });
      const existing = await storage.getBlogPostBySlug(parsed.slug, { includeDrafts: true });
      if (existing) return res.status(409).json({ message: "A post with that slug already exists", id: existing.id });
      res.status(201).json(await storage.createBlogPost(parsed));
    } catch (error) {
      console.error("Error creating blog post:", error);
      res.status(400).json({ message: "Invalid blog post", detail: error instanceof Error ? error.message : undefined });
    }
  });

  /**
   * Edit a post's CONTENT. It cannot change `status`, and that separation is the point.
   *
   * `insertBlogPostSchema.partial()` includes `status`, so this route used to be able to
   * publish in a single call — which defeated the rule stated on the create route above,
   * that an agent must never go live in one call. Forcing drafts on POST is worthless if
   * the very next PATCH can flip the same row public.
   *
   * Writing and publishing are now different verbs on different routes. Today both sit
   * behind the same admin session, so this is not yet a privilege boundary — it is the
   * SEAM that lets one exist. When Career OS is eventually given a credential to draft
   * articles, that credential can be granted here and withheld from /publish, and the
   * safety model becomes something the server enforces rather than something a comment
   * promises.
   */
  app.patch("/api/admin/blog/:id", requireAdminAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      const patch = insertBlogPostSchema.partial().omit({ status: true, publishedAt: true }).parse(req.body);
      // Say so rather than ignoring it silently: a caller that thought it published
      // something must not walk away believing it did.
      if ("status" in (req.body ?? {})) {
        return res.status(400).json({ message: "Use POST /api/admin/blog/:id/publish to change whether a post is live" });
      }
      const updated = await storage.updateBlogPost(id, patch);
      if (!updated) return res.status(404).json({ message: "Post not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating blog post:", error);
      res.status(400).json({ message: "Invalid update", detail: error instanceof Error ? error.message : undefined });
    }
  });

  /**
   * Delete a post for good. Admin only, and never reachable by the agent — an agent that
   * can destroy the owner's writing is a worse problem than one that can publish it.
   */
  app.delete("/api/admin/blog/:id", requireAdminAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      const ok = await storage.deleteBlogPost(id);
      if (!ok) return res.status(404).json({ message: "Post not found" });
      res.json({ deleted: true, id });
    } catch (error) {
      console.error("Error deleting blog post:", error);
      res.status(500).json({ message: "Could not delete post" });
    }
  });

  // ── The agent's scoped path ───────────────────────────────────────────────
  //
  // Two routes, one credential, no way to go live. `requireBlogAgent` accepts a token that
  // the publish and delete routes above do not — the boundary is which door the key opens,
  // not what the caller was asked to do. There is no agent publish route to disable.

  /**
   * THE LIBRARY, as the agent sees it — read-only, and the reason it can stop repeating
   * itself.
   *
   * Non-duplication cannot be checked from titles. Two articles share a thesis, an artwork,
   * a quotation or a conclusion in their PROSE, so the prose is what has to be comparable.
   * Drafts are included deliberately: a draft the owner has not published yet is exactly
   * the thing a second draft is most likely to collide with, and it is invisible on every
   * public route.
   *
   * Nothing here mutates. There is no id parameter, no body, no status field to set. It
   * reads through the same storage call the admin list uses, then narrows to an allowlist,
   * so a column added later is not silently exposed.
   */
  app.get("/api/agent/blog", requireBlogAgent, async (_req, res) => {
    try {
      const posts = await storage.getBlogPosts({ includeDrafts: true });
      res.json(posts.map((p) => agentReadable(p as unknown as Record<string, unknown>)));
    } catch (error) {
      console.error("Error listing posts for agent:", error);
      res.status(500).json({ message: "Failed to list posts" });
    }
  });

  app.post("/api/agent/blog", requireBlogAgent, async (req, res) => {
    try {
      const fields = agentFields(req.body);
      const slug = toSlug(String((fields.slug as string) || (fields.title as string) || ""));
      if (!slug) return res.status(400).json({ message: "A title or slug is required" });
      if (!fields.title || !fields.excerpt || !fields.body) {
        return res.status(400).json({ message: "title, excerpt and body are required" });
      }
      const existing = await storage.getBlogPostBySlug(slug, { includeDrafts: true });
      if (existing) return res.status(409).json({ message: "A post with that slug already exists", id: existing.id });
      const parsed = insertBlogPostSchema.parse({
        ...fields,
        slug,
        // Not negotiable, and not read from the request: the agent's every post is a draft
        // that Ani has not seen yet.
        status: "draft",
        origin: "career_os",
      });
      const created = await storage.createBlogPost(parsed);
      res.status(201).json({ id: created.id, slug: created.slug, status: created.status, reviewUrl: `${SEO_BASE_URL}/admin` });
    } catch (error) {
      console.error("Error creating agent draft:", error);
      res.status(400).json({ message: "Invalid draft", detail: error instanceof Error ? error.message : undefined });
    }
  });

  app.patch("/api/agent/blog/:id", requireBlogAgent, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      const current = await storage.getBlogPostById(id);
      const may = agentMayEdit(current);
      if (!may.ok) return res.status(current ? 403 : 404).json({ message: may.reason });
      const patch = insertBlogPostSchema.partial().omit({ status: true, publishedAt: true, origin: true })
        .parse(agentFields(req.body));
      const updated = await storage.updateBlogPost(id, patch);
      res.json({ id: updated!.id, slug: updated!.slug, status: updated!.status });
    } catch (error) {
      console.error("Error updating agent draft:", error);
      res.status(400).json({ message: "Invalid update", detail: error instanceof Error ? error.message : undefined });
    }
  });

  /**
   * THE MEASUREMENT CONTRACT, readable by whoever published it.
   *
   * A published article is only an intervention if something can later ask "did it work?".
   * This returns, for every live post, the final URL, when it went live, the decision that
   * produced it, what that decision expected to move, and how long to wait before judging.
   * Public because none of it is secret — it is the same information the article itself
   * declares — and read-only.
   */
  app.get("/api/blog-measurement", async (_req, res) => {
    try {
      const posts = await storage.getBlogPosts();
      res.json(posts.map((p) => ({
        id: p.id,
        url: `${SEO_BASE_URL}/blog/${p.slug}`,
        slug: p.slug,
        title: p.title,
        publishedAt: p.publishedAt,
        origin: p.origin,
        decisionRef: p.decisionRef,
        expectedOutcome: p.expectedOutcome,
        measurementHorizonDays: p.measurementHorizonDays,
        // When the horizon closes — computed here so every reader agrees on the date.
        measurableFrom: p.publishedAt && p.measurementHorizonDays
          ? new Date(p.publishedAt.getTime() + p.measurementHorizonDays * 86400000).toISOString()
          : null,
      })));
    } catch (error) {
      console.error("Error building measurement contract:", error);
      res.status(500).json({ message: "Failed to build measurement contract" });
    }
  });

  /** Take a post live, or pull it back. The one act that changes what the public sees. */
  app.post("/api/admin/blog/:id/publish", requireAdminAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      // Default is to publish; `{ "live": false }` reverts a post to a draft.
      const live = req.body?.live !== false;
      const updated = await storage.updateBlogPost(id, { status: live ? "published" : "draft" });
      if (!updated) return res.status(404).json({ message: "Post not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error publishing blog post:", error);
      res.status(400).json({ message: "Could not change publication state" });
    }
  });

  // API requests are never pages. Keep this after every API route and before every
  // public-page/SPA fallback so a typo or missing backend route cannot masquerade as a
  // successful HTML response and then fail in the browser's JSON parser.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  // Slug helper: toSlug is imported from @shared/canonical (single source).

  // SEO Routes
  const SEO_BASE_URL = 'https://animuradyan.com';

  app.get("/robots.txt", async (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.send(`User-agent: *
Allow: /
Allow: /about
Allow: /path
Allow: /artworks
Allow: /artworks/*
Allow: /prints
Allow: /prints/*
Allow: /gallery
Allow: /exhibitions
Allow: /contact

Disallow: /admin
Disallow: /api
Disallow: /__test-purchase

Sitemap: ${SEO_BASE_URL}/sitemap.xml
Sitemap: ${SEO_BASE_URL}/image-sitemap.xml

# Plain-language facts for AI assistants and answer engines:
# ${SEO_BASE_URL}/llms.txt

Crawl-delay: 1
`);
  });

  // /llms.txt — a short, correct, plain-language index of the facts for AI assistants and
  // answer engines (already this site's largest referral source). Every figure is derived
  // from the live catalogue, so it cannot drift from what the pages actually say. Registered
  // here, before the SPA catch-all, so the well-known path serves a real text file rather than
  // the HTML shell it used to return with a 200.
  app.get("/llms.txt", async (_req, res) => {
    try {
      const [artworks, exhibitions, bio] = await Promise.all([
        storage.getAllArtworks().catch(() => []),
        storage.getAllExhibitions().catch(() => []),
        storage.getArtistBio().catch(() => undefined),
      ]);
      const available = artworks.filter((a) => a.availability === "available");
      const priced = available.map((a) => Number(a.price)).filter((n) => Number.isFinite(n) && n > 0);
      const mediums = Array.from(
        new Set(artworks.map((a) => (a.medium || "").trim()).filter(Boolean).map((m) => m.replace(/\s+/g, " "))),
      ).slice(0, 6);
      const isLand = (a: typeof artworks[number]) => isLandscape({ title: a.title, description: a.description });
      const years = exhibitions.map((e) => e.year || 0).filter((y) => y > 0);
      const body = buildLlmsTxt({
        baseUrl: SEO_BASE_URL,
        totalWorks: artworks.length,
        availableWorks: available.length,
        landscapeAvailable: available.filter(isLand).length,
        figurativeAvailable: available.filter((a) => !isLand(a)).length,
        largeAvailable: available.filter((a) => a.size === "large").length,
        priceMin: priced.length ? Math.min(...priced) : null,
        priceMax: priced.length ? Math.max(...priced) : null,
        currency: ARTWORK_PRICE_CURRENCY,
        mediums,
        exhibitionCount: exhibitions.length,
        latestExhibitionYear: years.length ? Math.max(...years) : null,
        bio: bio?.description ?? null,
        statement: bio?.statement ?? null,
        collectionSlugs: COLLECTIONS.map((c) => ({ slug: c.slug, heading: c.heading })),
      });
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(body);
    } catch (e) {
      console.error("[llms.txt] generation failed:", e);
      res.status(500).setHeader("Content-Type", "text/plain").send("");
    }
  });

  /**
   * XML escaping for sitemap text. The image sitemap interpolated artwork titles and
   * captions raw: one ampersand in a title produces a document Google rejects outright,
   * taking all 154 image declarations with it.
   */
  const escXml = (v: unknown) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  app.get("/sitemap.xml", async (req, res) => {
    try {
      const artworks = await storage.getAllArtworks();
      const today = new Date().toISOString().split('T')[0];

      // Static public pages — /prints is excluded (the client redirects it to /).
      //
      // /about and /path were both missing, and both were earning without help. /about is
      // the second strongest page on the site — 90 impressions at position 10.8 over 90
      // days, more than /artworks — and it had never been submitted. /path carries roughly
      // 1,500 words of her own writing and is now server-rendered, so it is real text to a
      // crawler rather than an empty shell. Leaving a page that already ranks out of the
      // sitemap withholds the one signal that costs nothing to give.
      const staticPages = [
        { url: '/', priority: '1.0', changefreq: 'weekly' },
        { url: '/artworks', priority: '0.9', changefreq: 'weekly' },
        { url: '/about', priority: '0.8', changefreq: 'monthly' },
        { url: '/path', priority: '0.8', changefreq: 'monthly' },
        { url: '/exhibitions', priority: '0.8', changefreq: 'monthly' },
        { url: '/gallery', priority: '0.8', changefreq: 'monthly' },
        { url: '/contact', priority: '0.7', changefreq: 'monthly' },
        // Buyer-intent collection landing pages — commercial-intent surfaces, high priority.
        ...COLLECTIONS.map((c) => ({ url: `/collections/${c.slug}`, priority: '0.9', changefreq: 'weekly' as const })),
      ];

      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
      // Blog index + every PUBLISHED article. Drafts are never listed — the sitemap is a
      // public declaration, and declaring an unpublished URL invites a 404 from Google.
      try {
        const posts = await storage.getBlogPosts();
        // Only declare the index once it has something in it. A sitemap is a public
        // statement that a URL is worth crawling, and /blog with no posts is a page that
        // says "No articles published yet" — submitting that spends crawl budget to prove
        // there is nothing there.
        if (posts.length > 0) {
          xml += `  <url>\n    <loc>${SEO_BASE_URL}/blog</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
        }
        for (const post of posts) {
          const lastmod = (post.updatedAt ?? post.publishedAt ?? post.createdAt);
          xml += `  <url>\n    <loc>${SEO_BASE_URL}/blog/${post.slug}</loc>\n` +
            (lastmod ? `    <lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>\n` : '') +
            `    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
        }
      } catch (e) {
        console.error('Error adding blog posts to sitemap:', e);
      }

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

        // THE URL IN THE SITEMAP MUST BE THE URL THE PAGE CALLS CANONICAL.
        //
        // It was not, for all 53 works. This fell back to the `slug` column — the
        // marketplace slug carrying Singulart's id ("/artworks/ani-muradyan-path-to-
        // tranquility-2096103") — while the page's own <link rel="canonical">, the 301 and
        // the client all point at "/artworks/path-to-tranquility-78". Both URLs answer 200,
        // so Google was invited to crawl a URL that then told it "the real one is
        // elsewhere", and the real one appeared in no sitemap at all. A sitemap of
        // non-canonical duplicates is close to the worst thing to submit: it spends crawl
        // budget arguing with itself, and no artwork page has ever received an impression.
        //
        // artworkCanonicalPath IS that single source of truth — the same function the
        // canonical tag, the redirect and the client already use.
        const canonicalUrl = artworkCanonicalUrl(SEO_BASE_URL, artwork);
        if (seenUrls.has(canonicalUrl)) return; // guard against accidental duplication
        seenUrls.add(canonicalUrl);

        xml += '  <url>\n';
        xml += `    <loc>${escXml(canonicalUrl)}</loc>\n`;
        xml += `    <lastmod>${today}</lastmod>\n`;
        xml += '    <changefreq>monthly</changefreq>\n';
        xml += '    <priority>0.8</priority>\n';
        xml += '  </url>\n';
      });

      // PRINT PDPs — ONLY genuinely purchasable prints (a ready master + an eligible+enabled+priced
      // variant). Today that set is empty, so this adds nothing; when a real master lands, the print
      // pages enter the sitemap automatically without a code change. The /prints collection index is
      // added only when it actually has products, for the same reason the catch-all noindexes it empty.
      try {
        const { getPurchasablePrintCollection } = await import('./commerce/prints/printRepo');
        const { printCanonicalUrl } = await import('@shared/commerce/printProduct');
        const printCards = await getPurchasablePrintCollection();
        if (printCards.length > 0) {
          const printsIndex = `${SEO_BASE_URL}/prints`;
          if (!seenUrls.has(printsIndex)) {
            seenUrls.add(printsIndex);
            xml += `  <url>\n    <loc>${escXml(printsIndex)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
          }
          for (const card of printCards) {
            const loc = printCanonicalUrl(SEO_BASE_URL, card.slug);
            if (seenUrls.has(loc)) continue;
            seenUrls.add(loc);
            xml += '  <url>\n';
            xml += `    <loc>${escXml(loc)}</loc>\n`;
            xml += `    <lastmod>${today}</lastmod>\n`;
            xml += '    <changefreq>monthly</changefreq>\n';
            xml += '    <priority>0.6</priority>\n';
            xml += '  </url>\n';
          }
        }
      } catch (e) {
        console.error("Error adding prints to sitemap:", e);
      }

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
        // Same canonical rule as sitemap.xml: images must hang off the page Google is
        // meant to index. This declared "/artworks/{id}" — a third live URL for the same
        // painting, and another one the page itself disowns via its canonical tag.
        xml += `    <loc>${escXml(artworkCanonicalUrl(SEO_BASE_URL, artwork))}</loc>\n`;
        // FIRST-PARTY IMAGES ARE NOT SKIPPED ANY MORE.
        //
        // A `data:` entry used to be dropped, on the reasonable-sounding grounds that a
        // base64 blob is not a URL. But the site already serves those bytes at a real,
        // crawlable address, so dropping them declared nothing for every self-hosted work:
        // 38 images across 14 artworks, announced to Google Images nowhere at all.
        //
        // The rule itself lives in shared/artworkSsr so the sitemap and the page cannot
        // disagree about which images an artwork has.
        artworkSitemapImageLocs(artwork.id, refifyImages("artwork", artwork).images, SEO_BASE_URL).forEach((imgUrl: string) => {
          xml += '    <image:image>\n';
          xml += `      <image:loc>${escXml(imgUrl)}</image:loc>\n`;
          // Every image previously claimed to be an "abstract realism PORTRAIT painting",
          // including the landscapes. A caption is a machine-readable statement about the
          // picture; describing a landscape as a portrait is simply false, and it was said
          // 154 times. These now state the work's own medium and her own description.
          xml += `      <image:title>${escXml(`${artwork.title} — ${artwork.medium || 'Oil on canvas'} painting by Ani Muradyan`)}</image:title>\n`;
          xml += `      <image:caption>${escXml(artworkNarrative(artwork))}</image:caption>\n`;
          xml += '    </image:image>\n';
        });
        xml += '  </url>\n';
      });

      // THE SAME DEFECT AS THE ARTWORK LOOP ABOVE, ONE LOOP LOWER.
      //
      // Every gallery photograph is stored as a `data:` row, so this skip dropped all 16 of
      // them and /gallery entered the sitemap as a <url> element with nothing inside it —
      // an entry that spends crawl budget to say nothing at all.
      //
      // The bytes are already served at /img/gallery/:id/0, so the address is real and
      // declaring it is not a promise the site cannot keep. This is the rule the artwork
      // loop above already follows; it is written out here rather than shared, because
      // artworkSitemapImageLocs exists to stop the sitemap and the SSR page disagreeing
      // about an artwork's images, and nothing else renders gallery photographs.
      //
      // A gallery row holds ONE image in a single `image` column, so the index is always 0
      // — the same ref server/images.ts builds via toImageRef().
      const galleryImages = galleryPhotos.flatMap(photo => {
        if (!photo.image) return [];
        const imgUrl = photo.image.startsWith('data:')
          ? `${SEO_BASE_URL}/img/gallery/${photo.id}/0`
          : photo.image.startsWith('http')
            ? photo.image
            : `${SEO_BASE_URL}${photo.image}`;
        return [{ photo, imgUrl }];
      });

      // Gate on what will actually be declared, not on how many rows exist. The old guard
      // counted rows, which is how an empty <url> element reached production.
      if (galleryImages.length > 0) {
        xml += '  <url>\n';
        xml += `    <loc>${SEO_BASE_URL}/gallery</loc>\n`;
        galleryImages.forEach(({ photo, imgUrl }) => {
          xml += '    <image:image>\n';
          xml += `      <image:loc>${escXml(imgUrl)}</image:loc>\n`;
          // A studio/exhibition photograph is not a painting, and was being announced as
          // one ("Abstract realism portrait painting"). It states what it is.
          xml += `      <image:title>${escXml(`${photo.title || 'Exhibition photo'} — Ani Muradyan`)}</image:title>\n`;
          xml += `      <image:caption>${escXml(`Exhibition photo by Ani Muradyan${photo.exhibitionName ? ` – ${photo.exhibitionName}` : ''}${photo.location ? `, ${photo.location}` : ''}${photo.year ? ` (${photo.year})` : ''}.`)}</image:caption>\n`;
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

  /**
   * ONE ARTWORK, ONE URL — enforced with a 301 rather than argued with a canonical tag.
   *
   * This redirect existed and never fired. It was gated on `artwork.seoSlug`, and seoSlug is
   * null for all 54 works, so every legacy address answered 200 instead. The page then said
   * "the real one is elsewhere" in a canonical tag, which is a hint Google may honour late or
   * not at all — and 55 of those legacy URLs are sitting in Search Console as
   * "Discovered – currently not indexed, last crawled: N/A".
   *
   * They were discovered because the sitemap used to emit them. It no longer does. But
   * discovery is permanent: Google keeps a queue, and the cheapest way to empty it is to
   * answer those URLs with a redirect instead of a page.
   *
   * The mapping is provably unambiguous — 54 of 54 works have a distinct `slug`, and no
   * legacy slug's trailing number collides with a real artwork id (marketplace ids are seven
   * digits; artwork ids run 9–79). So this can never send one painting's URL to another
   * painting.
   */
  const artworkForSlug = async (slug: string) => {
    const all = await artworkAddresses();
    return all.find((a) => isKnownAddressFor(a, slug)) ?? null;
  };

  app.get("/artworks/:slug", async (req, res, next) => {
    const { slug } = req.params;
    if (/^\d+$/.test(slug)) return next(); // bare numeric id is handled by the SSR path
    try {
      const artwork = await artworkForSlug(slug);
      if (!artwork) return next();

      const canonicalPath = artworkCanonicalPath({
        id: artwork.id, title: artwork.title, seoSlug: artwork.seoSlug ?? null,
      });
      if (`/artworks/${slug}` !== canonicalPath) return res.redirect(301, canonicalPath);
      next();
    } catch {
      next();
    }
  });

  // /prints AND EVERYTHING UNDER IT NOW HAVE REAL ROUTES.
  //
  // The old blanket `301 → /` existed because these paths used to be an unbounded soft-404
  // surface: no server route, no real page, just an empty shell with a self-canonical for
  // /prints/anything-at-all. That is fixed properly now — the print storefront (`/prints`) and
  // PDPs (`/prints/:slug`) are real, data-gated pages, and the production catch-all below injects
  // per-print meta + Product JSON-LD for a genuinely purchasable print, and a `noindex` robots
  // directive for the (currently empty) collection and for any unready/unknown print. So the
  // soft-404 concern is answered by "only real, purchasable prints are indexable" rather than by
  // hiding the whole namespace. The redirect is therefore removed; nothing falls through to an
  // unhandled shell.

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
      '', 'artworks', 'about', 'path', 'exhibitions', 'gallery', 'contact', 'blog',
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

      // ONE INDEX READ, THEN ONE ROW.
      //
      // The rules below are exactly the rules that were here before — seoSlug first, then a
      // trailing id that must genuinely belong to the work, then the stored or title slug.
      // They are now all answered from the memoised address index, so deciding WHICH painting
      // this URL means costs no database round trip at all, and only the painting that won is
      // actually fetched.
      const all = await artworkAddresses();

      const bySeo = all.find((a) => a.seoSlug === param);
      if (bySeo) return (await storage.getArtwork(bySeo.id)) || null;

      // THE TRAILING ID MUST AGREE WITH THE REST OF THE ADDRESS.
      //
      // This used to accept any prefix at all: `-40` on the end was enough, so
      // /artworks/total-nonsense-40 and even /completely-made-up-40 served Blue Drift, in
      // full, with VisualArtwork markup and a canonical tag. That is an unbounded family of
      // near-duplicate URLs for every painting — exactly the low-value space a crawler
      // discovers, queues, and then declines to spend budget on.
      //
      // The id still does the lookup, because that is what makes legacy and shortened
      // addresses work. It just has to be an address that actually belongs to that work.
      const trailing = param.match(/-(\d+)$/);
      if (trailing) {
        const wanted = parseInt(trailing[1]);
        const byId = all.find((a) => a.id === wanted);
        if (byId && isKnownAddressFor(byId, param)) return (await storage.getArtwork(byId.id)) || null;
      }

      const match = all.find((a) => a.slug === param || toSlug(a.title) === param);
      return match ? (await storage.getArtwork(match.id)) || null : null;
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
      // Her published description when she wrote one, otherwise the stated facts of the
      // row — the same sentence the crawlable body and the JSON-LD use, so the three
      // never describe the same painting differently.
      const desc = (a.description && a.description.trim())
        ? artworkNarrative(a).slice(0, 300)
        : `${artworkNarrative(a)} ${availLine}`;
      const raw = Array.isArray(a.images) ? a.images[0] : undefined;
      // Same URL the SSR <img>, the JSON-LD and the rendered page use — a site-relative
      // /img/...?v=<hash> path is preserved so every surface names one image, not two.
      const image = raw && /^https?:\/\//i.test(raw) ? raw
        : raw && raw.startsWith('/') ? `${SEO_BASE_URL}${raw}`
        : `${SEO_BASE_URL}/img/artwork/${a.id}/0`;
      // Canonical URL: prefer /{seoSlug} (matches sitemap.xml + client canonical),
      // fall back to /artworks/{titleSlug}-{id} only when seoSlug is absent.
      // Feeds BOTH the canonical <link> and og:url below (single source).
      const url = artworkCanonicalUrl(SEO_BASE_URL, a);

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

      // Structured data comes from the shared builder, which is also what /artworks reads.
      // The currency lived in two places and disagreed — EUR here, USD on the sales page,
      // for the same 35 works — so one of the site's two machine-readable prices was
      // always wrong. There is now one definition and no way to state a second.
      const jsonStr = JSON.stringify(artworkJsonLd(a, SEO_BASE_URL)).replace(/</g, '\\u003c');
      // id="artwork-jsonld": the id the React page's injectJsonLd() targets. Without it the
      // server block and the client block are two separate <script>s — duplicate VisualArtwork
      // structured data, and until now with two different image URLs. Sharing the id means the
      // client UPDATES this one in place, so the rendered page carries exactly one.
      html = html.replace('</head>', `  <script type="application/ld+json" id="artwork-jsonld">${jsonStr}</script>\n</head>`);
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

        // PRINTS: real SSR for the storefront + PDPs (this replaced the old blanket 301 → /).
        // Only a genuinely purchasable print is indexable + carries a Product JSON-LD Offer; the
        // (currently empty) collection and any unready/unknown print is served `noindex`, so the
        // /prints namespace never becomes an indexable soft-404 surface.
        if (req.path === '/prints' || req.path.startsWith('/prints/')) {
          const setRobots = (h: string, val: string) => {
            const tag = `<meta name="robots" content="${val}">`;
            return /<meta\s+name="robots"[^>]*>/i.test(h)
              ? h.replace(/<meta\s+name="robots"[^>]*>/i, tag)
              : h.replace('</head>', `  ${tag}\n</head>`);
          };
          try {
            const { getPrintDetailBySlug, getPurchasablePrintCollection, printSlugOf } = await import('./commerce/prints/printRepo');
            const { isPubliclyPurchasable, startingPriceMinor } = await import('@shared/commerce/printProduct');
            const { injectPrintMeta, renderPrintHtml } = await import('@shared/printSsr');
            const { serializePrintDetail } = await import('./commerce/prints/printDetailSerializer');

            if (req.path === '/prints') {
              const cards = await getPurchasablePrintCollection();
              if (!cards.length) {
                // Nothing purchasable yet — do not advertise an empty shop.
                html = setRobots(html, 'noindex,follow');
                return res.status(200).set('Content-Type', 'text/html').send(html);
              }
              // A REAL MONEY PAGE. Until now /prints inherited the homepage <title> + meta, so a
              // crawl of the site's print shop read "Ani Muradyan – Contemporary Oil Painter" and
              // nothing about fine-art prints. `injectPrintsIndexMeta` (pure + unit-tested) gives it
              // its own title/description/OG/canonical, a crawlable heading + print links, a
              // CollectionPage JSON-LD and robots index,follow — no keyword stuffing.
              const { injectPrintsIndexMeta } = await import('@shared/printSsr');
              html = injectPrintsIndexMeta(html, cards.map((c) => ({ title: c.title, slug: c.slug })), SEO_BASE_URL);
              return res.status(200).set('Content-Type', 'text/html').send(html);
            }

            const slug = decodeURIComponent(req.path.slice('/prints/'.length).split('/')[0].split('?')[0]);
            const detail = slug ? await getPrintDetailBySlug(slug) : null;
            if (detail) {
              const ssr = {
                id: detail.print.id,
                slug: printSlugOf(detail.print),
                title: detail.print.title,
                description: detail.print.description,
                // Use the print's SOURCE-ARTWORK image URL, not the print's stored base64 data URI.
                // `detail.print.images[0]` is a base64 string, so printImageUrl turned it into the
                // broken URL `https://animuradyan.com/data:image/png;base64,…` for og:image/twitter:
                // image AND the SSR <img>, and inlining that ~1MB blob three times bloated the crawled
                // HTML to ~1.1MB (7.5MB rendered). A base64-heavy page with a broken product image is
                // a Soft-404 risk. `/img/artwork/:id/0` is the SAME real, fetchable image URL artwork
                // pages use (which index fine) — a short URL, a valid og:image, a clean page.
                image: detail.print.artworkId != null ? `/img/artwork/${detail.print.artworkId}/0` : null,
                artworkId: detail.print.artworkId,
                purchasable: detail.variants.some((v) => isPubliclyPurchasable(v, detail.master)),
                startingPriceMinor: startingPriceMinor(detail.variants, detail.master),
                currency: detail.variants[0]?.currency ?? 'EUR',
              };
              html = injectPrintMeta(html, ssr, SEO_BASE_URL);
              // Breadcrumb trail (Home → Fine Art Prints → this print) for the rich result + structure.
              html = injectBreadcrumb(html, [
                { name: "Home", url: `${SEO_BASE_URL}/` },
                { name: "Fine Art Prints", url: `${SEO_BASE_URL}/prints` },
                { name: detail.print.title, url: `${SEO_BASE_URL}/prints/${ssr.slug}` },
              ]);
              // SOFT-404 FIX. injectPrintMeta only writes the <head> (title/meta/canonical/Product
              // JSON-LD), so a print PDP was served an EMPTY body — `<div id="root"></div>` with no
              // <h1> and no words. When Googlebot does not run/complete the client render, it sees a
              // page with zero visible content and classifies it Soft 404 (even with valid head
              // metadata). Inject the real body (heading, image, description, price, link to the
              // original) INSIDE #root, exactly like /artworks/:slug and /blog/:slug do — createRoot()
              // replaces it on mount, so there is no duplicate content and no hydration mismatch.
              html = html.replace('<div id="root"></div>', `<div id="root">${renderPrintHtml(ssr, SEO_BASE_URL)}</div>`);

              // HYDRATION SOFT-404 FIX. The React PDP resolves the print by fetching
              // /api/commerce/prints/:slug at runtime — but robots.txt disallows /api, and Google's
              // renderer obeys robots for subresource fetches, so that fetch is BLOCKED during Google's
              // render. The client then hit `isError` and replaced this correct SSR body with
              // "This print could not be found." — a Soft 404 on a page whose head already had a valid
              // Product + Offer. Seeding the EXACT /api response shape here (serializePrintDetail — one
              // contract) lets the client render from the server's own copy with no fetch, exactly as
              // the artwork PDP does via __PRELOADED_ARTWORK__. Never carries base64 or the master.
              const preloadJson = JSON.stringify(serializePrintDetail(detail)).replace(/</g, '\\u003c');
              html = html.replace('</head>', `  <script>window.__PRELOADED_PRINT__=${preloadJson};</script>\n</head>`);
              return res.status(200).set('Content-Type', 'text/html').send(html);
            }
            // Unknown print slug — never an indexable soft-404.
            html = setRobots(html, 'noindex,follow');
            return res.status(404).set('Content-Type', 'text/html').send(html);
          } catch {
            html = setRobots(html, 'noindex,follow');
            return res.status(200).set('Content-Type', 'text/html').send(html);
          }
        }

        // BLOG: the whole point of the blog is search, and this site renders on the
        // client — a crawl of "/" sees 39 characters and no <h1>. An article that exists
        // only inside the React bundle is an SEO page with no SEO, so the text, the
        // headings and the Article JSON-LD are injected here, exactly as /artworks does.
        // /artworks ITEM LIST — replace fabricated structured data with the real thing.
        //
        // index.html ships a STATIC ItemList on every page claiming `numberOfItems: 10`
        // and listing a single invented entry called "Abstract Realism Painting" whose url
        // points at the index rather than a work. She has 54 paintings and none is called
        // that. Inaccurate schema is worse than absent schema: it is a machine-readable
        // claim about the site that is false, and it was being made on every page.
        //
        // This builds the list from the same rows the page renders, and carries `offers`
        // using the price and availability the artwork DETAIL pages already publish — so a
        // crawler can see which of the 54 are actually for sale. No new data, no new copy.
        if (req.path === "/artworks") {
          try {
            const all = await storage.getAllArtworks();
            const items = all.slice(0, 60).map((rawA, i) => {
              const a = refifyImages("artwork", rawA);
              const medium = a.medium || "Oil on canvas";
              const item: Record<string, unknown> = {
                "@type": "VisualArtwork",
                name: a.title,
                artist: { "@type": "Person", name: "Ani Muradyan" },
                artMedium: medium,
                artform: "Painting",
                url: artworkCanonicalUrl(SEO_BASE_URL, a),
                // The work's own primary image — the same one the detail page and the image
                // sitemap declare, so all three agree on what the painting looks like.
                image: artworkImageUrl(a, SEO_BASE_URL),
              };
              // Only claim an offer when the work is genuinely purchasable and priced —
              // an offer on a sold painting is a promise the site cannot keep. Built by the
              // same helper the detail page uses, so the two pages cannot name different
              // currencies for one painting again.
              const offer = artworkOffer(a, SEO_BASE_URL);
              if (offer) item.offers = offer;
              return { "@type": "ListItem", position: i + 1, item };
            });
            const list = {
              "@context": "https://schema.org",
              "@type": "ItemList",
              name: "Original Oil Paintings by Ani Muradyan",
              description:
                "Original figurative and landscape oil paintings by Armenian contemporary artist Ani Muradyan.",
              url: `${SEO_BASE_URL}/artworks`,
              numberOfItems: all.length,
              itemListElement: items,
            };
            // Drop the static block first so the page carries ONE ItemList, not two.
            html = html.replace(
              /<script type="application\/ld\+json">\s*\{[^<]*?"@type":\s*"ItemList"[\s\S]*?<\/script>/i,
              "",
            );
            html = html.replace(
              "</head>",
              `  <script type="application/ld+json">${JSON.stringify(list).replace(/</g, "\\u003c")}</script>\n</head>`,
            );
          } catch (e) {
            console.error("[SSR] /artworks ItemList failed:", e);
          }
        }

        // TOP-LEVEL PAGE TITLES — every page shipped the same one.
        //
        // "/", "/artworks", "/path", "/exhibitions" and "/contact" all served
        // "Ani Muradyan – Contemporary Oil Painter". The single most valuable on-page
        // element was spent five times over on the one query she already ranks first for,
        // while /artworks — the page carrying 39 works that are actually for sale — said
        // nothing about originals being available. The artwork DETAIL pages already do
        // this correctly; only the top-level ones were missed.
        //
        // Titles state what the page genuinely is. No keyword stuffing, no repositioning:
        // "original oil paintings" is what /artworks lists, in the words her own H1 and
        // meta description already use.
        const PAGE_META: Record<string, { title: string; description?: string }> = {
          "/artworks": {
            // Shared with the React page so the served and rendered titles cannot drift.
            title: ARTWORKS_TITLE,
          },
          "/path": {
            title: "The Path \u2014 Three Chapters of a Painting Practice | Ani Muradyan",
            description:
              "The story behind the work, in the artist's own words: inner weight, open space and transformation, told in three chapters \u2014 by Armenian contemporary painter Ani Muradyan.",
          },
          // Exactly what AboutPage.tsx sets client-side, so the served and rendered titles
          // cannot drift. /about was the only prerendered page with no server-side title.
          "/about": {
            title: "About Ani Muradyan | Contemporary Armenian Artist",
            description:
              "Learn about Ani Muradyan, a contemporary Armenian oil painter. Biography, artist statement, education, and exhibition history.",
          },
          "/exhibitions": {
            title: "Exhibitions \u2014 Ani Muradyan",
            description: "Where the work has been shown. Exhibitions and showings by Armenian contemporary oil painter Ani Muradyan.",
          },
          "/gallery": {
            title: "Studio & Gallery Photographs \u2014 Ani Muradyan",
          },
          "/contact": {
            title: "Contact & Commissions \u2014 Ani Muradyan",
            description: "Enquire about an original painting, a commission, or an exhibition. Contact Armenian contemporary oil painter Ani Muradyan.",
          },
        };
        const pageMeta = PAGE_META[req.path.replace(/\/+$/, "") || "/"];
        if (pageMeta) {
          const escA = (t: string) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
          const put = (h: string, sel: string, val: string) => {
            const re = new RegExp(`(<meta\\s+${sel}\\s+content=")[^"]*(">)`, "i");
            return re.test(h) ? h.replace(re, `$1${escA(val)}$2`) : h;
          };
          html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escA(pageMeta.title)}</title>`);
          html = put(html, 'name="title"', pageMeta.title);
          html = put(html, 'property="og:title"', pageMeta.title);
          html = put(html, 'name="twitter:title"', pageMeta.title);
          if (pageMeta.description) {
            html = put(html, 'name="description"', pageMeta.description);
            html = put(html, 'property="og:description"', pageMeta.description);
          }
        }

        // HOME: her name resolves here, and a crawler was reading nothing.
        //
        // / is client-rendered, so a crawl returned the shell: 0 words and no <h1> on the one
        // page 147 of 147 Search Console impressions land on.
        //
        // INSIDE #root, NOT BEFORE IT. The first version of this block was concatenated ahead
        // of <div id="root">, on the reasoning that "React replaces it on mount". React does
        // no such thing — createRoot() only ever replaces the CONTAINER'S OWN CHILDREN, so a
        // sibling above the container is permanent. It rendered as a visible unstyled band
        // above the real header, with a second <h1>, for every human visitor.
        //
        // Two patterns in this file solve that, and this is the one with no moving parts:
        // /path and /artworks/:slug put their prerender INSIDE the container, where the first
        // client render wipes it. (/artworks and /blog use the other pattern — before #root
        // plus an explicit .remove() in the React page — because there the block doubles as a
        // loading fallback until data arrives. The home page has no such data wait, so it
        // does not need a client-side remover, and one it does not need is one that can fail.)
        //
        // Copy, markup and styling are byte-for-byte what shipped; only the placement moved.
        if (req.path === "/") {
          const homeSsr =
            `<section id="prerender-home" style="padding:3rem 1.5rem;max-width:820px;margin:0 auto;font-family:system-ui,sans-serif">` +
            `<h1 style="font-size:2.5rem;font-weight:700;color:#0f172a;margin-bottom:1rem">Ani Muradyan</h1>` +
            `<p style="font-size:1.1rem;line-height:1.7;color:#475569;margin-bottom:1.5rem">Ani Muradyan is an Armenian contemporary oil painter creating figurative works and landscapes \u2014 original oil paintings on canvas, available to collectors.</p>` +
            `<p><a href="/artworks" style="color:#1d4ed8;text-decoration:underline">See all original paintings</a> \u00b7 <a href="/about" style="color:#1d4ed8;text-decoration:underline">About Ani Muradyan</a></p>` +
            `</section>`;
          html = html.replace('<div id="root"></div>', `<div id="root">${homeSsr}</div>`);
        }

        // THE FOUR PAGES A CRAWLER COULD NOT READ AT ALL.
        //
        // /about, /exhibitions, /gallery and /contact are in the sitemap, answer 200 and say
        // `index, follow` — and their body was `<div id="root"></div>`. Zero words, no <h1>,
        // nothing. A 200 with an empty body is what Google classifies as a SOFT 404, and it
        // reported exactly that on 21 August 2026. /gallery is also the declared host page for
        // 16 of the 208 images in the image sitemap, and Google Images will not index an image
        // whose host page it cannot index — so the photographs went down with the page.
        //
        // INSIDE #root, like /path and /artworks/:slug: createRoot() replaces the container's
        // own children on first render, so this is a pre-hydration fallback that removes
        // itself. No client-side remover is needed and nothing is duplicated after React
        // mounts — the homepage learned that the expensive way, see the note above.
        //
        // The markup lives in ./staticPagePrerender as pure functions, because the local
        // sample store has no gallery photographs: the branch that emits <img> and its alt
        // text cannot be reached by running the server, so it is covered by tests instead.
        if (['/about', '/exhibitions', '/gallery', '/contact'].includes(req.path)) {
          try {
            let ssr = '';
            if (req.path === '/about') {
              const [bio, exhibitions] = await Promise.all([
                storage.getArtistBio(),
                storage.getAllExhibitions(),
              ]);
              ssr = renderAboutHtml(bio, exhibitions);
            } else if (req.path === '/exhibitions') {
              ssr = renderExhibitionsHtml(await storage.getAllExhibitions());
            } else if (req.path === '/gallery') {
              // Through the SAME helper /api/gallery-photos uses, so the src is the URL the
              // React page renders. This PR does not touch image URL or cache-busting.
              ssr = renderGalleryHtml(
                refifyImageFieldList('gallery', await storage.getAllGalleryPhotos(), 'image'),
              );
            } else {
              ssr = renderContactHtml();
            }
            html = html.replace('<div id="root"></div>', `<div id="root">${ssr}</div>`);
          } catch (e) {
            // A prerender is an enhancement. If the data read fails the page must still be
            // served — the shell it falls back to is exactly what shipped before this block.
            console.error(`[SSR] ${req.path} prerender failed:`, e);
          }
        }

        // PATH: her strongest first-party writing, and it was reaching nobody.
        //
        // /path is client-rendered, so a crawl of it returns the same 39-character shell
        // described above — roughly 1,500 words about the periods of her practice,
        // invisible to search engines and to anything else reading the site. The text is
        // rendered here from `shared/pathNarrative.ts`, the same source the React page is
        // checked against, so crawlers are served her words rather than a summary written
        // for them.
        if (req.path === '/path') {
          try {
            const esc = (t: string) => String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
            const chapters = PATH_NARRATIVE.chapters.map((c, i) =>
              `<section><h2>${esc(c.title)}</h2><p><em>${esc(c.arc)}</em></p>` +
              c.sections.map((sec) =>
                `<h3>${esc(sec.heading)}</h3>` + sec.paragraphs.map((t) => `<p>${esc(t)}</p>`).join('')
              ).join('') +
              `</section>`
            ).join('');
            const ssr =
              `<article id="path-ssr" style="padding:3rem 1.5rem;max-width:760px;margin:0 auto;font-family:system-ui,sans-serif">` +
              `<h1>Painting Path — Ani Muradyan</h1>` +
              PATH_NARRATIVE.intro.map((t) => `<p>${esc(t)}</p>`).join('') +
              chapters +
              PATH_NARRATIVE.closing.map((t) => `<p>${esc(t)}</p>`).join('') +
              `<p><a href="/artworks">See the paintings</a></p>` +
              `</article>`;
            html = html.replace('<div id="root"></div>', `<div id="root">${ssr}</div>`);
          } catch (e) {
            console.error('[SSR] /path prerender failed:', e);
          }
        }

        // COLLECTION LANDING PAGES — /collections/:slug.
        //
        // A buyer searches for what they want to hang, not for whose name it is, and Search
        // Console shows this property appears for exactly one thing: the artist's own name.
        // These pages are the missing commercial surfaces — an indexable URL per slice of the
        // catalogue a buyer with intent would look for ("contemporary landscape paintings"),
        // backed by the actual available works so it is a shop, not a doorway. Prerendered
        // INSIDE #root like /path and /artworks/:slug, with CollectionPage + ItemList structured
        // data so the collection is a fact a search engine and an AI assistant can read.
        if (req.path.startsWith('/collections/')) {
          const slug = req.path.slice('/collections/'.length).split('?')[0].split('#')[0];
          const def = collectionBySlug(slug);
          if (def) {
            try {
              const esc = (t: unknown) => String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
              const all = await storage.getAllArtworks().catch(() => []);
              const members = collectionMembers(def, all as never[]);
              const works: CollectionRenderWork[] = (members as any[]).map((a) => {
                const refImgs = refifyImages('artwork', a as { id: number; images: string[] }).images;
                const refImg = Array.isArray(refImgs) && refImgs[0] ? String(refImgs[0]) : '';
                const image = /^https?:\/\//i.test(refImg) ? refImg : refImg.startsWith('/') ? `${SEO_BASE_URL}${refImg}` : `${SEO_BASE_URL}/img/artwork/${a.id}/0`;
                const priceLabel = a.availability === 'available' && a.price
                  ? `${ARTWORK_PRICE_CURRENCY} ${Number(a.price).toLocaleString('en-US')}`
                  : null;
                const dims = artworkDimensions(a as never);
                return {
                  title: String(a.title ?? ''),
                  href: artworkCanonicalPath(a),
                  image,
                  medium: String(a.medium || 'Oil on Canvas'),
                  dimensions: String(a.dimensions ?? ''),
                  availability: String(a.availability ?? ''),
                  priceLabel,
                  width: dims?.width,
                  height: dims?.height,
                };
              });
              // Title + description, matching the constant the React page sets, so served and
              // rendered <title> cannot drift (the /artworks lesson).
              html = html.replace(/<title>[^<]*<\/title>/i, `<title>${esc(def.title)}</title>`);
              const putMeta = (h: string, sel: string, val: string) => {
                const re = new RegExp(`(<meta\\s+${sel}\\s+content=")[^"]*(">)`, 'i');
                return re.test(h) ? h.replace(re, `$1${esc(val)}$2`) : h;
              };
              html = putMeta(html, 'name="description"', def.metaDescription);
              html = putMeta(html, 'property="og:title"', def.title);
              html = putMeta(html, 'property="og:description"', def.metaDescription);
              html = html.replace('</head>', `  ${collectionJsonLd(def, works, SEO_BASE_URL)}\n</head>`);
              html = html.replace('<div id="root"></div>', `<div id="root">${renderCollectionHtml(def, works)}</div>`);
            } catch (e) {
              console.error(`[SSR] /collections/${slug} prerender failed:`, e);
            }
          } else {
            // A /collections/<slug> that names no real collection is not a page. Without this
            // it would inherit the SPA shell as a 200 (its shape is "known") — the unbounded
            // soft-404 the route-shape guard exists to prevent, arriving one level deeper.
            res.status(404).setHeader('Content-Type', 'text/html');
            return res.send(markNotFoundHtml(html));
          }
        }

        if (req.path === '/blog' || req.path.startsWith('/blog/')) {
          try {
            const esc = (t: string) => String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
            const slug = req.path === '/blog' ? null : decodeURIComponent(req.path.slice('/blog/'.length).split('?')[0].split('#')[0]);

            if (!slug) {
              const posts = await storage.getBlogPosts();
              const items = posts.map((post) => {
                const thumb = post.coverImage
                  ? `<img src="${esc(post.coverImage)}" alt="${esc(post.coverImageAlt ?? '')}" style="width:120px;height:90px;object-fit:cover;border-radius:8px;flex-shrink:0" />`
                  : '';
                return `<li style="margin-bottom:1.5rem;display:flex;gap:1rem;align-items:flex-start">${thumb}` +
                  `<div><a href="/blog/${esc(post.slug)}" style="color:#1d4ed8;text-decoration:underline;font-weight:600">${esc(post.title)}</a>` +
                  `<div style="color:#475569">${esc(post.excerpt)}</div></div></li>`;
              }).join('');
              const ssr =
                `<section id="blog-ssr" style="padding:3rem 1.5rem;max-width:820px;margin:0 auto;font-family:system-ui,sans-serif">` +
                `<h1 style="font-size:2.5rem;font-weight:700;color:#0f172a;margin-bottom:1rem">Writing by Ani Muradyan</h1>` +
                `<p style="font-size:1.1rem;color:#475569;margin-bottom:1.5rem">Notes on oil painting, process and the work \u2014 by Armenian contemporary artist Ani Muradyan.</p>` +
                (items ? `<ul style="list-style:none;padding:0">${items}</ul>` : `<p style="color:#475569">No articles published yet.</p>`) +
                `</section>`;
              html = html.replace(/<title>[^<]*<\/title>/i, `<title>Writing by Ani Muradyan \u2014 Notes on Oil Painting &amp; Process</title>`);
              html = html.replace('<div id="root">', ssr + '<div id="root">');
            } else {
              const post = await storage.getBlogPostBySlug(slug);

              // AN ARTICLE THAT DOES NOT EXIST SHOULD SAY SO — the /artworks fix, applied to
              // the surface it never reached. Answering 200 here made every invented slug a
              // self-canonical thin page, and left each future article's URL indexable for
              // the days it spends as a draft. The shell still renders, so a mistyped link
              // shows the site rather than a bare string.
              if (isMissingBlogPath(req.path, Boolean(post))) {
                res.status(404).setHeader('Content-Type', 'text/html');
                // Was still carrying `index, follow` and a canonical for a URL that does not
                // exist — the status line saying 404 while every tag inside argued with it.
                return res.send(markNotFoundHtml(html));
              }

              if (post) {
                const url = `${SEO_BASE_URL}/blog/${post.slug}`;
                const setMeta = (h: string, sel: string, val: string) => {
                  const re = new RegExp(`(<meta\\s+${sel}\\s+content=")[^"]*(">)`, 'i');
                  return re.test(h) ? h.replace(re, `$1${esc(val)}$2`) : h;
                };
                html = html.replace(/<title>[^<]*<\/title>/i, `<title>${esc(post.title)} \u2014 Ani Muradyan</title>`);
                html = setMeta(html, 'name="description"', post.excerpt);
                html = setMeta(html, 'property="og:title"', post.title);
                html = setMeta(html, 'property="og:description"', post.excerpt);
                html = setMeta(html, 'property="og:type"', 'article');
                html = setMeta(html, 'property="og:url"', url);
                html = setMeta(html, 'name="twitter:title"', post.title);
                html = setMeta(html, 'name="twitter:description"', post.excerpt);
                if (post.coverImage) {
                  // ABSOLUTE, always. Facebook, X, LinkedIn and iMessage all fetch og:image
                  // from their own servers with no page context, so a relative "/uploads/x"
                  // resolves against nothing and the card silently renders blank — the kind
                  // of failure nobody sees until an article is already being shared.
                  const absImage = /^https?:\/\//i.test(post.coverImage)
                    ? post.coverImage
                    : `${SEO_BASE_URL}${post.coverImage.startsWith('/') ? '' : '/'}${post.coverImage}`;
                  html = setMeta(html, 'property="og:image"', absImage);
                  html = setMeta(html, 'name="twitter:image"', absImage);
                  html = setMeta(html, 'property="og:image:alt"', post.coverImageAlt ?? post.title);
                }
                html = html.replace(/<link rel="canonical"[^>]*>/i, `<link rel="canonical" href="${esc(url)}">`);

                const jsonld = {
                  '@context': 'https://schema.org', '@type': 'Article',
                  headline: post.title, description: post.excerpt,
                  author: { '@type': 'Person', name: 'Ani Muradyan', url: SEO_BASE_URL },
                  publisher: { '@type': 'Person', name: 'Ani Muradyan' },
                  datePublished: (post.publishedAt ?? post.createdAt)?.toISOString?.() ?? undefined,
                  dateModified: post.updatedAt?.toISOString?.() ?? undefined,
                  mainEntityOfPage: url,
                  ...(post.coverImage ? {
                    image: /^https?:\/\//i.test(post.coverImage)
                      ? post.coverImage
                      : `${SEO_BASE_URL}${post.coverImage.startsWith('/') ? '' : '/'}${post.coverImage}`,
                  } : {}),
                };
                html = html.replace('</head>',
                  `  <script type="application/ld+json">${JSON.stringify(jsonld).replace(/<\/script>/gi, '<\\/script>')}</script>\n</head>`);
                const bodyArtworks = await storage.getAllArtworks().catch(() => []);
                // INSIDE #root, NOT BEFORE IT.
                //
                // This was concatenated ahead of <div id="root">, where nothing ever removed
                // it. React's createRoot() replaces the CONTAINER'S OWN CHILDREN, so a sibling
                // above the container is permanent: every reader of an article got the whole
                // piece twice — two identical <h1>s and roughly 5,000px of duplicated body —
                // and search engines got a page whose main content is stated twice.
                //
                // /blog (the listing) uses the other pattern on purpose: it stays outside
                // #root and BlogPage.tsx removes #blog-ssr once real posts have loaded, so it
                // doubles as a loading fallback. An article has no such wait — the server
                // already has the post — so it takes the /path and /artworks/:slug approach
                // instead, where the first client render clears it and no client-side remover
                // has to exist, let alone be remembered.
                //
                // The article HTML, its JSON-LD (injected into </head> above), the canonical
                // and every image are untouched. Only the insertion point moved.
                html = html.replace('<div id="root"></div>', `<div id="root">${renderArticleHtml(post, esc, bodyArtworks as never)}</div>`);
              }
            }
          } catch (e) {
            console.error('[SSR] /blog prerender failed:', e);
          }
        } else if (req.path === '/artworks') {
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
                // The URL the page itself calls canonical. This used the `slug` column —
                // the marketplace slug carrying Singulart's id — so all 53 links pointed at
                // duplicates the artwork pages disown, sending every internal signal to a
                // URL Google is told to ignore.
                const href = artworkCanonicalPath(a);
                const meta = [a.medium, a.year ? String(a.year) : null].filter(Boolean).join(', ');
                // State price and availability here too. The ItemList already declares 35
                // offers with prices; a crawler that reads the structured data and finds
                // nothing matching in the visible copy is being shown two different pages.
                const offer = artworkOffer(a, SEO_BASE_URL);
                const status = offer
                  ? `${ARTWORK_PRICE_CURRENCY} ${Number(a.price).toLocaleString('en-US')} – available`
                  : a.availability === 'sold' ? 'in a private collection' : 'not currently available';
                return `<li style="margin-bottom:0.5rem"><a href="${esc(href)}" style="color:#1d4ed8;text-decoration:underline">${esc(a.title)}</a>${meta ? ' – ' + esc(meta) : ''} – ${esc(status)}</li>`;
              }).join('');

            const ssrSection =
              `<section id="artworks-ssr" style="padding:3rem 1.5rem;max-width:1200px;margin:0 auto;font-family:system-ui,sans-serif">` +
              `<h1 style="font-size:2.5rem;font-weight:700;color:#0f172a;margin-bottom:1rem">Original Oil Paintings</h1>` +
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
          //
          // The tags alone were never enough. A crawl of an artwork page returned 65
          // characters, no <h1> and no <img>, because the painting itself only appeared
          // after JavaScript ran — and across every period on record not one of these 53
          // pages had earned a single impression. The body is now prerendered from the
          // same row the tags are built from, exactly as /path, /blog and /artworks do.
          try {
            const artwork = await resolveArtworkForPath(req.path);

            // A PAINTING THAT DOES NOT EXIST SHOULD SAY SO.
            //
            // Everything above has already had its chance: a canonical URL resolves, a legacy
            // marketplace slug and a case variant are 301'd by the middleware registered
            // earlier, and a bare id resolves. Reaching here with nothing means the path is a
            // claim about a specific painting that is not one.
            //
            // It used to answer 200 with the generic shell and a self-canonical — a soft 404.
            // The status line is the fix; the shell still renders, so a person who mistypes a
            // URL sees the site rather than a bare string.
            if (isMissingArtworkPath(req.path, Boolean(artwork))) {
              res.status(404).setHeader('Content-Type', 'text/html');
              return res.send(markNotFoundHtml(html));
            }

            // A PATH THE APPLICATION DOES NOT ROUTE IS NOT A PAGE.
            //
            // This is the last thing between an arbitrary string and a 200. Everything with a
            // claim has already made it: assets and /api never reach this handler, /img,
            // robots and the sitemaps are routed above it, /prints is redirected above it,
            // and a bare slug has just been resolved against the artwork table on the line
            // above — so `artwork` being set is the data saying yes.
            //
            // What is left is /completely-made-up-page, /about/sub/page, /gallery/x and every
            // other string a crawler cares to try. They used to answer 200, self-canonical,
            // `index, follow`, on an empty body: an unbounded family of soft 404s, each one
            // asserting it was a page.
            //
            // The shell still renders, so a person who mistypes a URL sees the site and its
            // navigation rather than a bare string — the same choice the artwork and blog
            // 404s already make. Only the status line, the canonical and the robots tag
            // change, which is precisely the part a crawler reads.
            if (!artwork && !isKnownRouteShape(req.path)) {
              res.status(404).setHeader('Content-Type', 'text/html');
              return res.send(markNotFoundHtml(html));
            }

            if (artwork) {
              // Refify FIRST, so the meta tags, the SSR <img>, the JSON-LD and the sitemap all
              // name the same /img/...?v=<hash> URL the rendered page and the preload use — one
              // address per image, matching what Google actually indexes.
              const artworkRef = refifyImages("artwork", artwork);
              html = injectArtworkMeta(html, artworkRef);
              // Breadcrumb trail (Home → Originals → this painting) for the rich result + structure.
              html = injectBreadcrumb(html, [
                { name: "Home", url: `${SEO_BASE_URL}/` },
                { name: "Original Paintings", url: `${SEO_BASE_URL}/artworks` },
                { name: artwork.title || "Untitled", url: artworkCanonicalUrl(SEO_BASE_URL, artwork) },
              ]);
              // Measured from the actual bytes, or absent. Never inferred from the physical
              // canvas size — that is centimetres of painting, not pixels of photograph.
              const imageSize = await measurePrimaryImage(artwork.images as (string | null)[] | null);
              html = html.replace(
                '<div id="root"></div>',
                `<div id="root">${renderArtworkHtml(artworkRef, SEO_BASE_URL, imageSize)}</div>`,
              );

              // THE PAINTING IS ALREADY IN THIS RESPONSE — SO DO NOT MAKE THE BROWSER ASK FOR IT.
              //
              // The prerender above puts the image, the title and the metadata in the HTML. Then
              // React mounted, threw all of it away, and rendered a full-screen "Loading…" until
              // /api/artworks/:id came back — which on the live site is a 0.5-3.4s wait, staring at
              // the word Loading, for a painting the server had already sent. Handing React the
              // same row it just rendered from removes the wait entirely: the artwork paints on
              // the first React render, with no request in front of it.
              //
              // Refified exactly like /api/artworks/:id, so this is byte-for-byte the payload the
              // query would have fetched — /img/artwork/:id/:idx references, never base64. React
              // Query still revalidates in the background, so an edit is never more than one
              // refresh behind.
              const preloaded = JSON.stringify(artworkRef).replace(/</g, '\\u003c');
              html = html.replace(
                '</head>',
                `  <script>window.__PRELOADED_ARTWORK__=${preloaded};</script>\n</head>`,
              );
            }
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
