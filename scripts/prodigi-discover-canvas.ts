/**
 * PRODIGI CANVAS DISCOVERY — verifies the REAL GLOBAL-CAN (stretched canvas) SKUs we can sell.
 *
 * Our architecture requires VERIFIED SKU + print-area PIXEL dimensions + the exact wrap attribute
 * before a product can be sold. This script asks the sandbox `GET /v4.0/products/{sku}` for each
 * candidate canvas SKU and prints everything a launch row needs: exact SKU · physical dimensions ·
 * required print areas · recommended print-area PIXELS · required attributes · WRAP options · the
 * countries it ships to · sandbox validity. It then runs a real `/v4.0/quotes` to Germany (with the
 * chosen default wrap) so we know the SKU is quotable. Finally it emits a paste-ready launch row.
 *
 * NOTHING is invented: only SKUs the sandbox confirms are reported. Paste the output back and the
 * verified rows go into CANVAS_LAUNCH_PRODUCTS.
 *
 * SAFETY (identical to verify-prodigi-sandbox.ts):
 *   • Never prints, logs or returns the API key — only mode/configured booleans.
 *   • REFUSES to run against LIVE (aborts if PRODIGI_API_KEY is set / mode is 'live').
 *   • Fails closed with no key (prints the reason, makes no network call).
 *
 * RUN (key stays out of chat + git — read from the Replit secret / environment):
 *   • In Replit shell:  npm run prodigi:discover-canvas
 *   • Custom candidates:  PRODIGI_CANVAS_SKUS=GLOBAL-CAN-16X20,GLOBAL-CAN-20X30 npm run prodigi:discover-canvas
 *   • Different quote destination:  PRODIGI_QUOTE_COUNTRY=US npm run prodigi:discover-canvas
 */

import { prodigi, prodigiMode, prodigiConfigured, ProdigiApiError } from "../server/commerce/prodigi/prodigiClient";
import { DEFAULT_CANVAS_WRAP } from "../shared/commerce/prodigiProducts";
import { quotePrintShipping } from "../server/commerce/prints/printShipping";

// Real, documented candidate GLOBAL-CAN sizes to PROBE — the API decides which are valid. These
// deliberately OVERLAP the German Etching ladder (12×16 / 16×20 / 18×24) plus a couple of canvas-
// typical sizes, so canvas and paper share sizes and our per-variant crop system lines up.
const DEFAULT_CANDIDATES = [
  "GLOBAL-CAN-10X10", "GLOBAL-CAN-12X12", "GLOBAL-CAN-16X16",
  "GLOBAL-CAN-12X16", "GLOBAL-CAN-16X20", "GLOBAL-CAN-18X24",
  "GLOBAL-CAN-20X30", "GLOBAL-CAN-24X36",
  "GLOBAL-CAN-A3", "GLOBAL-CAN-A2",
];

