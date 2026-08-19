/**
 * FULL FIRST-PARTY IMAGE ROLLOUT — dry-runnable, and deliberately not executable yet.
 *
 *   node scripts/rollout-first-party-images.mjs --dry        # report only (default)
 *   node scripts/rollout-first-party-images.mjs --execute    # refuses without --i-have-pilot-evidence
 *
 * WHY THE STORAGE CHANGES FOR THE REST OF THE LIBRARY. The pilot stored nine images as base64
 * in Postgres, which was right for 2.7 MB and is wrong for the remaining ~161 MB: base64
 * inflates by a third, so the whole library would add roughly 215 MB to a row store that is
 * queried on every page render. The delivery route already resizes and disk-caches, so the
 * database was only ever acting as a filesystem with worse ergonomics.
 *
 * SO THE REST GOES WHERE NEW UPLOADS ALREADY GO. /api/upload writes files under public/uploads
 * and the app serves them directly; that path is first-party, needs no schema change, and is
 * the one Admin uploads take today. Using it means the migration converges the two families
 * rather than adding a third.
 *
 * WHAT DOES NOT CHANGE: the image REFERENCE stays a first-party URL, ordering is preserved by
 * writing into the same slot index, and originals are copied byte-for-byte — the route's WebP
 * resize stays a delivery concern, so the archived file is lossless.
 *
 * IT WILL NOT RUN WITHOUT EVIDENCE. The pilot exists to answer whether first-party hosting
 * moves image search at all. Migrating the remaining artworks before its 30/60/90 readings
 * would spend the only clean comparison the experiment has.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { checkProductionLiveness, describeLiveness } from "./lib/productionLiveness.mjs";

const SITE = process.env.PILOT_SITE_URL || "https://animuradyan.com";
const PILOT_IDS = new Set([78, 69, 63, 40, 79]);
const EXECUTE = process.argv.includes("--execute");
const EVIDENCE = process.argv.includes("--i-have-pilot-evidence");
const OUT_DIR = "public/uploads/artworks";

const extFor = (buf) =>
  buf[0] === 0x89 && buf[1] === 0x50 ? "png" : buf[0] === 0xff && buf[1] === 0xd8 ? "jpg" : null;

async function main() {
  if (EXECUTE && !EVIDENCE) {
    console.error(
      "Refusing to execute.\n\n" +
      "The pilot's 30/60/90 readings are the only clean comparison this experiment has, and\n" +
      "migrating the rest before they land spends it. Re-run with --i-have-pilot-evidence once\n" +
      "the readings exist and the decision is deliberate.",
    );
    process.exit(3);
  }

  const artworks = await (await fetch(`${SITE}/api/artworks`)).json();
  const targets = [];
  for (const a of artworks) {
    if (PILOT_IDS.has(a.id)) continue;
    for (const [idx, src] of (a.images ?? []).entries()) {
      if (typeof src === "string" && /^https?:/i.test(src)) targets.push({ id: a.id, title: a.title, idx, src });
    }
  }

  console.log(`site            : ${SITE}`);
  console.log(`artworks        : ${artworks.length}`);
  console.log(`already pilot   : ${PILOT_IDS.size} (untouched by this tool)`);
  console.log(`artworks to move: ${new Set(targets.map((t) => t.id)).size}`);
  console.log(`images to move  : ${targets.length}`);

  let bytes = 0, unreachable = 0;
  const hashes = new Map();
  for (const t of targets) {
    try {
      const res = await fetch(t.src, { method: "HEAD" });
      const len = Number(res.headers.get("content-length") || 0);
      if (!res.ok || !len) { unreachable++; continue; }
      bytes += len;
      hashes.set(t.src, len);
    } catch { unreachable++; }
  }
  console.log(`reachable       : ${targets.length - unreachable}/${targets.length}`);
  console.log(`raw size        : ${(bytes / 1048576).toFixed(1)} MB`);
  console.log(`as base64 in PG : ${(bytes * 1.34 / 1048576).toFixed(1)} MB  <- why the pilot's storage does not scale`);
  console.log(`as files        : ${(bytes / 1048576).toFixed(1)} MB under ${OUT_DIR}/`);
  console.log(`duplicate srcs  : ${targets.length - new Set(targets.map((t) => t.src)).size}`);
  console.log(`\nproposed refs   : /uploads/artworks/<artworkId>-<idx>.<ext>`);
  console.log(`rollback        : original URL recorded per slot before any write, as the pilot did`);

  const live = await checkProductionLiveness(async () => artworks.map((a) => a.id), SITE);
  console.log(describeLiveness(live, SITE));

  if (!EXECUTE) {
    console.log(`\nDRY RUN — nothing written. ${targets.length} images would move.`);
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`\nExecution path is deliberately not implemented until the pilot reports.`);
  process.exit(3);
}

main().catch((e) => { console.error(e); process.exit(1); });
