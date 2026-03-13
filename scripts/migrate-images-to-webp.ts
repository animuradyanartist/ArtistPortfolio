import sharp from "sharp";
import fs from "fs";
import path from "path";
import { db } from "../server/db";
import { artworks, prints } from "../shared/schema";
import { eq, sql } from "drizzle-orm";

const UPLOADS_DIR = path.join(process.cwd(), "public/uploads");

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function convertToWebp(
  filePath: string,
  outputPath: string,
): Promise<boolean> {
  try {
    await sharp(filePath).webp({ quality: 82 }).toFile(outputPath);
    return true;
  } catch (err) {
    console.error(`Failed to convert ${filePath}:`, err);
    return false;
  }
}

async function migrateImages() {
  console.log("Starting image migration to WebP...");

  if (!fs.existsSync(UPLOADS_DIR)) {
    console.log("No uploads directory found. Nothing to migrate.");
    return;
  }

  const files = fs.readdirSync(UPLOADS_DIR);
  const convertibleExtensions = [".jpg", ".jpeg", ".png", ".tiff", ".bmp"];
  const convertedMap = new Map<string, string>();

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!convertibleExtensions.includes(ext)) continue;

    const baseName = file.replace(/\.[^.]+$/, "");
    const webpFilename = `${baseName}.webp`;
    const originalPath = path.join(UPLOADS_DIR, file);
    const webpPath = path.join(UPLOADS_DIR, webpFilename);

    if (fs.existsSync(webpPath)) {
      console.log(`Skipping ${file} - WebP version already exists`);
      convertedMap.set(`/uploads/${file}`, `/uploads/${webpFilename}`);
      continue;
    }

    console.log(`Converting ${file} -> ${webpFilename}...`);
    const success = await convertToWebp(originalPath, webpPath);
    if (success) {
      convertedMap.set(`/uploads/${file}`, `/uploads/${webpFilename}`);
      console.log(`  Converted successfully. Removing original.`);
      fs.unlinkSync(originalPath);
    }
  }

  if (convertedMap.size === 0) {
    console.log("No files to convert.");
    return;
  }

  console.log(`\nConverted ${convertedMap.size} files. Updating database...`);

  const allArtworks = await db.select().from(artworks);
  for (const artwork of allArtworks) {
    let updated = false;
    const newImages = artwork.images.map((img) => {
      if (convertedMap.has(img)) {
        updated = true;
        return convertedMap.get(img)!;
      }
      return img;
    });
    if (updated) {
      await db
        .update(artworks)
        .set({ images: newImages })
        .where(eq(artworks.id, artwork.id));
      console.log(`  Updated artwork #${artwork.id}: ${artwork.title}`);
    }
  }

  const allPrints = await db.select().from(prints);
  for (const print of allPrints) {
    let updated = false;
    const newImages = print.images.map((img) => {
      if (convertedMap.has(img)) {
        updated = true;
        return convertedMap.get(img)!;
      }
      return img;
    });
    if (updated) {
      await db
        .update(prints)
        .set({ images: newImages })
        .where(eq(prints.id, print.id));
      console.log(`  Updated print #${print.id}: ${print.title}`);
    }
  }

  console.log("\nMigration complete!");
}

migrateImages()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