function line(s = "") { process.stdout.write(s + "\n"); }
function apiErr(e: unknown): string {
  if (e instanceof ProdigiApiError) return `HTTP ${e.statusCode} ${e.statusText}` + (e.body ? ` :: ${JSON.stringify(e.body).slice(0, 300)}` : "");
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

/** Pull the wrap attribute options from a product's attribute map, whatever key casing Prodigi uses. */
function wrapOptions(attributes: Record<string, string[]> | undefined): { key: string; values: string[] } | null {
  if (!attributes) return null;
  const key = Object.keys(attributes).find((k) => k.toLowerCase() === "wrap");
  return key ? { key, values: attributes[key] } : null;
}

async function main() {
  line("=== Prodigi canvas discovery (GLOBAL-CAN · our client vs the real sandbox) ===");
  const mode = prodigiMode();
  line(`config: mode=${mode} · configured=${prodigiConfigured()} · liveKeyPresent=${Boolean(process.env.PRODIGI_API_KEY?.trim())}`);
  if (!prodigiConfigured()) {
    line("RESULT: no key detected — fails closed, no network call. Set PRODIGI_SANDBOX_API_KEY and re-run.");
    return;
  }
  if (mode === "live") {
    line("REFUSING to run: mode is LIVE (PRODIGI_API_KEY is set). Unset it so only the sandbox key is used.");
    process.exitCode = 1;
    return;
  }
  line("");

  const candidates = process.env.PRODIGI_CANVAS_SKUS?.split(",").map((s) => s.trim()).filter(Boolean) ?? DEFAULT_CANDIDATES;
  line(`--- product probe (${candidates.length} candidate canvas SKUs) ---`);

  const valid: Array<{ sku: string; widthPx: number | null; heightPx: number | null; wrap: { key: string; values: string[] } | null; shipsTo: string[] }> = [];

  for (const sku of candidates) {
    try {
      const { product } = await prodigi.getProduct(sku);
      const v0 = product.variants?.[0];
      // Print areas are keyed by name ("default"); take the default area's recommended pixel size.
      const areas = v0?.printAreaSizes ?? {};
      const areaNames = Object.keys(areas);
      const defaultArea = areas["default"] ?? (areaNames.length ? areas[areaNames[0]] : undefined);
      const wrap = wrapOptions(product.attributes);
      const shipsTo = v0?.shipsTo ?? [];

      line(`VALID   ${sku} :: ${product.description ?? ""}`);
      if (product.productDimensions) line(`          physical: ${JSON.stringify(product.productDimensions)}`);
      line(`          print areas: [${areaNames.join(", ") || "?"}]`);
      if (defaultArea) line(`          default print-area PIXELS: ${defaultArea.horizontalResolution} × ${defaultArea.verticalResolution}`);
      line(`          wrap options: ${wrap ? `${wrap.key} = [${wrap.values.join(", ")}]` : "NONE returned (confirm wrap handling!)"}`);
      if (product.attributes && Object.keys(product.attributes).length) line(`          ALL attributes: ${JSON.stringify(product.attributes)}`);
      line(`          shipsTo(${shipsTo.length}): ${shipsTo.slice(0, 12).join(", ")}${shipsTo.length > 12 ? " …" : ""}`);
      line(`          variantCount: ${product.variants?.length ?? 0}`);

      valid.push({
        sku,
        widthPx: defaultArea?.horizontalResolution ?? null,
        heightPx: defaultArea?.verticalResolution ?? null,
        wrap,
        shipsTo,
      });
    } catch (e) {
      line(`INVALID ${sku} :: ${apiErr(e)}`);
    }
  }
  line("");
  if (!valid.length) {
    line("RESULT: no valid canvas SKUs found — adjust PRODIGI_CANVAS_SKUS with real GLOBAL-CAN SKUs.");
    return;
  }

  // ── WRAP audit + default check ──
  line("--- wrap audit ---");
  const chosen = DEFAULT_CANVAS_WRAP;
  const wrapSupported = valid.every((v) => v.wrap?.values.some((w) => w.toLowerCase() === chosen.toLowerCase()));
  line(`Chosen default wrap (code): "${chosen}"`);
  line(wrapSupported
    ? `✅ every valid SKU offers "${chosen}".`
    : `⚠️  at least one SKU does NOT list "${chosen}" — reconcile DEFAULT_CANVAS_WRAP with the values above.`);
  line("");

  // ── QUOTE the first valid SKU to Germany WITH the wrap attribute (proves it is orderable + quotable) ──
  const country = process.env.PRODIGI_QUOTE_COUNTRY?.trim().toUpperCase() || "DE";
  const testSku = valid[0].sku;
  const wrapAttr = valid[0].wrap
    ? { [valid[0].wrap.key]: (valid[0].wrap.values.find((w) => w.toLowerCase() === chosen.toLowerCase()) ?? valid[0].wrap.values[0]) }
    : undefined;
  line(`--- quote ${testSku} → ${country} (wrap: ${wrapAttr ? JSON.stringify(wrapAttr) : "none"}) ---`);
  const quote = await quotePrintShipping({
    prodigiSku: testSku, copies: 1, country, currency: "EUR",
    ...(wrapAttr ? { attributes: wrapAttr } : {}),
  });
  if (quote.ok) {
    line(`QUOTE ok · production=${quote.itemsMinor != null ? (quote.itemsMinor / 100).toFixed(2) : "—"} · shipping=${(quote.shippingMinor / 100).toFixed(2)} · ${quote.currency} · method=${quote.method}`);
  } else {
    line(`QUOTE unavailable · reason=${quote.reason}${quote.status ? ` · status=${quote.status}` : ""}${quote.outcome ? ` · outcome=${quote.outcome}` : ""}${quote.detail ? ` · ${quote.detail}` : ""}`);
  }
  line("");

  // ── PASTE-READY launch rows (fill widthCm/heightCm from the physical dimensions above) ──
  line("--- paste-ready CANVAS_LAUNCH_PRODUCTS rows (verify widthCm/heightCm/displayName by hand) ---");
  for (const v of valid) {
    line(`  { sku: "${v.sku}", material: "stretched-canvas", paperType: "CAN", substrateGsm: 0, displayName: "TODO", friendlyLabel: "TODO", widthCm: 0, heightCm: 0, printAreaWidthPx: ${v.widthPx ?? "TODO"}, printAreaHeightPx: ${v.heightPx ?? "TODO"}, activeForLaunch: true, offeredForNewVariants: true, requiredAttributes: { wrap: DEFAULT_CANVAS_WRAP } },`);
  }
  line("");
  line("=== done ===");
}

main().catch((e) => {
  line(`FATAL :: ${apiErr(e)}`);
  process.exitCode = 1;
});
