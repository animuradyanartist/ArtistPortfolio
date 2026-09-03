# Originals → USD price plan (owner action)

**Status: PROPOSAL. Nothing here is written to the database by this PR.**

This PR standardises direct-sale commerce on **USD** in code (defaults, structured data, checkout,
Merchant feed, shipping conversion). It does **not** change any artwork's stored price or currency.
The 21 currently Merchant-eligible originals still hold their EUR values in production until you
approve the USD retail prices below and set them yourself in the admin editor.

## How the proposed USD prices were derived

- Rule: `current EUR website price × 1.10`, then rounded to the **nearest $50**.
- The nearest-$50 rounding never lands more than **$20 below** the raw converted figure (< 3%), and
  the **relative price hierarchy is preserved** — a more expensive painting in EUR stays more
  expensive in USD.
- These are a starting point for your judgement, not a decision. Change any of them before applying.

## Proposed prices

| id | title | current EUR | raw USD (×1.10) | **proposed clean USD** |
|----|-------|-------------|-----------------|------------------------|
| 53 | Red Barn | €400 | $440 | **$450** |
| 58 | Found in Silence | €400 | $440 | **$450** |
| 60 | Quiet Pathway | €400 | $440 | **$450** |
| 55 | Beyond Every Limit | €450 | $495 | **$500** |
| 14 | Winter Calm | €500 | $550 | **$550** |
| 56 | A Safe Distance | €500 | $550 | **$550** |
| 48 | Vibrant Valleys | €700 | $770 | **$750** |
| 50 | Threshold of Memories | €700 | $770 | **$750** |
| 43 | Echoes of the Mind | €800 | $880 | **$900** |
| 44 | One Shared Feeling | €800 | $880 | **$900** |
| 40 | Blue Drift | €900 | $990 | **$1000** |
| 69 | Road to Tuscany | €1000 | $1100 | **$1100** |
| 74 | Time | €1000 | $1100 | **$1100** |
| 41 | A Road to Tomorrow | €1100 | $1210 | **$1200** |
| 42 | Blue Detachment | €1100 | $1210 | **$1200** |
| 70 | A Sign in the Distance | €1200 | $1320 | **$1300** |
| 71 | Before Leaving | €1200 | $1320 | **$1300** |
| 72 | Still With Me | €1200 | $1320 | **$1300** |
| 73 | Observer | €1200 | $1320 | **$1300** |
| 51 | Inner Direction | €1400 | $1540 | **$1550** |
| 62 | Silent Bliss | €1500 | $1650 | **$1650** |

*(id 79 "No Measure for Distance" is intentionally absent — it is freight-only / parcel-too-large
and remains excluded from the Merchant feed.)*

## Owner action (when you approve the prices)

Two equivalent ways — **nothing runs until you do it**:

**A. By hand, in the admin artwork editor** (per work): set **Currency = USD** and the **website price**
to the approved USD amount.

**B. Auditable batch script** (preferred for all 21 at once) — `scripts/migrate-originals-usd.ts`:

```bash
# 1. Confirm/edit the approved prices in APPROVED_USD_MAJOR at the top of the script.
# 2. Dry run — prints the exact before → after for every row, writes NOTHING:
tsx scripts/migrate-originals-usd.ts
# 3. When the plan looks right, apply it (writes websitePriceMinor + websiteCurrency only):
tsx scripts/migrate-originals-usd.ts --apply
```

The script connects to whatever `DATABASE_URL` is set when you run it — point it at production
deliberately. It is **idempotent** (a row already USD is skipped) and **refuses to overwrite** a row
whose currency is not EUR, so a hand-edit is never clobbered.

Either way, nothing else changes: `directSaleEnabled`, dimensions, shipping settings, and the
marketplace `price` field are untouched. Historical orders keep their own currency snapshots and are
never rewritten (the order view reads `order.currency`, not the artwork's current currency).

## Shipping (handled in code — no per-work action)

Shipping is quoted by the EUR-denominated estimator (`ZONE_TARIFF`, fitted to a real EUR invoice,
**left unchanged**). A USD work's shipping is converted at one fixed constant,
`SHIPPING_EUR_TO_USD = 1.10` (`shared/commerce/shipping.ts`), applied identically by the checkout
pricer and the Merchant feed so the charged and advertised shipping always match. No live FX.
