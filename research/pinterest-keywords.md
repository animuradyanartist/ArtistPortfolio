# Pinterest SEO keyword strategy — animuradyan.com

Research-only. Nothing in this file changes the production site, SEO metadata, or Pinterest.

---

## ⚠️ DATA STATUS — read first

This document was prepared in an environment where the **DataForSEO credentials are not present**
(`DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` live in the Replit Secrets, not in this checkout). The
project's DataForSEO client **fails closed** without them, so **no live keyword metrics could be
pulled here.**

Per the brief, **no search volumes, CPCs, or competition numbers have been invented.** Every metric
cell below reads `— (pending)` until the research script is run where the credentials exist.

**To fill in the real numbers**, run — in the Replit Shell (where the secrets + `DATABASE_URL` are set):

```bash
npx tsx scripts/pinterest-keyword-research.ts
```

That pulls **real** DataForSEO Labs metrics (`keyword_overview` + `keyword_ideas`) for the seed set
across all six markets and writes them to [`research/pinterest-keywords.csv`](./pinterest-keywords.csv).
Then reconcile the tier tables in this file against the CSV. The script uses the app's cost-control
cache, so a re-run is free.

**Everything that is craft rather than data — the intent classification, Pinterest adaptation, board
plan, and the *Edge of the Infinite* pins — is complete below and does not depend on the numbers.**
The tier *rankings*, however, are **editorial candidates** to be re-ordered once real volume/intent
data lands. They are labelled as such; do not read them as data-derived yet.

---

## A. DataForSEO sources used (by the script)

| Endpoint | Tier | What it returns |
|---|---|---|
| `dataforseo_labs/google/keyword_overview/live` | cheap (Labs) | `search_volume`, `cpc`, `competition` (0–1 ad-auction), `competition_level` (LOW/MED/HIGH), `monthly_searches` (12-mo trend), `search_intent_info.main_intent` |
| `dataforseo_labs/google/keyword_ideas/live` | cheap (Labs) | Related keyword expansion, each with the same `keyword_info` block |

Deliberately **not** called (cost / not needed for this task): `serp/google/organic/live/advanced`
(expensive, per-request), `ranked_keywords`, `competitors_domain`.

> Note on `keyword_difficulty`: `keyword_overview` returns it as `0`/absent for art terms and it is
> **not a reliable organic-difficulty signal** from this endpoint. It is therefore **not** reported as
> data. `competition`/`competition_level` are **ad-auction** signals, not organic difficulty — read
> them as "how commercial/monetised is this query", which is exactly the buyer-intent signal we want.

## B. Markets researched (English, requested priority order)

| # | Market | `location_code` | `language_code` |
|---|---|---|---|
| 1 | United States | 2840 | en |
| 2 | United Kingdom | 2826 | en |
| 3 | Germany | 2276 | en |
| 4 | France | 2250 | en |
| 5 | Canada | 2124 | en |
| 6 | Australia | 2036 | en |

## C. Keywords analysed

- **41 seed keywords** (below) × **6 markets** submitted to `keyword_overview`.
- **+ `keyword_ideas` expansion** around 7 focused anchors × 6 markets (up to 200 ideas each).
- Exact final count is written by the script (`rows written: N`) — the universe below is the input, the
  CSV is the measured output.

---

## STEP 1–2 — Seed universe (the phrases we measure)

These are the phrases sent to DataForSEO. The numbers come back from the API, never from here.

**Commercial / product:** fine art prints · art prints · giclee prints · giclee art prints ·
contemporary art prints · large fine art prints · buy art prints · original paintings for sale ·
original landscape painting · contemporary landscape painting

**Landscape / seascape / coastal:** landscape art · landscape prints · seascape art · seascape prints ·
coastal wall art · modern coastal wall art · ocean fine art prints · large landscape wall art ·
neutral landscape wall art · calming landscape wall art · serene landscape art ·
contemporary landscape prints · modern seascape prints · minimalist landscape prints ·
minimalist landscape art · modern landscape art

**Blue:** blue wall art · blue artwork · blue coastal wall art · blue coastal art prints ·
large blue wall art · blue art for living room · modern blue wall art

