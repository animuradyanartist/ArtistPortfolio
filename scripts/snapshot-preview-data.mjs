// Snapshot the LIVE site's public content into local preview data.
//
// Fetches artworks, gallery photos, exhibitions, homepage settings, artist
// bio, contact settings and prints from the production site's public API,
// converts any inline base64 images to WebP files under
// public/uploads/preview/, and writes server/preview-data.json.
//
// MemStorage (used automatically when DATABASE_URL is not set) loads this
// snapshot at boot, so the local preview shows the real portfolio content
// instead of built-in stock samples. Read-only with respect to production —
// it only ever GETs public endpoints.
//
// Usage:  node scripts/snapshot-preview-data.mjs [base-url]
//         (default base-url: https://animuradyan.com)

import fs from "fs";
import path from "path";
import sharp from "sharp";

const BASE = process.argv[2] || "https://animuradyan.com";
const OUT_DIR = path.join(process.cwd(), "public/uploads/preview");
const OUT_JSON = path.join(process.cwd(), "server/preview-data.json");

async function getJson(p) {
  const res = await fetch(`${BASE}${p}`);
  if (!res.ok) throw new Error(`GET ${p} → ${res.status}`);
  return res.json();
}

async function materializeImage(img, name) {
  if (typeof img !== "string" || !img.startsWith("data:")) return img;
  const comma = img.indexOf(",");
  const buf = Buffer.from(img.slice(comma + 1), "base64");
  const file = `${name}.webp`;
  await sharp(buf)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(path.join(OUT_DIR, file));
  return `/uploads/preview/${file}`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Snapshotting ${BASE} ...`);
  const [artworks, galleryPhotos, exhibitions, homepageSettings, artistBio, contactSettings, printsLight] =
    await Promise.all([
      getJson("/api/artworks"),
      getJson("/api/gallery-photos"),
      getJson("/api/exhibitions"),
      getJson("/api/homepage-settings"),
      getJson("/api/artist-bio"),
      getJson("/api/contact-settings"),
      getJson("/api/prints"),
    ]);

  for (const a of artworks) {
    a.images = await Promise.all((a.images || []).map((img, i) => materializeImage(img, `artwork-${a.id}-${i}`)));
  }
  console.log(`artworks: ${artworks.length}`);

  for (const g of galleryPhotos) {
    g.image = await materializeImage(g.image, `gallery-${g.id}`);
  }
  console.log(`gallery photos: ${galleryPhotos.length}`);

  for (const e of exhibitions) {
    if (e.image) e.image = await materializeImage(e.image, `exhibition-${e.id}`);
  }
  console.log(`exhibitions: ${exhibitions.length}`);

  if (homepageSettings?.heroImage) {
    homepageSettings.heroImage = await materializeImage(homepageSettings.heroImage, "hero");
  }
  if (artistBio?.image) {
    artistBio.image = await materializeImage(artistBio.image, "bio");
  }

  // Prints list is lightweight (no images) — fetch each print in full
  const prints = [];
  for (const p of printsLight || []) {
    try {
      const full = await getJson(`/api/prints/${p.id}`);
      full.images = await Promise.all((full.images || []).map((img, i) => materializeImage(img, `print-${full.id}-${i}`)));
      prints.push(full);
    } catch (e) {
      console.warn(`print ${p.id} skipped: ${e.message}`);
    }
  }
  console.log(`prints: ${prints.length}`);

  const snapshot = {
    snapshotFrom: BASE,
    artworks,
    galleryPhotos,
    exhibitions,
    homepageSettings,
    artistBio,
    contactSettings,
    prints,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(snapshot, null, 1));
  const size = (fs.statSync(OUT_JSON).size / 1024).toFixed(0);
  console.log(`\nWrote ${OUT_JSON} (${size} KB) + images in public/uploads/preview/`);
  console.log("Restart the local dev server to see the real content in preview mode.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
