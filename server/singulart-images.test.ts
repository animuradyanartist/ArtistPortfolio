import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArtworkImages, type ScrapedArtwork } from "./singulart-scraper";
import {
  decideImageAction,
  resolveImages,
  runSingulartSync,
  ZYTE_COST_PER_REQUEST,
  type ArtworkStore,
} from "./singulart-sync";

// A trimmed detail page: this artwork's main (two sizes) + two alts (mixed
// sizes), plus a "related artworks" carousel entry for a DIFFERENT artwork.
const DETAIL_HTML = `
<div class="artwork-gallery">
  <img class="artwork-gallery__image--alt"
       src="https://www.singulart.com/images/artworks/v2/cropped/62448/alts/zoom/alt_2520049_AAA.jpeg">
  <img class="artwork-gallery__image--alt"
       src="/images/artworks/v2/cropped/62448/alts/base/alt_2520049_BBB.jpeg">
  <img class="img-responsive"
       src="https://www.singulart.com/images/artworks/v2/cropped/62448/main/base/2520049_MAIN.png">
  <img class="framing-mobile-preview__picture"
       src="https://www.singulart.com/images/artworks/v2/cropped/62448/main/fhd/2520049_MAIN.png">
</div>
<div class="related-artworks">
  <img src="https://www.singulart.com/images/artworks/v2/cropped/62448/main/base/2520872_OTHER.jpeg">
</div>`;

test("parseArtworkImages: MAIN first, then ALTs, deduped, scoped to the artwork", () => {
  const imgs = parseArtworkImages(DETAIL_HTML, "2520049");
  assert.equal(imgs.length, 3, "1 main + 2 alts (size variants deduped)");
  assert.match(imgs[0], /\/main\/zoom\/2520049_MAIN\.png$/, "main is first and normalized to zoom");
  assert.match(imgs[1], /\/alts\/zoom\/alt_2520049_AAA\.jpeg$/);
  assert.match(imgs[2], /\/alts\/zoom\/alt_2520049_BBB\.jpeg$/, "relative + base alt normalized to absolute zoom");
  assert.ok(imgs.every((u) => u.startsWith("https://")), "all absolute URLs");
  assert.ok(imgs.every((u) => !u.includes("2520872")), "excludes other artworks' images");
});

test("parseArtworkImages: single-image artwork returns just the main", () => {
  const html = `<img src="https://www.singulart.com/images/artworks/v2/cropped/62448/main/base/999_X.png">`;
  const imgs = parseArtworkImages(html, "999");
  assert.deepEqual(imgs, ["https://www.singulart.com/images/artworks/v2/cropped/62448/main/zoom/999_X.png"]);
});

test("decideImageAction: driven by the marker, not the image count", () => {
  assert.equal(decideImageAction(true, false), "insert"); // new
  assert.equal(decideImageAction(true, true), "insert"); // new (marker irrelevant)
  assert.equal(decideImageAction(false, true), "preserve"); // checked -> skip
  assert.equal(decideImageAction(false, false), "enrich"); // not checked -> fetch once
});

test("resolveImages: insert stores detail set, falls back to the cover", () => {
  assert.deepEqual(resolveImages("insert", [], "cover.jpg", ["m", "a1"]), ["m", "a1"]);
  assert.deepEqual(resolveImages("insert", [], "cover.jpg", null), ["cover.jpg"]);
  assert.deepEqual(resolveImages("insert", [], "cover.jpg", []), ["cover.jpg"]);
});

test("resolveImages: preserve never touches existing images", () => {
  assert.equal(resolveImages("preserve", ["m", "a1", "a2"], "cover.jpg", null), null);
});

test("resolveImages: enrich only upgrades when detail adds images (no multi→single)", () => {
  // ≤1 image + detail has more → upgrade
  assert.deepEqual(resolveImages("enrich", ["old"], "cover.jpg", ["m", "a1", "a2"]), ["m", "a1", "a2"]);
  // detail only has the one image → no change (don't churn)
  assert.equal(resolveImages("enrich", ["old"], "cover.jpg", ["m"]), null);
  // detail fetch failed → keep what we have
  assert.equal(resolveImages("enrich", ["old"], "cover.jpg", null), null);
  // guardrail: a shorter detail set never replaces a longer stored one
  assert.equal(resolveImages("enrich", ["a", "b", "c"], "cover.jpg", ["m"]), null);
});

// ---- incremental end-to-end (in-memory store, injected scraper + detail fetch) ----
function art(id: string): ScrapedArtwork {
  return {
    id, slug: `slug-${id}`, title: `T_${id}`, priceUsd: 100,
    widthCm: 80, heightCm: 60, medium: "Oil on Canvas",
    imageUrl: `cover-${id}.jpg`, singulartUrl: `https://www.singulart.com/en/artworks/${id}`,
  };
}
function fakeStore(
  seed: Array<{ singulartId: string; images: string[]; title?: string; detailImagesChecked?: boolean }>,
) {
  const map = new Map<string, any>(seed.map((r) => [r.singulartId, { ...r }]));
  const store: ArtworkStore = {
    async findBySingulartId(id) { return map.get(id); },
    async insertArtwork(row: any) { map.set(row.singulartId, { ...row }); },
    async updateBySingulartId(id, set: any) { const r = map.get(id); if (r) Object.assign(r, set); },
  };
  return { store, get: (id: string) => map.get(id) };
}

