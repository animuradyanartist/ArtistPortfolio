/**
 * GOOGLE IMAGES PILOT — bring 9 artwork images first-party.
 *
 *   node scripts/migrate-pilot-images.mjs --dry     # report, write nothing
 *   node scripts/migrate-pilot-images.mjs           # migrate
 *   node scripts/migrate-pilot-images.mjs --rollback
 *
 * RUN IN THE REPLIT SHELL, because that is the only place DATABASE_URL exists. This is
 * deliberate: no agent credential reaches artwork rows, and adding one to run this would
 * widen the write surface permanently to perform a one-off.
 *
 * WHAT IT CHANGES: exactly nine entries of `artworks.images`, replacing a Singulart URL with
 * a data: URL holding THE SAME BYTES. Nothing else on the row is read into the update, so
 * title, description, price, availability, medium, year, dimensions and ordering cannot move.
 *
 * ROLLBACK FIRST, ALWAYS. The original URL is written to scripts/pilot-rollback.json and
 * fsync'd BEFORE any row is touched. If that file cannot be written, nothing is migrated:
 * a migration you cannot reverse is not a pilot, it is a commitment.
 *
 * BYTES ARE NOT RECOMPRESSED. The original file is stored verbatim, base64-encoded. The
 * /img route already resizes to WebP for delivery, so quality decisions stay where they were
 * and the archived original stays lossless.
 */
import { readFileSync, writeFileSync, openSync, fsyncSync, closeSync, existsSync } from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
import { COHORT, EXPECTED_ARTWORKS, EXPECTED_IMAGES, resolveCohort } from "./pilotCohort.mjs";

const ROLLBACK = new URL("./pilot-rollback.json", import.meta.url).pathname;
const DRY = process.argv.includes("--dry");
const ROLLING_BACK = process.argv.includes("--rollback");
const DIAGNOSE = process.argv.includes("--diagnose");
const SITE = process.env.PILOT_SITE_URL || "https://animuradyan.com";

/**
 * REFUSE TO WRITE INTO A DATABASE THAT IS NOT THE ONE SERVING THE SITE.
 *
 * The first dry run resolved eight of nine images and reported `SKIP artwork 79: not found`,
 * while production's own server was simultaneously emitting /artworks/no-measure-for-distance-79
 * and /img/artwork/79/0 — both built from that row. A database that is missing a row the live
 * site is serving is not the live database.
 *
 * That mismatch is the whole reason this check exists, and it matters far more than the one
 * missing image. Without it the run would have "succeeded": eight images migrated into some
 * other database, production unchanged, and 30/60/90 measurements scheduled against an
 * intervention that never happened. A loud refusal is the only safe outcome.
 *
 * The comparison is against the live API rather than a hardcoded count, so it stays true as
 * the library grows.
 */
async function assertLiveDatabase(client) {
  const live = await (await fetch(`${SITE}/api/artworks`)).json().catch(() => []);
  const liveIds = new Set(live.map((a) => a.id));
  const { rows } = await client.query("select id from artworks");
  const dbIds = new Set(rows.map((r) => Number(r.id)));

  const missing = [...liveIds].filter((id) => !dbIds.has(id)).sort((a, b) => a - b);
  const extra = [...dbIds].filter((id) => !liveIds.has(id)).sort((a, b) => a - b);
  // An empty live set proves nothing either way and must never read as agreement — the site
  // being down is not evidence that this is the right database.
  if (liveIds.size === 0) {
    return { site: SITE, liveCount: 0, dbCount: dbIds.size, liveMaxId: null, dbMaxId: null,
      missingFromDb: [], extraInDb: [], matches: false };
  }

  const report = {
    site: SITE,
    liveCount: liveIds.size,
    dbCount: dbIds.size,
    liveMaxId: Math.max(...liveIds),
    dbMaxId: dbIds.size ? Math.max(...dbIds) : null,
    missingFromDb: missing,
    extraInDb: extra,
    matches: missing.length === 0 && extra.length === 0,
  };
  return report;
}

function printDiagnosis(r) {
  console.log(`\nsite            : ${r.site}`);
  console.log(`live artworks   : ${r.liveCount}  (max id ${r.liveMaxId})`);
  console.log(`connected db    : ${r.dbCount}  (max id ${r.dbMaxId})`);
  console.log(`missing from db : ${r.missingFromDb.length ? r.missingFromDb.join(", ") : "none"}`);
  console.log(`extra in db     : ${r.extraInDb.length ? r.extraInDb.join(", ") : "none"}`);
  console.log(`verdict         : ${r.matches ? "this IS the database serving the site" : "MISMATCH — this is not the live database"}`);
  if (!r.matches) {
    console.log(`
The connected database disagrees with what the site is serving, so migrating here would
change nothing a visitor or Googlebot can see. Check which DATABASE_URL this shell has
against the one the deployment runs with — in Replit these can differ — and re-run against
the database that actually backs the published site.`);
  }
}

