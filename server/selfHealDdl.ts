/**
 * THE SELF-HEALING SCHEMA, AS DATA — so it can run somewhere other than boot.
 *
 * These statements used to live inline in server/index.ts and ran only when the app STARTED.
 * That is exactly what broke the deployment on 2026-08-20.
 *
 * Replit Publishing does not diff shared/schema.ts against production. It syncs the
 * DEVELOPMENT database's schema onto production — so a column that exists in production and
 * NOT in development is scheduled for DELETION. server/index.ts has said so since 2026-08-17.
 *
 * The commerce columns reached production because the DEPLOYED app booted and ran this list.
 * They never reached DEVELOPMENT, because the workspace app was not started after the pull and
 * the [postMerge] hook that would have run `db:push` is capped at 20 seconds — less than
 * `npm install` takes. So development stayed behind, and the publish preview proposed dropping
 * every commerce column and table.
 *
 * Extracted here so `scripts/sync-dev-schema.mjs` can apply the SAME list to the development
 * database in about a second, without a build, an app start, or an npm install completing.
 * One list, two callers, no chance of them drifting.
 *
 * EVERY STATEMENT IS IDEMPOTENT. ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS /
 * CREATE INDEX IF NOT EXISTS. Running it twice does nothing the second time, and it never
 * drops or alters anything that already exists.
 */
export const SELF_HEAL_DDL: readonly string[] = [
  `ALTER TABLE artworks ADD COLUMN IF NOT EXISTS category text`,
  `ALTER TABLE artworks ADD COLUMN IF NOT EXISTS seo_slug text`,
  `ALTER TABLE artworks ADD COLUMN IF NOT EXISTS detail_images_checked boolean DEFAULT false`,
  `ALTER TABLE artworks ADD COLUMN IF NOT EXISTS source_description text`,
  `ALTER TABLE artworks ADD COLUMN IF NOT EXISTS source_description_provider text`,
  `ALTER TABLE artworks ADD COLUMN IF NOT EXISTS derived_categories text[]`,
  `ALTER TABLE homepage_settings ADD COLUMN IF NOT EXISTS room_items text`,
  `CREATE TABLE IF NOT EXISTS blog_posts (
        id serial PRIMARY KEY,
        slug text NOT NULL,
        title text NOT NULL,
        excerpt text NOT NULL,
        body text NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        source_note text,
        evidence text[],
        cover_image text,
        published_at timestamp,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS blog_posts_slug_unique ON blog_posts (slug)`,
  `ALTER TABLE artworks ADD COLUMN IF NOT EXISTS direct_sale_enabled boolean DEFAULT false`,
  `ALTER TABLE artworks ADD COLUMN IF NOT EXISTS website_price_minor integer`,
  `ALTER TABLE artworks ADD COLUMN IF NOT EXISTS website_currency text DEFAULT 'EUR'`,
  `ALTER TABLE artworks ADD COLUMN IF NOT EXISTS shipping_enabled boolean DEFAULT true`,
  `ALTER TABLE artworks ADD COLUMN IF NOT EXISTS shipping_override_minor integer`,
  `ALTER TABLE artworks ADD COLUMN IF NOT EXISTS shipping_destination_overrides text`,
  `ALTER TABLE artworks ADD COLUMN IF NOT EXISTS packed_depth_cm integer`,
  `ALTER TABLE artworks ADD COLUMN IF NOT EXISTS packing_margin_cm integer`,
  `ALTER TABLE artworks ADD COLUMN IF NOT EXISTS fulfilment_notes text`,
  `ALTER TABLE artworks ADD COLUMN IF NOT EXISTS reserved_until timestamp`,
  `ALTER TABLE artworks ADD COLUMN IF NOT EXISTS reserved_by_order_id integer`,
  `ALTER TABLE artworks ADD COLUMN IF NOT EXISTS has_commitment boolean DEFAULT false`,
  `ALTER TABLE artworks ADD COLUMN IF NOT EXISTS commitment_type text`,
  `ALTER TABLE artworks ADD COLUMN IF NOT EXISTS commitment_details text`,
  `ALTER TABLE artworks ADD COLUMN IF NOT EXISTS commitment_until text`,
  `CREATE TABLE IF NOT EXISTS orders (
        id serial PRIMARY KEY,
        reference text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        payment_status text NOT NULL DEFAULT 'unpaid',
        buyer_name text,
        buyer_email text,
        buyer_phone text,
        ship_country text,
        ship_address1 text,
        ship_address2 text,
        ship_city text,
        ship_region text,
        ship_postal_code text,
        item_type text NOT NULL DEFAULT 'artwork',
        artwork_id integer,
        artwork_snapshot text,
        item_price_minor integer,
        currency text NOT NULL DEFAULT 'EUR',
        shipping_minor integer,
        total_minor integer,
        shipping_basis text,
        shipping_calculation text,
        stripe_checkout_session_id text,
        stripe_payment_intent_id text,
        reserved_at timestamp,
        reservation_expires_at timestamp,
        paid_at timestamp,
        shipping_carrier text,
        tracking_number text,
        shipped_at timestamp,
        delivered_at timestamp,
        attribution text,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS orders_reference_unique ON orders (reference)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_session_unique
        ON orders (stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL`,
  // ── order-lifecycle additions (must mirror shared/schema.ts orders exactly) ──
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_url text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS packed_at timestamp`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS expected_dispatch_at timestamp`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_delivery_at timestamp`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS exception_state text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_message text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS internal_notes text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_token text`,
  `CREATE UNIQUE INDEX IF NOT EXISTS orders_tracking_token_unique
        ON orders (tracking_token) WHERE tracking_token IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS order_emails (
        id serial PRIMARY KEY,
        order_id integer NOT NULL,
        kind text NOT NULL,
        to_email text,
        subject text,
        status text NOT NULL DEFAULT 'sent',
        provider_id text,
        error text,
        dedupe_key text,
        created_at timestamp DEFAULT now()
      )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS order_emails_dedupe_unique
        ON order_emails (dedupe_key) WHERE dedupe_key IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS order_emails_order_idx ON order_emails (order_id)`,
  `CREATE TABLE IF NOT EXISTS stripe_events (
        id serial PRIMARY KEY,
        event_id text NOT NULL,
        type text NOT NULL,
        received_at timestamp DEFAULT now()
      )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS stripe_events_event_id_unique ON stripe_events (event_id)`,
  `CREATE INDEX IF NOT EXISTS artworks_reserved_until_idx ON artworks (reserved_until)`
];
