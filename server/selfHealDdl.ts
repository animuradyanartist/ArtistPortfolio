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
  // ── payment reconciliation (must mirror shared/schema.ts orders + order_audit) ──
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_source text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_status text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_payment_check_at timestamp`,
  `CREATE TABLE IF NOT EXISTS order_audit (
        id serial PRIMARY KEY,
        order_id integer NOT NULL,
        action text NOT NULL,
        result text,
        detail text,
        actor text,
        created_at timestamp DEFAULT now()
      )`,
  `CREATE INDEX IF NOT EXISTS order_audit_order_idx ON order_audit (order_id)`,
  `CREATE TABLE IF NOT EXISTS stripe_events (
        id serial PRIMARY KEY,
        event_id text NOT NULL,
        type text NOT NULL,
        received_at timestamp DEFAULT now()
      )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS stripe_events_event_id_unique ON stripe_events (event_id)`,
  `CREATE INDEX IF NOT EXISTS artworks_reserved_until_idx ON artworks (reserved_until)`,
  // ── PRINT FULFILMENT via a provider (Prodigi). One commerce system: these live on the orders
  //    table and are null on original-artwork orders. Must mirror shared/schema.ts orders exactly. ──
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfilment_provider text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS print_variant_id integer`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS prodigi_order_id text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfilment_status text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfilment_idempotency_key text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfilment_error text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfilment_retry_count integer DEFAULT 0`,
  // The print PRODUCT (one per artwork). Predates the variant model; CREATE IF NOT EXISTS is a
  // no-op where it already exists in production.
  `CREATE TABLE IF NOT EXISTS prints (
        id serial PRIMARY KEY,
        title text NOT NULL,
        slug text,
        description text NOT NULL,
        images text[] NOT NULL,
        artwork_id integer,
        available_sizes text NOT NULL,
        preferred_material text NOT NULL DEFAULT 'paper',
        status text NOT NULL DEFAULT 'active',
        featured boolean DEFAULT false,
        position integer DEFAULT 0,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
  // PRINT VARIANTS — the purchasable material × size × frame configurations of a print. Both
  // eligible (master cleared the resolution engine) AND enabled (an admin turned it on) must be
  // true before a customer can buy it. prodigi_verified records SKU reconciliation state.
  `CREATE TABLE IF NOT EXISTS print_variants (
        id serial PRIMARY KEY,
        print_id integer NOT NULL,
        material text NOT NULL,
        prodigi_sku text NOT NULL,
        size_label text NOT NULL,
        width_cm integer NOT NULL,
        height_cm integer NOT NULL,
        framed boolean NOT NULL DEFAULT false,
        frame_colour text,
        border text,
        retail_minor integer,
        currency text NOT NULL DEFAULT 'EUR',
        base_cost_minor integer,
        print_ready_asset_url text,
        mockups text[],
        effective_dpi integer,
        min_dpi integer,
        eligible boolean NOT NULL DEFAULT false,
        enabled boolean NOT NULL DEFAULT false,
        prodigi_verified boolean NOT NULL DEFAULT false,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
  `ALTER TABLE print_variants ADD COLUMN IF NOT EXISTS prodigi_verified boolean NOT NULL DEFAULT false`,
  `CREATE INDEX IF NOT EXISTS print_variants_print_idx ON print_variants (print_id)`,
  // PRINT MASTERS — the readiness record for the high-resolution source. Fails closed: default
  // status 'missing' means nothing is publicly purchasable until a real master is supplied.
  `CREATE TABLE IF NOT EXISTS print_masters (
        id serial PRIMARY KEY,
        artwork_id integer NOT NULL,
        width_px integer,
        height_px integer,
        print_ready_asset_url text,
        checksum_md5 text,
        status text NOT NULL DEFAULT 'missing',
        note text,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS print_masters_artwork_unique ON print_masters (artwork_id)`,
  // ── SEO GROWTH SYSTEM (DataForSEO). Additive; nothing runs until credentials are set. ──
  `CREATE TABLE IF NOT EXISTS seo_keywords (
        id serial PRIMARY KEY,
        keyword text NOT NULL,
        family text NOT NULL,
        primary_target_url text,
        status text NOT NULL DEFAULT 'active',
        source text NOT NULL DEFAULT 'seed',
        notes text,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS seo_keywords_keyword_unique ON seo_keywords (keyword)`,
  `CREATE TABLE IF NOT EXISTS seo_keyword_snapshots (
        id serial PRIMARY KEY,
        keyword_id integer NOT NULL,
        captured_at timestamp DEFAULT now(),
        search_volume integer,
        cpc text,
        competition text,
        difficulty integer,
        main_intent text,
        our_rank integer,
        our_ranking_url text,
        opportunity_score integer,
        top_domains text,
        serp_features text,
        raw text
      )`,
  `CREATE INDEX IF NOT EXISTS seo_keyword_snapshots_keyword_idx ON seo_keyword_snapshots (keyword_id)`,
  `CREATE TABLE IF NOT EXISTS seo_actions (
        id serial PRIMARY KEY,
        keyword text NOT NULL,
        family text,
        type text NOT NULL,
        action_group text,
        target_url text,
        priority integer NOT NULL DEFAULT 0,
        effort text,
        objective text,
        reason text,
        evidence text,
        recommended_change text,
        status text NOT NULL DEFAULT 'todo',
        created_at timestamp DEFAULT now(),
        completed_at timestamp,
        before_metrics text,
        after_metrics text
      )`,
  `CREATE INDEX IF NOT EXISTS seo_actions_status_idx ON seo_actions (status)`,
  `CREATE TABLE IF NOT EXISTS seo_api_cache (
        id serial PRIMARY KEY,
        cache_key text NOT NULL,
        data_type text NOT NULL,
        params text,
        response text,
        cost text,
        fetched_at timestamp DEFAULT now(),
        expires_at timestamp
      )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS seo_api_cache_key_unique ON seo_api_cache (cache_key)`,
  `CREATE TABLE IF NOT EXISTS seo_api_usage (
        id serial PRIMARY KEY,
        data_type text NOT NULL,
        endpoint text,
        cost text,
        cache_hit boolean NOT NULL DEFAULT false,
        created_at timestamp DEFAULT now()
      )`,
  `CREATE INDEX IF NOT EXISTS seo_api_usage_created_idx ON seo_api_usage (created_at)`
];
