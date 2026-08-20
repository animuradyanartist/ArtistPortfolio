# Handover — direct-sale commerce, 2026-08-20

## Where things stand

| PR | What | State |
|---|---|---|
| #41 | direct artwork sales, end to end | **merged, live** |
| #42 | shipping UX, one Offer per painting, DB-backed rate limit | **merged, live** |
| #43 | drizzle-kit filter/declare contradiction | **merged, live** |
| #44 | Replit dev→prod schema sync | **merged**; `npm run db:sync` reported 15/15 · 2/2 · 1/1 and the publish completed |
| #45 | direct-sale CTA hierarchy **+ artwork-page performance** | **open, unmerged** — branch `fix/direct-sale-cta-hierarchy`, head `0d42ce6` |

Production: Stripe **configured** (`checkoutEnabled: true`). One artwork enabled for direct sale —
**id 69, Road to Tuscany, €1,000, available, shipping enabled**, marketplace price 2420 USD
(separate field, untouched). No order has ever been created; nothing has been marked Sold.

## The three production problems in this task — all three resolved

1. **Wrong Buy destination** — fixed in #45, and now visually confirmed: the only off-site
   link anywhere on the artwork page is the small secondary "View on Singulart" at the
   bottom, and Buy Now goes to `/checkout?artwork=69`, which renders "Complete your purchase"
   on this site.
2. **Slow artwork detail page** — root cause found, fixed, measured. Below.
3. **Missing website price / shipping UI** — screenshotted on desktop and mobile. Below.

## Problem 2 — the cause was one query, made three times

`/artworks/69` and `/artworks/road-to-tuscany-69` are the same painting and return the same
9,615 bytes. On production, on 2026-08-20:

| URL | TTFB (3 runs) |
|---|---|
| `/artworks/69` | 0.85 · 1.82 · 1.88s |
| `/artworks/road-to-tuscany-69` | 3.52 · 3.56 · 4.12s |

A bare numeric id skips the `/artworks/:slug` canonicalisation middleware, because there is
nothing to canonicalise. That middleware called `storage.getAllArtworks()` — every row in the
table, base64 images included — to compare four strings. The same read happened again in
`/api/artworks/:id` (`/api/artworks/69` 0.58-1.18s vs `/api/artworks/road-to-tuscany-69`
2.35-3.45s) and a third time in the prerender's fallback.

**The fix.** `storage.getArtworkAddressIndex()` selects only `id, title, slug, seoSlug` —
no images — memoised on the existing `memoJson` cache at the existing 60s TTL, so admin edits
still clear it through `invalidateApiCache()`. The redirect, the API and the prerender all
resolve against it and then fetch only the one row that won. Resolution order and the strict
address rule are unchanged.

**A second cause, on the client.** The prerender already puts the image, title and metadata in
the HTML — then React mounted, discarded it, and rendered a full-screen "Loading…" until
`/api/artworks/:id` answered. The document now carries
`window.__PRELOADED_ARTWORK__` (refified exactly like the API, never base64) and the page
renders from it, so nothing waits on a request. Also: `PurchasePanel` seeded its country
synchronously instead of in an effect, which removes the duplicate quote; "More from the
collection" asks for `?limit=4` instead of all 54 works and does not ask until the browser is
idle; and `Navigation`'s `/api/blog` is gated the same way.

### Before / after, same probe

Measured with `performance.getEntriesByType("navigation")` plus a per-request table, in a
visible tab, cold cache, against the **production build with production data**, behind a proxy
that replays the per-endpoint latencies measured on animuradyan.com that day
(`before` = what production does now, `after` = what production already answers with when the
full-catalogue read does not happen — `/artworks/69` and `/api/artworks/69`).

| | before (`7860c7e`) | after | |
|---|---|---|---|
| TTFB | 3561ms | 1087ms | −69% |
| First contentful paint | 4236ms | 1476ms | −65% |
| **Painting visible to the visitor** | **7105ms** | **1191ms** | **−83%** |
| "Loading…" on screen | 3827→7105ms (3.3s) | never rendered | gone |
| Price + shipping settled | 8467ms | 2505ms | −70% |
| API requests | 5 | 4 | |
| Everything settled | 8467ms | 2768ms | −67% |