test("incremental end-to-end: new fetches, multi-image preserved, single-image enriched, no downgrade", async () => {
  const s = fakeStore([
    { singulartId: "EXIST_MULTI", images: ["m", "a1", "a2"], title: "stale", detailImagesChecked: true }, // checked -> preserve
    { singulartId: "EXIST_SINGLE", images: ["old"], title: "stale" },        // unchecked -> enrich
    { singulartId: "EXIST_SINGLE_NOALT", images: ["only"], title: "stale" }, // unchecked -> fetched, no gain, marked
  ]);
  const scraper = async () => [art("NEW1"), art("EXIST_MULTI"), art("EXIST_SINGLE"), art("EXIST_SINGLE_NOALT")];
  const detail: Record<string, string[]> = {
    NEW1: ["new-main", "new-a1"],
    EXIST_SINGLE: ["es-main", "es-a1", "es-a2"],
    EXIST_SINGLE_NOALT: ["only-main"], // 1 image → no gain
  };
  const fetched: string[] = [];
  const fetchDetail = async (a: ScrapedArtwork) => { fetched.push(a.id); return detail[a.id] ?? []; };

  const r = await runSingulartSync(scraper, fetchDetail, s.store);

  assert.equal(r.error, null);
  assert.equal(r.scrapedCount, 4);
  assert.equal(r.inserted, 1, "1 new");
  assert.equal(r.updated, 3, "3 existing metadata-updated");
  assert.deepEqual(fetched.sort(), ["EXIST_SINGLE", "EXIST_SINGLE_NOALT", "NEW1"], "multi-image NOT fetched");
  assert.equal(r.detailPagesFetched, 3);
  assert.equal(r.existingSkipped, 1, "EXIST_MULTI skipped");
  assert.equal(r.enriched, 1, "only EXIST_SINGLE gained images");
  assert.equal(r.estimatedZyteCostUsd, Number(((2 + 3) * ZYTE_COST_PER_REQUEST).toFixed(3)));

  assert.deepEqual(s.get("NEW1").images, ["new-main", "new-a1"], "new stored MAIN-first set");
  assert.deepEqual(s.get("EXIST_MULTI").images, ["m", "a1", "a2"], "multi-image preserved");
  assert.deepEqual(s.get("EXIST_SINGLE").images, ["es-main", "es-a1", "es-a2"], "single enriched");
  assert.deepEqual(s.get("EXIST_SINGLE_NOALT").images, ["only"], "never downgraded to a single image");
  assert.equal(s.get("EXIST_MULTI").title, "T_EXIST_MULTI", "metadata refreshed even when images preserved");
  assert.equal(s.get("NEW1").detailImagesChecked, true, "new artwork marked after detail fetch");
  assert.equal(s.get("EXIST_SINGLE").detailImagesChecked, true, "marked after enrichment");
  assert.equal(s.get("EXIST_SINGLE_NOALT").detailImagesChecked, true, "marked even though single image");
});

// ---- the four required marker tests ----
test("marker #1: genuinely single-image artwork is fetched once only", async () => {
  const s = fakeStore([{ singulartId: "SINGLE", images: ["cover"] }]);
  const scraper = async () => [art("SINGLE")];
  let calls = 0;
  const fetchDetail = async () => { calls++; return ["only-main"]; }; // 1 image, always

  await runSingulartSync(scraper, fetchDetail, s.store); // sync 1: fetch + mark
  await runSingulartSync(scraper, fetchDetail, s.store); // sync 2: should skip

  assert.equal(calls, 1, "detail page fetched exactly once across two syncs");
  assert.equal(s.get("SINGLE").detailImagesChecked, true);
});

test("marker #2: failed detail fetch does NOT set the marker (retried next sync)", async () => {
  const s = fakeStore([{ singulartId: "FAILY", images: ["cover"] }]);
  const scraper = async () => [art("FAILY")];
  const fetchDetail = async () => { throw new Error("Zyte 500"); };

  const r = await runSingulartSync(scraper, fetchDetail, s.store);

  assert.equal(r.error, null, "a per-artwork fetch failure does not abort the sync");
  assert.notEqual(s.get("FAILY").detailImagesChecked, true, "marker left unset after a failed fetch");
  assert.deepEqual(s.get("FAILY").images, ["cover"], "existing image preserved on failure");
});

test("marker #3: successful multi-image enrichment sets the marker", async () => {
  const s = fakeStore([{ singulartId: "ENR", images: ["old"] }]);
  const scraper = async () => [art("ENR")];
  const fetchDetail = async () => ["main", "a1", "a2"];

  const r = await runSingulartSync(scraper, fetchDetail, s.store);

  assert.equal(r.enriched, 1);
  assert.deepEqual(s.get("ENR").images, ["main", "a1", "a2"], "upgraded to full ordered set");
  assert.equal(s.get("ENR").detailImagesChecked, true, "marker set after enrichment");
});

test("marker #4: existing already-checked artwork is skipped (no detail fetch)", async () => {
  const s = fakeStore([{ singulartId: "DONE", images: ["m", "a1"], detailImagesChecked: true }]);
  const scraper = async () => [art("DONE")];
  let calls = 0;
  const fetchDetail = async () => { calls++; return ["x"]; };

  const r = await runSingulartSync(scraper, fetchDetail, s.store);

  assert.equal(calls, 0, "checked artwork never fetches its detail page");
  assert.equal(r.detailPagesFetched, 0);
  assert.equal(r.existingSkipped, 1);
  assert.deepEqual(s.get("DONE").images, ["m", "a1"], "images preserved");
  assert.equal(s.get("DONE").title, "T_DONE", "metadata still refreshed");
});
