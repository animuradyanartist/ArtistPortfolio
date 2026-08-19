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

const COHORT = [
  { id: 78, idx: [0, 1, 2] },
  { id: 69, idx: [0] },
  { id: 63, idx: [0] },
  { id: 40, idx: [0, 1, 2] },
  { id: 79, idx: [0] },
];
const ROLLBACK = new URL("./pilot-rollback.json", import.meta.url).pathname;
const DRY = process.argv.includes("--dry");
const ROLLING_BACK = process.argv.includes("--rollback");

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
