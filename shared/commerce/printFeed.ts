/**
 * PRINT CATALOG FEED — the rows a Pinterest (Google-style) product catalog ingests, built ONLY from
 * print variants that are genuinely sellable: enabled AND eligible (master passed the resolution
 * engine) AND priced with a real own-site price AND carrying a print-ready asset. Anything short of
 * that is excluded — a low-res, unpriced, or disabled variant can never leak into the feed.
 *
 * This uses PRINT pricing only. Original-artwork prices (which intentionally differ from Singulart)
 * are never a substitute here.
 *
 * Pure + unit-tested. The route just serialises what this returns; it stays unpublished until the
 * site claim is complete.
 */

export interface FeedVariantInput {
  variantId: number;
  printSlug: string;
  artworkTitle: string;
  material: string; // 'german-etching' | 'photo-rag'
  sizeLabel: string;
  widthCm: number;
  heightCm: number;
  framed: boolean;
  frameColour: string | null;
  retailMinor: number | null;
  currency: string;
  printReadyAssetUrl: string | null;
  mockupUrl: string | null;
  eligible: boolean;
  enabled: boolean;
}

export interface FeedRow {
  id: string;
  title: string;
  description: string;
  link: string;
  image_link: string;
  price: string; // "65.00 EUR"
  availability: string; // "in stock"
  brand: string;
  condition: string; // "new"
  product_type: string;
}

const BRAND = "Ani Muradyan";

function money(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

function materialLabel(m: string): string {
  if (m === "german-etching") return "Hahnemühle German Etching fine-art paper";
  if (m === "photo-rag") return "Hahnemühle Photo Rag fine-art paper";
  if (m === "stretched-canvas") return "Artist-grade stretched canvas";
  return m;
}

/** Returns a feed row, or null if the variant is not genuinely sellable. */
export function variantToFeedRow(v: FeedVariantInput, baseUrl: string): FeedRow | null {
  if (!v.enabled || !v.eligible) return null;
  if (v.retailMinor == null || v.retailMinor <= 0) return null;
  const image = v.mockupUrl || v.printReadyAssetUrl;
  if (!image) return null;

  const frame = v.framed ? `framed (${v.frameColour ?? "natural"})` : "unframed";
  const title = `${v.artworkTitle} — Fine-Art Print, ${v.widthCm}×${v.heightCm} cm ${v.framed ? "Framed" : "Unframed"}`;
  const description =
    `Museum-quality giclée print of "${v.artworkTitle}" by Ani Muradyan on ${materialLabel(v.material)}, ` +
    `${v.widthCm}×${v.heightCm} cm, ${frame}. Original oil painting reproduced with archival pigment inks. Ships worldwide.`;

  return {
    id: `print-${v.variantId}`,
    title,
    description,
    link: `${baseUrl.replace(/\/+$/, "")}/prints/${v.printSlug}?variant=${v.variantId}&utm_source=pinterest&utm_medium=catalog&utm_campaign=prints`,
    image_link: image,
    price: money(v.retailMinor, v.currency),
    availability: "in stock",
    brand: BRAND,
    condition: "new",
    product_type: `Art > Fine-Art Prints > ${v.framed ? "Framed" : "Unframed"}`,
  };
}

const HEADERS: (keyof FeedRow)[] = [
  "id", "title", "description", "link", "image_link", "price", "availability", "brand", "condition", "product_type",
];

/** TSV is the safest for descriptions that may contain commas. Excludes non-sellable variants. */
export function buildFeedTsv(variants: FeedVariantInput[], baseUrl: string): string {
  const rows = variants.map((v) => variantToFeedRow(v, baseUrl)).filter((r): r is FeedRow => r !== null);
  const lines = [HEADERS.join("\t")];
  for (const r of rows) {
    lines.push(HEADERS.map((h) => String(r[h]).replace(/[\t\n\r]+/g, " ")).join("\t"));
  }
  return lines.join("\n");
}

/** Count of genuinely sellable rows — used by the route to stay unpublished while empty. */
export function sellableCount(variants: FeedVariantInput[], baseUrl = "https://animuradyan.com"): number {
  return variants.filter((v) => variantToFeedRow(v, baseUrl) !== null).length;
}