**Interiors / decor:** modern wall art · large wall art · art for living room · art for bedroom ·
calming wall art · serene wall art · statement wall art · large wall art for living room · minimalist wall art

`keyword_ideas` anchors (expansion seeds): fine art prints · coastal wall art · blue wall art ·
landscape prints · seascape art · large wall art for living room · minimalist landscape art

---

## STEP 3 — Buyer-intent classification (editorial)

This is a judgment layer over the phrases, mapped to the brief's A/B/C/D buckets. Once the CSV lands,
cross-check with each keyword's real `main_intent` (`commercial`/`transactional` = strongest for sales).

### A — HIGH COMMERCIAL INTENT (someone ready to buy)
`fine art prints` · `art prints` · `giclee prints` · `giclee art prints` · `contemporary art prints` ·
`large fine art prints` · `buy art prints` · `original paintings for sale` · `ocean fine art prints` ·
`original landscape painting`

### B — INTERIOR / DECOR INTENT (buying to furnish a room — Pinterest's core behaviour)
`coastal wall art` · `modern coastal wall art` · `blue wall art` · `blue art for living room` ·
`large wall art for living room` · `large blue wall art` · `art for living room` · `art for bedroom` ·
`calming wall art` · `serene wall art` · `statement wall art` · `minimalist wall art` ·
`neutral landscape wall art` · `large landscape wall art` · `calming landscape wall art`

### C — ART STYLE / DISCOVERY INTENT (browsing a look)
`contemporary landscape painting` · `contemporary landscape prints` · `modern landscape art` ·
`minimalist landscape art` · `minimalist landscape prints` · `modern seascape prints` ·
`serene landscape art` · `seascape art` · `landscape art` · `blue artwork` · `blue coastal wall art` ·
`blue coastal art prints` · `modern blue wall art`

### D — LOW-VALUE / INFORMATIONAL (do NOT prioritise for Pinterest sales)
Anything the `keyword_ideas` pull surfaces that is how-to / definition / free / DIY / "meaning of…" /
coloring-page / drawing-tutorial in nature (e.g. "how to paint a seascape", "what is giclee",
"free wall art printable"). Filter these out of the money tiers; they can seed a *separate* top-of-funnel
board at most.

---

## STEP 5 — Pinterest adaptation (how to read the data for Pinterest)

**DataForSEO demand ≠ Pinterest demand.** DataForSEO measures **Google** search demand. Pinterest is a
separate, visual, high-purchase-intent discovery engine with its own query patterns. We use DataForSEO
as **evidence that a phrase has real, monetised search demand somewhere**, then apply Pinterest craft to
decide which phrases are natural on Pinterest.

Two clearly-separated signals in every table below:

- **DataForSEO demand** — the measured columns (volume/CPC/competition/intent). *Google.*
- **Pinterest relevance** — an editorial `High / Med / Low` on how naturally the phrase fits Pinterest
  search + shopping behaviour. **No Pinterest volume is claimed** — Pinterest does not expose it via
  DataForSEO. Room-context and style phrases ("blue coastal wall art for living room",
  "minimalist landscape print") skew **High**; bare transactional terms ("buy art prints") skew **Low**
  on Pinterest even when they're strong on Google.