"Painting visible" is sampled from the live DOM every 130ms in a same-origin iframe, not
inferred: before it reads `Loading…` for 3.3 seconds, after it goes straight from blank to
"Road to Tuscany / Oil on Canvas · 61x71cm · 2026".

Request-level, on the detail page:

| before | after |
|---|---|
| `/api/blog` (on mount) | deferred to idle |
| `/api/artworks/road-to-tuscany-69` | still there, but no longer blocks the render |
| `/api/artworks` — all 54 works, 111KB | `/api/artworks?limit=4`, deferred to idle |
| `/api/commerce/quote?artworkId=69` | **removed** — the country is known on first render |
| `/api/commerce/quote?artworkId=69&country=XX` | the only quote |

The reproduction rig is not in the repo — it is a latency-replay proxy plus a worktree of
`7860c7e`, both disposable. The numbers it produced match the production measurements at the
top of this file, which is what makes it trustworthy.

## Problem 3 — verified on screen, desktop and mobile

Rendered on `/artworks/road-to-tuscany-69` at 1440×900 and at 375×812, from the DOM and from
screenshots, not from the API:

```
PRICE                                    €1,000.00
Shipping to Italy — estimated €314.82    CHANGE COUNTRY
ESTIMATED TOTAL                          €1,314.82
[ BUY NOW ]  [ ADD TO CART ]
Shipped from Armenia. Import duties or taxes … not included …
View on Singulart
```

`BUY NOW` is `<a href="/checkout?artwork=69">`, solid dark, first in the row. `ADD TO CART` is
outlined beside it. `View on Singulart` is small grey text below the duties note and is the
only `target="_blank"` link on the page. The marketplace price line above the panel correctly
stands down, so the page states one price.

## Guardrails, re-checked

- **402 tests pass** (394 + 8 new in `server/artworkDetailCost.test.ts`), build clean,
  `tsc` **55 errors on base and 55 on branch** — measured on both, unchanged.
- `/sitemap.xml`, `/image-sitemap.xml`, `/robots.txt`, `/api/artworks`, `/api/artworks/69`
  are **byte-identical** before and after. `/artworks`, `/blog` and `/path` differ only in
  the bundle hash.
- `/img/artwork/69/0` still 302s; `/artworks/does-not-exist-99999` and `/blog/nope` still 404;
  `/artworks/total-nonsense-69` still 404s as a page (pinned by a new test).
- Commerce still fails closed: with no Stripe secrets, `checkoutEnabled: false` and a direct
  POST returns 503 `checkout-unconfigured` — while price and shipping still display.
- `price` 2420 USD and `websitePriceMinor` 100000 EUR remain separate on artwork 69.
- No payment was made, nothing was marked Sold, nothing was published.

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

- 402 tests · build clean · `tsc` **55 errors on base and 55 on branch** (that 55 is the
  pre-existing baseline, not new debt).
- **Resolving one painting must never read the whole catalogue.** Three code paths converge
  on it — the `/artworks/:slug` redirect, `/api/artworks/:id`, and the prerender resolver —
  and each one cost seconds on the live database. `server/artworkDetailCost.test.ts` counts
  `storage.getAllArtworks()` calls on those paths and requires zero.
- **The artwork must paint without waiting for an API.** The document carries
  `window.__PRELOADED_ARTWORK__`; the same test pins that it is present, matches the row, and
  never inlines base64.
- Commerce fails closed without BOTH Stripe secrets; a direct POST returns `checkout-unconfigured`.
- `artworks.price` (marketplace) and `websitePriceMinor` (website) are separate and neither is
  derived from the other.
- A work on direct sale never shows an off-site primary CTA — `artworkCommerceDisplay` decides,
  and `shared/commerce/ctaHierarchy.test.ts` pins it.
- Article figures, sitemaps, first-party `/img/artwork/:id/0` routes and 404 behaviour unchanged.
