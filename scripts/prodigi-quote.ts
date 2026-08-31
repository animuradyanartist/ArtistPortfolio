/**
 * PRODIGI QUOTE PROBE — a manual, server-side diagnostic for the admin cost/margin estimator.
 *
 * It runs the EXACT production path the admin route uses (`quotePrintShipping` → the real `prodigi`
 * client → POST /v4.0/quotes), so a green run here proves the deployed estimator will price. It prints
 * SKU / destination / production / shipping / total / currency, or a clear, categorised error — and it
 * NEVER prints the API key (only the mode: sandbox | live | unconfigured).
 *
 * RUN (key stays out of chat + git — read from the environment / Replit Secret):
 *   • In Replit shell (secret already present):  npm run prodigi:quote -- GLOBAL-HGE-A3 DE
 *   • Locally:  PRODIGI_SANDBOX_API_KEY=xxx npm run prodigi:quote -- GLOBAL-HGE-A3 DE
 *   • Args:  npm run prodigi:quote -- <SKU> <COUNTRY> [CURRENCY] [COPIES]   (defaults: DE, EUR, 1)
 *
 * With no key it fails closed (prints the reason, makes no network call).
 */

import { prodigi, prodigiMode, prodigiConfigured, ProdigiApiError } from "../server/commerce/prodigi/prodigiClient";
import { quotePrintShipping, adminQuoteDiagnostic, selectShipping, buildPrintQuoteRequest } from "../server/commerce/prints/printShipping";
import { requiredAttributesForSku } from "../shared/commerce/prodigiProducts";

function line(s = "") { process.stdout.write(s + "\n"); }
function money(minor: number | null | undefined, currency: string): string {
  return minor == null ? "—" : `${(minor / 100).toFixed(2)} ${currency}`;
}

async function main() {
  const [sku, countryArg, currencyArg, copiesArg] = process.argv.slice(2);
  const country = (countryArg ?? "DE").trim().toUpperCase();
  const currency = (currencyArg ?? "EUR").trim().toUpperCase();
  const copies = Math.max(1, Number(copiesArg ?? "1") || 1);

  line("=== Prodigi quote probe (production path: quotePrintShipping → /v4.0/quotes) ===");
  line(`config: mode=${prodigiMode()} · configured=${prodigiConfigured()}`);
  if (!sku) {
    line("USAGE: npm run prodigi:quote -- <SKU> <COUNTRY> [CURRENCY] [COPIES]");
    line("   e.g. npm run prodigi:quote -- GLOBAL-HGE-A3 DE EUR 1");
    process.exitCode = 1;
    return;
  }
  // Catalogue-required attributes come from the SKU (canvas → { wrap: "MirrorWrap" }); paper → none.
  // This is the SAME merge the admin estimator + checkout use, so the probe quotes the REAL product.
  const attributes = requiredAttributesForSku(sku);
  const quoteInput = { prodigiSku: sku, copies, country, currency, ...(Object.keys(attributes).length ? { attributes } : {}) };
  line(`request: sku=${sku} · destination=${country} · currency=${currency} · copies=${copies} · attributes=${JSON.stringify(attributes)}`);
  // Show the exact request body the client will send (proves destinationCountryCode / assets / copies / wrap).
  line(`body:    ${JSON.stringify(buildPrintQuoteRequest(quoteInput))}`);
  line("");

  if (!prodigiConfigured()) {
    line("RESULT: no Prodigi key detected — fails closed, no network call made.");
    line("        Set PRODIGI_SANDBOX_API_KEY (or PRODIGI_API_KEY for live) and re-run.");
    return;
  }

  // 1) Raw quote (transparency: prints Prodigi's own `outcome` string + each quote's costs).
  try {
    const raw = await prodigi.getQuote(buildPrintQuoteRequest(quoteInput));
    line(`RAW  outcome=${raw.outcome} · quotes=${(raw.quotes ?? []).length}`);
    for (const q of raw.quotes ?? []) {
      line(`     method=${q.shipmentMethod} · items=${JSON.stringify(q.costSummary?.items)} · shipping=${JSON.stringify(q.costSummary?.shipping)}`);
    }
    const picked = selectShipping(raw, "standard");
    line(`     selectShipping => ${picked ? JSON.stringify(picked) : "null (no usable quote)"}`);
  } catch (e) {
    if (e instanceof ProdigiApiError) {
      line(`RAW  HTTP ${e.statusCode} ${e.statusText}` + (e.body ? ` :: ${JSON.stringify(e.body).slice(0, 300)}` : ""));
    } else {
      line(`RAW  error :: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
    }
  }
  line("");

  // 2) The parsed production-path result — exactly what the admin route consumes.
  const result = await quotePrintShipping(quoteInput);
  if (result.ok) {
    const total = (result.itemsMinor ?? 0) + result.shippingMinor;
    line("RESULT: PRICED ✅");
    line(`  SKU          ${sku}`);
    line(`  Destination  ${country}`);
    line(`  Shipping     ${money(result.shippingMinor, result.currency)}  (method: ${result.method})`);
    line(`  Production   ${money(result.itemsMinor, result.currency)}`);
    line(`  Total (Prodigi cost)  ${money(total, result.currency)}`);
    line(`  Currency     ${result.currency}`);
  } else {
    const diag = adminQuoteDiagnostic(result);
    line("RESULT: UNAVAILABLE ❌");
    line(`  reason  ${result.reason}`);
    line(`  code    ${diag.code}`);
    line(`  detail  ${diag.message}`);
    process.exitCode = 1;
  }
  line("=== done ===");
}

main().catch((e) => {
  line(`FATAL :: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
  process.exitCode = 1;
});
