import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSingulartPage } from "./singulart-scraper";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, "__fixtures__");

async function loadFixture(name: string): Promise<string> {
  return readFile(path.join(FIXTURE_DIR, name), "utf8");
}

test("parseSingulartPage extracts at least 20 artworks across both fixture pages", async () => {
  const page1 = await loadFixture("singulart-page-1.html");
  const page2 = await loadFixture("singulart-page-2.html");

  const a1 = parseSingulartPage(page1);
  const a2 = parseSingulartPage(page2);

  // Dedup by id (in case any card appears on both pages).
  const merged = new Map<string, ReturnType<typeof parseSingulartPage>[number]>();
  for (const a of [...a1, ...a2]) merged.set(a.id, a);

  assert.ok(
    merged.size >= 20,
    `expected >=20 artworks parsed across both pages, got ${merged.size}`
  );
});

test("each scraped artwork has the required fields populated", async () => {
  const page1 = await loadFixture("singulart-page-1.html");
  const artworks = parseSingulartPage(page1);

  assert.ok(artworks.length > 0, "page 1 should yield at least 1 artwork");

  for (const a of artworks) {
    assert.ok(a.id && typeof a.id === "string", `id required: ${JSON.stringify(a)}`);
    assert.ok(a.slug && typeof a.slug === "string", `slug required: ${a.id}`);
    assert.ok(a.title && typeof a.title === "string", `title required: ${a.id}`);
    assert.ok(a.imageUrl && a.imageUrl.length > 0, `imageUrl required: ${a.id}`);
    assert.ok(
      a.singulartUrl.startsWith("https://www.singulart.com/"),
      `singulartUrl should be absolute: ${a.id} -> ${a.singulartUrl}`
    );
  }
});

test("price, medium, and dimensions are parsed when present on the card", async () => {
  const page1 = await loadFixture("singulart-page-1.html");
  const artworks = parseSingulartPage(page1);

  const withPrice = artworks.filter((a) => a.priceUsd !== null);
  const withMedium = artworks.filter((a) => a.medium !== null);
  const withDims = artworks.filter((a) => a.widthCm !== null && a.heightCm !== null);

  // Singulart consistently exposes these on listing cards; if the bulk of cards
  // are missing them, the selectors are stale.
  assert.ok(
    withPrice.length >= Math.floor(artworks.length * 0.8),
    `expected most cards to have a price, only ${withPrice.length}/${artworks.length} did`
  );
  assert.ok(
    withMedium.length >= Math.floor(artworks.length * 0.8),
    `expected most cards to have a medium, only ${withMedium.length}/${artworks.length} did`
  );
  assert.ok(
    withDims.length >= Math.floor(artworks.length * 0.8),
    `expected most cards to have dimensions, only ${withDims.length}/${artworks.length} did`
  );
});
