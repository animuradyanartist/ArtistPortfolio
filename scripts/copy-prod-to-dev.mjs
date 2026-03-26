/**
 * One-time script: copy content tables from neondb (production) to neondb_dev (test).
 * Skips: users, session, feedback (intentionally separate per environment).
 * Safe to re-run — clears dev tables before inserting.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');

neonConfig.webSocketConstructor = ws;

const PROD_URL = process.env.DATABASE_URL;
if (!PROD_URL) throw new Error('DATABASE_URL not set');

const devUrl = new URL(PROD_URL);
devUrl.pathname = `/${devUrl.pathname.slice(1)}_dev`;
const DEV_URL = devUrl.toString();

const prodPool = new Pool({ connectionString: PROD_URL });
const devPool  = new Pool({ connectionString: DEV_URL });

async function copyTable(tableName, columns) {
  process.stdout.write(`  ${tableName} ... `);

  const { rows } = await prodPool.query(`SELECT * FROM ${tableName} ORDER BY id`);
  if (rows.length === 0) {
    console.log('empty (skipped)');
    return;
  }

  await devPool.query(`TRUNCATE TABLE ${tableName} RESTART IDENTITY CASCADE`);

  for (const row of rows) {
    const vals = columns.map(c => row[c]);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    await devPool.query(
      `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`,
      vals
    );
  }

  // Reset the sequence so new inserts continue from the right ID
  await devPool.query(
    `SELECT setval(pg_get_serial_sequence('${tableName}', 'id'), COALESCE(MAX(id), 0) + 1, false) FROM ${tableName}`
  );

  console.log(`${rows.length} rows copied`);
}

async function main() {
  console.log('Connecting to production (neondb) and dev (neondb_dev)...\n');

  await copyTable('artworks', [
    'id', 'title', 'slug', 'seo_slug', 'description', 'medium', 'dimensions',
    'year', 'price', 'images', 'type', 'size', 'availability',
    'saatchi_url', 'buy_link', 'featured', 'position',
    'available_for_print', 'print_sizes', 'preferred_print_material',
  ]);

  await copyTable('prints', [
    'id', 'title', 'slug', 'description', 'images', 'artwork_id',
    'available_sizes', 'preferred_material', 'status', 'featured', 'position',
    'created_at', 'updated_at',
  ]);

  await copyTable('exhibitions', [
    'id', 'title', 'type', 'venue', 'location', 'year',
    'start_date', 'end_date', 'description', 'image',
  ]);

  await copyTable('homepage_settings', [
    'id', 'hero_quote', 'hero_image', 'featured_artwork_ids',
  ]);

  await copyTable('artist_bio', [
    'id', 'title', 'description', 'image', 'statement', 'education', 'awards',
  ]);

  await copyTable('contact_settings', [
    'id', 'instagram_url', 'saatchi_url', 'email', 'location', 'instagram_handle',
  ]);

  await copyTable('gallery_photos', [
    'id', 'title', 'image', 'exhibition_name', 'location', 'year',
    'featured', 'position', 'created_at',
  ]);

  console.log('\nDone. Dev database now mirrors production content.');
  await prodPool.end();
  await devPool.end();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