const mime = (buf) =>
  buf[0] === 0x89 && buf[1] === 0x50 ? "image/png"
  : buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg"
  : null;

function persistRollback(records) {
  // fsync, not just write: a rollback file still in the page cache when the process dies is
  // a rollback file that does not exist.
  const fd = openSync(ROLLBACK, "w");
  writeFileSync(fd, JSON.stringify({ createdAt: new Date().toISOString(), records }, null, 2));
  fsyncSync(fd);
  closeSync(fd);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Run this in the Replit Shell.");
    process.exit(2);
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Preflight before anything, including a dry run: a dry run against the wrong database
  // reports a plan that would not do what it says.
  const liveness = await assertLiveDatabase(client);
  printDiagnosis(liveness);
  if (DIAGNOSE) { await client.end(); return; }
  if (!liveness.matches) {
    console.error("\nAborting: refusing to touch a database that is not serving the site.");
    await client.end();
    process.exit(3);
  }

  if (ROLLING_BACK) {
    if (!existsSync(ROLLBACK)) { console.error("No rollback file — nothing to restore."); process.exit(2); }
    const { records } = JSON.parse(readFileSync(ROLLBACK, "utf8"));
    for (const r of records) {
      const { rows } = await client.query("select images from artworks where id = $1", [r.artworkId]);
      const images = rows[0]?.images ?? [];
      images[r.imageIndex] = r.originalUrl;
      await client.query("update artworks set images = $1 where id = $2", [images, r.artworkId]);
      console.log(`restored ${r.artworkId}/${r.imageIndex} -> ${r.originalHost}`);
    }
    await client.end();
    return;
  }

  const records = [];
  const writes = [];

  for (const { id, idx } of COHORT) {
    const { rows } = await client.query("select id, title, images from artworks where id = $1", [id]);
    const row = rows[0];
    if (!row) { console.error(`SKIP artwork ${id}: not found`); continue; }
    const images = [...(row.images ?? [])];

    for (const i of idx) {
      const src = images[i];
      if (typeof src !== "string" || !/^https?:/i.test(src)) {
        console.error(`SKIP ${id}/${i}: not an external URL (already migrated?) — ${String(src).slice(0, 40)}`);
        continue;
      }
      const res = await fetch(src);
      if (!res.ok) { console.error(`SKIP ${id}/${i}: source returned ${res.status}`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      const type = mime(buf);
      if (!buf.length || !type) { console.error(`SKIP ${id}/${i}: unrecognised image bytes`); continue; }

      records.push({
        artworkId: id, title: row.title, imageIndex: i,
        originalUrl: src, originalHost: new URL(src).host,
        bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex"),
      });
      writes.push({ id, i, dataUrl: `data:${type};base64,${buf.toString("base64")}`, bytes: buf.length });
      console.log(`ready ${id}/${i}  ${(buf.length / 1024).toFixed(0)}KB ${type}`);
    }
  }

  console.log(`\n${writes.length} image(s) ready, ${(writes.reduce((n, w) => n + w.bytes, 0) / 1048576).toFixed(2)} MB`);

  // THE COHORT IS FROZEN, SO A SHORT RUN IS A FAILURE, not a smaller pilot. The first dry
  // run resolved eight of nine and reported it as a total — a number that looks like success
  // if you are not counting. Migrating a partial cohort would also break the comparison the
  // experiment is built on.
  const artworksReady = new Set(writes.map((w) => w.id)).size;
  if (writes.length !== EXPECTED_IMAGES || artworksReady !== EXPECTED_ARTWORKS) {
    console.error(
      `\nAborting: the frozen cohort is ${EXPECTED_ARTWORKS} artworks / ${EXPECTED_IMAGES} images, ` +
      `but only ${artworksReady} artworks / ${writes.length} images resolved. ` +
      `Fix the cause above rather than migrating a partial cohort.`,
    );
    await client.end();
    process.exit(4);
  }
  if (DRY) { console.log("DRY RUN — nothing written."); await client.end(); return; }
  if (!writes.length) { console.log("Nothing to do."); await client.end(); return; }

  persistRollback(records);
  console.log(`rollback persisted: ${ROLLBACK}`);

  // One row at a time, re-reading immediately before the update so a concurrent admin edit
  // cannot be clobbered by a stale array captured earlier in the run.
  for (const w of writes) {
    const { rows } = await client.query("select images from artworks where id = $1", [w.id]);
    const images = [...(rows[0]?.images ?? [])];
    images[w.i] = w.dataUrl;
    await client.query("update artworks set images = $1 where id = $2", [images, w.id]);
    console.log(`migrated ${w.id}/${w.i}`);
  }

  await client.end();
  console.log("\nDone. Verify, then keep pilot-rollback.json until the experiment closes.");
}

main().catch((e) => { console.error(e); process.exit(1); });
