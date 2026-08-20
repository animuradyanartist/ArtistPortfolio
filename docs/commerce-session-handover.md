# Handover — direct-sale commerce, 2026-08-20

## Where things stand

| PR | What | State |
|---|---|---|
| #41 | direct artwork sales, end to end | **merged, live** |
| #42 | shipping UX, one Offer per painting, DB-backed rate limit | **merged, live** |
| #43 | drizzle-kit filter/declare contradiction | **merged, live** |
| #44 | Replit dev→prod schema sync | **merged**; `npm run db:sync` reported 15/15 · 2/2 · 1/1 and the publish completed |
| #45 | direct-sale CTA hierarchy | **open, unmerged** — branch `fix/direct-sale-cta-hierarchy`, head `23b1b66` |

Production: Stripe **configured** (`checkoutEnabled: true`). One artwork enabled for direct sale —
**id 69, Road to Tuscany, €1,000, available, shipping enabled**, marketplace price 2420 USD
(separate field, untouched). No order has ever been created; nothing has been marked Sold.

## The three production problems in this task

1. **Wrong Buy destination** — fixed in #45, verified on a production build with production data.
2. **Slow artwork detail page** — measured, NOT yet fixed. Numbers below.
3. **Missing website price / shipping UI** — the values render on a production build; what has
   NOT been done is a *visual* confirmation on the real live page, desktop and mobile.

## Problem 2 — measured on the live page, 2026-08-20

`https://animuradyan.com/artworks/road-to-tuscany-69`

```
TTFB 3950ms · FCP 4752ms · DOMContentLoaded 6033ms · networkidle 13.9s
27 requests, 5 of them API
```

| ms | request | note |
|---|---|---|
| 1984 | `/api/commerce/quote?artworkId=69&country=DE` | |
| 1836 | `/api/artworks/road-to-tuscany-69` | the artwork itself |
| **1019** | `/api/commerce/quote?artworkId=69` | **DUPLICATE** — fired before the country resolves |
| 350 | `/api/blog` | Navigation deciding whether to show "Articles" |
| 308 | `/api/artworks` | **the whole 54-artwork catalogue**, for "More from the collection" |
| 3414 | the HTML document | server-side render/inject |
| 1891–2306 | `/img/artwork/{69,63,78}/0` | |

### Leads, in the order worth trying

- **The duplicate quote is mine.** `PurchasePanel` runs its query with `country = null` on first
  render, then again once `displayCountry()` resolves — two round trips, ~3s combined, before a
  price appears. Gate the first fetch on a country being known, or seed the country
  synchronously on first render rather than in an effect.
- **`/api/artworks` on a detail page** pulls the entire catalogue to show three related works.
  A `?limit=` / related endpoint, or reusing already-cached data, removes it.
- **`/api/blog` on every page** comes from `Navigation`. It is cached per session but still costs
  a round trip on first paint of any page.
- **Commerce must not gate the artwork.** Title, image and metadata should paint from
  `/api/artworks/:id` without waiting on `/api/commerce/quote`. Check whether the panel's
  Suspense/loading state is holding anything above it.
- **TTFB ~4s is server-side** and is the largest single number. Worth confirming whether the
  artwork SSR injection (`injectArtworkMeta` + `renderArtworkHtml` + `measurePrimaryImage`) is
  doing image work per request.

Take a fresh before/after with the same probe: navigation timings from
`performance.getEntriesByType("navigation")` plus a per-request table, so the comparison is
like for like.

## Problem 3 — what "verified" must mean here

Not an API assertion. Load the real page at `https://animuradyan.com/artworks/road-to-tuscany-69`
on desktop **and** mobile and see, rendered:

website price · detected destination · estimated shipping · estimated total · internal Buy Now ·
Add to Cart · secondary "View on Singulart"

Note this cannot be fully true on production until #45 ships, since #45 is what makes the
marketplace link secondary and named. Verify on the production build locally first, then again
on production after the merge and publish.

## How to run a faithful local replica

```bash
# production build + production data, in the repo root
python3 - <<'PY'
import json, urllib.request
aw = json.load(urllib.request.urlopen("https://animuradyan.com/api/artworks"))
for a in aw:
    im = a.get('images') or []
    if im and str(im[0]).startswith('/'):
        a['images'][0] = 'https://animuradyan.com' + str(im[0]).split('?')[0]
json.dump({"artworks": aw, "blogPosts": []}, open('server/preview-data.json','w'), indent=1)
PY
npm run build
PORT=5021 NODE_ENV=production \
  STRIPE_SECRET_KEY=sk_test_localonly_0123456789abcdefghijklmnop \
  STRIPE_WEBHOOK_SECRET=whsec_localonly_0123456789abcdefghij \
  node dist/index.js
```

`server/preview-data.json` is gitignored. The fake keys only flip `checkoutEnabled`; nothing in
this repo calls Stripe unless a checkout is actually submitted.

**Two tests fail whenever that fixture is present** (`server/artworksPage.test.ts` — it asserts
against its own artwork expectations). Move the file aside before running the suite:
`mv server/preview-data.json /tmp/ && npx vitest run && mv /tmp/preview-data.json server/`.

## Guardrails that must not regress

- 394 tests · build clean · `tsc` **55 errors on base and 55 on branch** (that 55 is the
  pre-existing baseline, not new debt).
- Commerce fails closed without BOTH Stripe secrets; a direct POST returns `checkout-unconfigured`.
- `artworks.price` (marketplace) and `websitePriceMinor` (website) are separate and neither is
  derived from the other.
- A work on direct sale never shows an off-site primary CTA — `artworkCommerceDisplay` decides,
  and `shared/commerce/ctaHierarchy.test.ts` pins it.
- Article figures, sitemaps, first-party `/img/artwork/:id/0` routes and 404 behaviour unchanged.