Pinterest craft rules applied: lead with the **visual + room + style** ("large blue coastal wall art for
living room"), not the transaction; phrases read as a **description of a saved image**; every board/pin
still links to a real product page so discovery converts.

---

## STEP 6 — Master keyword system

> Metric columns are `— (pending)` until `scripts/pinterest-keyword-research.ts` is run. Intent,
> Pinterest relevance, and Recommended use are editorial and final. `US` is shown as the default market
> column; the script produces all six so you can compare (US/UK are expected strongest for English
> art-buyer demand, DE/FR English queries thinner — confirm against the CSV).

### TIER 1 — Primary money keywords
| Keyword | Country | Volume | CPC | Competition | Intent | Pinterest relevance | Recommended use |
|---|---|---|---|---|---|---|---|
| fine art prints | US | — (pending) | — | — | A commercial | Med | Product page SEO · Board title |
| art prints | US | — (pending) | — | — | A commercial | Med | Product page SEO · Board title |
| giclee art prints | US | — (pending) | — | — | A commercial | Med | Product page SEO · Pin description |
| coastal wall art | US | — (pending) | — | — | B decor | High | Multiple |
| blue wall art | US | — (pending) | — | — | B decor | High | Multiple |
| large wall art for living room | US | — (pending) | — | — | B decor | High | Pin title · Board title |
| contemporary landscape painting | US | — (pending) | — | — | C style | Med | Product page SEO · Pin description |

### TIER 2 — Strong long-tail buyer keywords
| Keyword | Country | Volume | CPC | Competition | Intent | Pinterest relevance | Recommended use |
|---|---|---|---|---|---|---|---|
| blue coastal wall art | US | — (pending) | — | — | B decor | High | Pin title · Board title |
| large blue wall art | US | — (pending) | — | — | B decor | High | Pin title |
| modern coastal wall art | US | — (pending) | — | — | B decor | High | Pin title · Board title |
| blue art for living room | US | — (pending) | — | — | B decor | High | Pin description |
| calming landscape wall art | US | — (pending) | — | — | B decor | High | Pin title · Board description |
| neutral landscape wall art | US | — (pending) | — | — | B decor | High | Pin description |
| large landscape wall art | US | — (pending) | — | — | B decor | High | Pin title |
| ocean fine art prints | US | — (pending) | — | — | A commercial | Med-High | Product page SEO · Pin description |

### TIER 3 — Style / discovery keywords
| Keyword | Country | Volume | CPC | Competition | Intent | Pinterest relevance | Recommended use |
|---|---|---|---|---|---|---|---|
| minimalist landscape art | US | — (pending) | — | — | C style | High | Board title · Pin title |
| contemporary landscape prints | US | — (pending) | — | — | C style | Med-High | Pin description |
| modern seascape prints | US | — (pending) | — | — | C style | Med-High | Pin description |
| serene landscape art | US | — (pending) | — | — | C style | High | Board description |
| modern landscape art | US | — (pending) | — | — | C style | Med | Board title |
| blue coastal art prints | US | — (pending) | — | — | C style | Med-High | Pin description |

### TIER 4 — Supporting keywords
| Keyword | Country | Volume | CPC | Competition | Intent | Pinterest relevance | Recommended use |
|---|---|---|---|---|---|---|---|
| calming wall art | US | — (pending) | — | — | B decor | Med | Board description |
| serene wall art | US | — (pending) | — | — | B decor | Med | Board description |
| statement wall art | US | — (pending) | — | — | B decor | Med | Pin description |
| art for bedroom | US | — (pending) | — | — | B decor | Med | Board title |
| art for living room | US | — (pending) | — | — | B decor | Med | Board title |
| seascape art | US | — (pending) | — | — | C style | Med | Board description |

### Candidate shortlists (editorial priority — re-rank with the CSV)

**TOP 20 Pinterest keywords** (skewed to decor + style + room context, which is how people search
Pinterest): coastal wall art · blue wall art · blue coastal wall art · large blue wall art ·
large wall art for living room · modern coastal wall art · minimalist landscape art ·
calming landscape wall art · serene landscape art · neutral landscape wall art · large landscape wall art ·
blue art for living room · contemporary landscape prints · modern seascape prints · ocean fine art prints ·
minimalist wall art · statement wall art · art for bedroom · fine art prints · blue coastal art prints

**TOP 10 buyer-intent keywords** (A-bucket + strongest B): fine art prints · art prints ·
giclee art prints · buy art prints · large fine art prints · original paintings for sale ·
ocean fine art prints · coastal wall art · blue wall art · large wall art for living room

**TOP 10 long-tail opportunities** (specific enough to be winnable, decor-led): blue coastal wall art ·
blue coastal art prints · large blue wall art · blue art for living room · modern blue wall art ·
minimalist landscape prints · contemporary landscape prints · modern seascape prints ·
calming landscape wall art · neutral landscape wall art

---

## STEP 7 — Recommended Pinterest boards

Six focused boards (no near-duplicates). Each maps to a coherent slice of the catalogue and a clear
search cluster.

### 1. Coastal & Seascape Wall Art
- **Primary keyword:** coastal wall art
- **Secondary:** seascape art · modern coastal wall art · ocean fine art prints · blue coastal wall art
- **Description:** "Contemporary coastal and seascape wall art — luminous oceans, open horizons and
  serene shorelines as fine art prints for calm, considered interiors."
- **What goes here:** seascapes, horizons, shorelines, ocean/coast pieces (incl. *Edge of the Infinite*).

### 2. Blue Wall Art & Interiors
- **Primary keyword:** blue wall art
- **Secondary:** blue art for living room · large blue wall art · modern blue wall art · blue coastal art prints
- **Description:** "Blue wall art for living rooms and calm spaces — deep ocean blues and soft skies in
  contemporary fine art prints that anchor a room without shouting."
- **What goes here:** any blue-dominant work, shown large and in-room.

### 3. Minimalist & Contemporary Landscape Art
- **Primary keyword:** minimalist landscape art
- **Secondary:** contemporary landscape prints · modern landscape art · serene landscape art · minimalist landscape prints
- **Description:** "Minimalist and contemporary landscape art — quiet horizons and pared-back
  compositions as museum-quality fine art prints for modern interiors."
- **What goes here:** landscapes with restraint/negative space, horizon-led compositions.

### 4. Calm & Serene Wall Art (Bedroom & Restful Spaces)
- **Primary keyword:** calming wall art
- **Secondary:** serene wall art · calming landscape wall art · neutral landscape wall art · art for bedroom
- **Description:** "Calming, serene wall art for bedrooms and restful rooms — soft, atmospheric fine art
  prints in neutral and blue tones that make a space exhale."
- **What goes here:** low-contrast, atmospheric, neutral/soft pieces; bedroom mockups.

### 5. Large Statement Wall Art
- **Primary keyword:** large wall art for living room
- **Secondary:** large landscape wall art · statement wall art · large blue wall art · modern wall art
- **Description:** "Large-format statement wall art for living rooms — expansive contemporary fine art
  prints that hold a wall and set the mood of the room."
- **What goes here:** the same works, staged BIG over a sofa/console; scale-led mockups.

### 6. Fine Art Prints by Ani Muradyan (signature / shop board)
- **Primary keyword:** fine art prints
- **Secondary:** giclee art prints · contemporary art prints · original paintings for sale · ocean fine art prints
- **Description:** "Contemporary fine art prints by painter Ani Muradyan — giclée reproductions of
  original oil landscapes and seascapes, printed to order on archival paper. Originals also available."
- **What goes here:** the full catalogue; the brand/shop hub board. Link pins to product pages.

---

## STEP 8 — "Edge of the Infinite" — Pinterest keyword strategy

**Artwork:** *Edge of the Infinite* — contemporary coastal/seascape landscape; luminous blue ocean,
white cliffs, an expansive horizon. **Themes:** freedom · calm · inner strength · openness · infinite
possibility. **Product:** fine art print.

**Strongest relevant keywords for this piece** (from the seed/long-tail universe; validate volumes in
the CSV): `blue coastal wall art` · `coastal wall art` · `large blue wall art` · `modern coastal wall art`
· `serene landscape art` · `calming landscape wall art` · `ocean fine art prints` · `contemporary
seascape` · `blue art for living room`.

**Destination for every pin below:** the *Edge of the Infinite* fine-art **print product page**
(`/prints/<edge-of-the-infinite-slug>` — confirm the live slug before scheduling; do not link to the
gallery image or any master file). Titles/descriptions are written to read as premium and natural — not
keyword-stuffed.

### Pin 1 — The full artwork (hero)
1. **Title:** Edge of the Infinite — Contemporary Blue Coastal Fine Art Print
2. **Description:** A luminous blue horizon where the ocean meets white cliffs — *Edge of the Infinite*
   is a contemporary coastal fine art print about openness and calm. Museum-quality giclée, printed to
   order. Bring an expansive, serene view into your space.
3. **Primary keyword:** blue coastal wall art
4. **Secondary:** coastal wall art · ocean fine art prints · serene landscape art
5. **Board:** Coastal & Seascape Wall Art
6. **Image concept:** Full artwork, vertical 2:3, edge-to-edge, no text overlay (let the horizon breathe).
7. **Destination:** Edge of the Infinite print product page.

### Pin 2 — Living-room interior mockup (large, in-room)
1. **Title:** Large Blue Coastal Wall Art for a Calm Living Room
2. **Description:** *Edge of the Infinite* over the sofa — a large blue coastal print that opens up a
   living room and keeps it calm. Contemporary seascape art on archival paper, printed to order in the
   size your wall needs.
3. **Primary keyword:** large blue wall art
4. **Secondary:** large wall art for living room · blue art for living room · modern coastal wall art
5. **Board:** Large Statement Wall Art
6. **Image concept:** Interior mockup — the print framed large above a neutral sofa; scale obvious.
7. **Destination:** Edge of the Infinite print product page.

### Pin 3 — Close-up / detail (craft + texture)
1. **Title:** The Light on the Water — Detail of a Contemporary Seascape Print
2. **Description:** A closer look at *Edge of the Infinite*: the luminous blues and soft light where sea
   meets sky. Giclée fine art print with true colour depth on archival paper — the calm is in the detail.
3. **Primary keyword:** ocean fine art prints
4. **Secondary:** contemporary seascape · giclee art prints · serene landscape art
5. **Board:** Fine Art Prints by Ani Muradyan
6. **Image concept:** Close-up crop of the horizon/water; texture and colour transitions visible.
7. **Destination:** Edge of the Infinite print product page.

### Pin 4 — Bedroom / calm-space mockup (mood-led)
1. **Title:** Serene Blue Wall Art for a Restful Bedroom
2. **Description:** A quiet, open horizon to wake up to. *Edge of the Infinite* brings calm and a sense of
   space to a bedroom — soft blues, an endless view, printed to order as a contemporary fine art print.
3. **Primary keyword:** calming landscape wall art
4. **Secondary:** serene wall art · blue wall art · art for bedroom
5. **Board:** Calm & Serene Wall Art (Bedroom & Restful Spaces)
6. **Image concept:** Interior mockup — framed above a bed; muted, restful styling.
7. **Destination:** Edge of the Infinite print product page.

### Pin 5 — Vertical crop + story (freedom / openness angle)
1. **Title:** Where the Horizon Opens — A Contemporary Coastal Landscape
2. **Description:** *Edge of the Infinite* is about openness — the moment the horizon stops being a limit.
   A contemporary coastal landscape in luminous blue, as a fine art print for a space that should feel
   free and unhurried.
3. **Primary keyword:** modern coastal wall art
4. **Secondary:** contemporary landscape prints · minimalist landscape art · coastal wall art
5. **Board:** Minimalist & Contemporary Landscape Art
6. **Image concept:** Tall vertical crop (2:3+) emphasising sky/horizon/openness; a slim, elegant title
   caption only if used — otherwise none.
7. **Destination:** Edge of the Infinite print product page.

---

## STEP 9 — Files

- [`research/pinterest-keywords.md`](./pinterest-keywords.md) — this strategy (editorial complete; metrics pending).
- [`research/pinterest-keywords.csv`](./pinterest-keywords.csv) — raw keyword dataset; **populated by the
  script** (`scripts/pinterest-keyword-research.ts`). Currently a header + the candidate keyword universe
  with blank metric columns until the live pull runs.
- [`scripts/pinterest-keyword-research.ts`](../scripts/pinterest-keyword-research.ts) — the runnable
  DataForSEO pull.

## J. Limitations

1. **No live metrics yet** — credentials are not in this environment; the client fails closed. All
   volume/CPC/competition cells are `— (pending)` and no numbers were invented. Run the script in Replit.
2. **DataForSEO = Google, not Pinterest** — treat the numbers as evidence of real demand, not as
   Pinterest volume. Pinterest relevance here is editorial craft.
3. **`competition` is ad-auction, not organic difficulty**; `keyword_difficulty` from `keyword_overview`
   is unreliable and is not reported. For true organic difficulty use `bulk_keyword_difficulty` (extra
   cost, not run).
4. **Non-US English markets (DE/FR especially)** likely return thin/absent English art-buyer volume —
   confirm per-market in the CSV before investing there; US/UK/CA/AU are the realistic English targets.
5. **Tier rankings are editorial** until reconciled with the CSV — they encode intent/Pinterest judgment,
   not measured priority.
6. **`Edge of the Infinite` product slug** must be confirmed against the live site before scheduling pins.
