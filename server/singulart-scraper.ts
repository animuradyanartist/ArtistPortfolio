import * as cheerio from "cheerio";

/**
 * Singulart artist-gallery HTML scraper.
 *
 * SELECTORS — derived from the saved fixtures (test/fixtures/singulart-page-*.html).
 * Singulart renders the artist gallery server-side as a grid of <article> cards.
 * Each card carries machine-readable attributes that are far more stable than
 * the rendered text. If Singulart restructures the markup, the unit tests in
 * test/singulart-scraper.test.ts will fail loudly — update the selectors here.
 *
 * Card wrapper       : ".artworks-grid article.artwork-item"
 *                      (scoped to ".artworks-grid" to exclude
 *                       cross-sell / related-artwork carousels elsewhere on the page)
 * Artwork id         : article[data-id="…"]  (e.g. "2520872")
 * Current price (USD): article[data-price="…"]  (numeric, post-discount)
 * Detail link + slug : a.artwork-item__link[href^="/en/artworks/…"]
 * Title              : h3.js-artwork-title  (fallback: article[title])
 * Medium + dimensions: p.body--m.text--tertiary  (e.g. "Oil on Canvas<br>39x31in")
 *                      Dimensions are shown in inches; we convert to cm.
 * Image              : img.artwork-item__img[src] (fallback: data-src)
 *
 * NOTE: Singulart shows dimensions in inches only on the listing page. We
 * convert to cm (1 in = 2.54 cm) and round to the nearest integer.
 */

export type ScrapedArtwork = {
  id: string;
  slug: string;
  title: string;
  priceUsd: number | null;
  widthCm: number | null;
  heightCm: number | null;
  medium: string | null;
  imageUrl: string;
  singulartUrl: string;
};

const BASE = "https://www.singulart.com";

const CARD_SELECTOR = ".artworks-grid article.artwork-item";
const LINK_SELECTOR = "a.artwork-item__link";
const TITLE_SELECTOR = "h3.js-artwork-title";
const MEDIUM_DIM_SELECTOR = "p.body--m.text--tertiary";
const IMG_SELECTOR = "img.artwork-item__img";

const IN_TO_CM = 2.54;

function inchesToCm(inches: number): number {
  // Singulart's listing cards only expose inch dimensions; rounded conversion is
  // the best we can do without hitting each detail page.
  return Math.round(inches * IN_TO_CM);
}

// Listing thumbnails are served from the ".../main/base/" path (~453px wide).
// The ".../main/zoom/" variant is the full-resolution image (~1500px wide) and
// shares the exact same filename — so we just swap the size segment. Other
// segment names (large/max/original) return 403; "zoom" is the largest public one.
export function toHighResImage(url: string): string {
  return url.replace(/\/main\/(?:base|carousel|small|medium|thumbnail)\//, "/main/zoom/");
}

export function parseSingulartPage(html: string): ScrapedArtwork[] {
  const $ = cheerio.load(html);
  const results: ScrapedArtwork[] = [];

  $(CARD_SELECTOR).each((_, el) => {
    const $card = $(el);

    // id — required
    const id = ($card.attr("data-id") || "").trim();
    if (!id) {
      console.warn("Singulart scraper: skipping card — missing id");
      return;
    }

    // link + slug — required
    const link = $card.find(LINK_SELECTOR).first();
    const href = (link.attr("href") || "").trim();
    if (!href) {
      console.warn(`Singulart scraper: skipping card — missing href (id ${id})`);
      return;
    }
    const slug = href.replace(/^\/en\/artworks\//, "").replace(/\/$/, "");

    // title — required
    const title = (
      $card.find(TITLE_SELECTOR).first().text() ||
      $card.attr("title") ||
      link.attr("title") ||
      ""
    ).trim();
    if (!title) {
      console.warn(`Singulart scraper: skipping card — missing title (id ${id}, slug ${slug})`);
      return;
    }

    // image — required
    const img = $card.find(IMG_SELECTOR).first();
    const imageUrl = toHighResImage(
      (img.attr("src") || img.attr("data-src") || "").trim()
    );
    if (!imageUrl) {
      console.warn(`Singulart scraper: skipping card — missing imageUrl (id ${id}, slug ${slug})`);
      return;
    }

    const singulartUrl = href.startsWith("http") ? href : BASE + href;

    // price — nullable
    // Prefer data-price (numeric), then fall back to the visible price text.
    let priceUsd: number | null = null;
    const dataPrice = $card.attr("data-price");
    if (dataPrice) {
      const n = Number(dataPrice.replace(/[^\d.]/g, ""));
      if (Number.isFinite(n) && n > 0) priceUsd = Math.round(n);
    }
    if (priceUsd === null) {
      const priceText = $card.find("[data-testid='product-price'] .price").first().text();
      const m = priceText.match(/\$\s*([\d,]+)/);
      if (m) {
        const n = Number(m[1].replace(/,/g, ""));
        if (Number.isFinite(n) && n > 0) priceUsd = n;
      }
    }
    if (priceUsd === null) {
      console.warn(`Singulart scraper: priceUsd unparseable for artwork ${id} (${slug})`);
    }

    // medium + dimensions — nullable
    // The medium-and-dimensions paragraph looks like:
    //   "Oil on Canvas<br>39x31in"
    let medium: string | null = null;
    let widthCm: number | null = null;
    let heightCm: number | null = null;

    const mediumDimHtml = $card.find(MEDIUM_DIM_SELECTOR).first().html() || "";
    if (mediumDimHtml) {
      // Split on <br> tags to separate medium from dimensions.
      const parts = mediumDimHtml
        .split(/<br\s*\/?\s*>/i)
        .map((s) => s.replace(/<[^>]+>/g, "").trim())
        .filter(Boolean);

      for (const part of parts) {
        const inMatch = part.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*in/i);
        const cmMatch = part.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*cm/i);
        if (cmMatch) {
          widthCm = Math.round(Number(cmMatch[1]));
          heightCm = Math.round(Number(cmMatch[2]));
        } else if (inMatch) {
          widthCm = inchesToCm(Number(inMatch[1]));
          heightCm = inchesToCm(Number(inMatch[2]));
        } else if (!medium) {
          medium = part;
        }
      }
    }

    if (medium === null) {
      console.warn(`Singulart scraper: medium unparseable for artwork ${id} (${slug})`);
    }
    if (widthCm === null || heightCm === null) {
      console.warn(`Singulart scraper: dimensions unparseable for artwork ${id} (${slug})`);
    }

    results.push({
      id,
      slug,
      title,
      priceUsd,
      widthCm,
      heightCm,
      medium,
      imageUrl,
      singulartUrl,
    });
  });

  return results;
}

// Singulart returns 403 to bare bot UAs — a realistic browser UA + Accept headers is required.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function fetchSingulartPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) {
    throw new Error(`Singulart fetch failed: ${res.status} ${res.statusText} for ${url}`);
  }
  return res.text();
}

export async function scrapeAllArtworks(baseUrl: string): Promise<ScrapedArtwork[]> {
  const page1 = await fetchSingulartPage(baseUrl);
  await new Promise((r) => setTimeout(r, 1000)); // politeness
  const page2 = await fetchSingulartPage(`${baseUrl}?page=2`);
  const all = [...parseSingulartPage(page1), ...parseSingulartPage(page2)];

  // Deduplicate by id (in case a card appears on both pages somehow).
  const seen = new Map<string, ScrapedArtwork>();
  for (const a of all) seen.set(a.id, a);

  if (seen.size === 0) {
    throw new Error(
      `Singulart scrape returned zero artworks for ${baseUrl} — likely a structural change in their markup; aborting`
    );
  }

  return Array.from(seen.values());
}
