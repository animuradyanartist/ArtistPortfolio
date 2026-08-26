/**
 * PRODIGI SANDBOX VERIFICATION — reconciles OUR client/types/builders against the REAL sandbox API.
 *
 * It exercises the actual `prodigi` client, `buildProdigiOrderRequest`, `mapProdigiStatus` and
 * `extractTracking` we ship — so a green run means our integration matches reality, not a mock.
 *
 * SAFETY:
 *   • Never prints, logs, or returns the API key. It only reports mode/configured booleans.
 *   • REFUSES to run against LIVE (aborts if PRODIGI_API_KEY is set / mode is 'live').
 *   • Fails closed with no key (prints the reason, makes no network call).
 *   • The test ORDER is OFF by default — pass `--order` to place ONE sandbox order (sandbox does
 *     not charge). It is cancelled again immediately afterwards.
 *
 * RUN (key stays out of chat + out of git — read from the environment):
 *   • In Replit shell (secret already present):  npx tsx scripts/verify-prodigi-sandbox.ts
 *   • Locally:  PRODIGI_SANDBOX_API_KEY=xxx npx tsx scripts/verify-prodigi-sandbox.ts
 *   • Add a test order:  … npx tsx scripts/verify-prodigi-sandbox.ts --order
 *   • Custom SKUs:  PRODIGI_SKUS=GLOBAL-HGE-A3,GLOBAL-FAP-16X24 npx tsx scripts/verify-prodigi-sandbox.ts
 */

import { prodigi, prodigiMode, prodigiConfigured, ProdigiApiError } from "../server/commerce/prodigi/prodigiClient";
import { buildProdigiOrderRequest, mapProdigiStatus, extractTracking } from "../server/commerce/prodigi/printFulfilment";

// Real, documented candidate SKUs to PROBE (not product data — the API decides which are valid).
// Hahnemühle German Etching (HGE / GLOBAL-HGE) is our schema's `german-etching` material.
// Enhanced Matte Art (GLOBAL-FAP) is a widely-used global fine-art paper.
// Photo Rag candidates (GLOBAL-HPR / GLOBAL-PR) are UNCONFIRMED prefixes — the probe confirms/denies.
const DEFAULT_CANDIDATES = [
  "GLOBAL-HGE-12X16", "GLOBAL-HGE-16X20", "GLOBAL-HGE-18X24", "GLOBAL-HGE-A3", "GLOBAL-HGE-A2",
  "GLOBAL-FAP-16X24", "GLOBAL-FAP-18X24", "GLOBAL-FAP-A2",
  "GLOBAL-HPR-16X20", "GLOBAL-HPR-A3", "GLOBAL-PR-16X20",
];

// A neutral, publicly-hosted placeholder image for the sandbox order asset (sandbox only; no real
// print is produced). Overridable so a real print-ready sample can be used when available.
const SAMPLE_ASSET_URL =
  process.env.PRODIGI_SAMPLE_ASSET_URL?.trim() ||
  "https://pdf.prodigi.com/samples/prodigi-print-sample.png";

function line(s = "") { process.stdout.write(s + "\n"); }
function apiErr(e: unknown): string {
  if (e instanceof ProdigiApiError) return `HTTP ${e.statusCode} ${e.statusText}` + (e.body ? ` :: ${JSON.stringify(e.body).slice(0, 300)}` : "");
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

async function main() {
  line("=== Prodigi sandbox verification (our client vs the real API) ===");

  // 1) CONFIG / KEY DETECTION — booleans only, never the value.
  const mode = prodigiMode();
  line(`config: mode=${mode} · configured=${prodigiConfigured()} · liveKeyPresent=${Boolean(process.env.PRODIGI_API_KEY?.trim())}`);
  if (!prodigiConfigured()) {
    line("RESULT: no key detected — fails closed, no network call made. Set PRODIGI_SANDBOX_API_KEY and re-run.");
    return;
  }
  if (mode === "live") {
    line("REFUSING to run: mode is LIVE (PRODIGI_API_KEY is set). Unset it so only the sandbox key is used.");
    process.exitCode = 1;
    return;
  }
  line("");

  // 2) PRODUCT / SKU VALIDATION via GET /v4.0/products/{sku}
  const candidates = process.env.PRODIGI_SKUS?.split(",").map((s) => s.trim()).filter(Boolean) ?? DEFAULT_CANDIDATES;
  line(`--- product probe (${candidates.length} candidate SKUs) ---`);
  const valid: string[] = [];
  for (const sku of candidates) {
    try {
      const { product } = await prodigi.getProduct(sku);
      valid.push(sku);
      line(`VALID   ${sku} :: ${product.description ?? ""}`);
      if (product.productDimensions) line(`          dimensions: ${JSON.stringify(product.productDimensions)}`);
      if (product.attributes && Object.keys(product.attributes).length) line(`          attributes: ${JSON.stringify(product.attributes)}`);
      const v0 = product.variants?.[0];
      if (v0) line(`          variant[0]: ${JSON.stringify({ attributes: v0.attributes, shipsTo: v0.shipsTo, printAreaSizes: v0.printAreaSizes })}`);
      line(`          variantCount: ${product.variants?.length ?? 0}`);
    } catch (e) {
      line(`INVALID ${sku} :: ${apiErr(e)}`);
    }
  }
  line("");
  if (!valid.length) {
    line("RESULT: no valid SKUs found — cannot quote or order. Adjust PRODIGI_SKUS with real SKUs.");
    return;
  }
  const testSku = valid[0];
  line(`Using ${testSku} for quote${process.argv.includes("--order") ? " + order" : ""} tests.`);
  line("");

  // 3) QUOTE FLOW (POST /v4.0/quotes) — exercises our lowercase-normalising getQuote.
  line("--- quote ---");
  try {
    const quote = await prodigi.getQuote({
      destinationCountryCode: "DE",
      currencyCode: "EUR",
      shippingMethod: "Standard", // client lowercases this for the quote body
      items: [{ sku: testSku, copies: 1, assets: [{ printArea: "default" }] }],
    });
    line(`QUOTE outcome=${quote.outcome} · quotes=${JSON.stringify((quote.quotes ?? []).map((q) => ({ method: q.shipmentMethod, items: q.costSummary?.items, shipping: q.costSummary?.shipping })))}`);
  } catch (e) {
    line(`QUOTE failed :: ${apiErr(e)}`);
  }
  line("");

  // 4) OPTIONAL: one controlled sandbox ORDER (off by default). Built via OUR buildProdigiOrderRequest.
  if (process.argv.includes("--order")) {
    line("--- sandbox order (controlled; cancelled afterwards) ---");
    const req = buildProdigiOrderRequest({
      reference: "SANDBOX-VERIFY",
      idempotencyKey: `sandbox-verify-${Date.now()}`,
      recipient: { name: "Sandbox Verify", email: "sandbox@example.com" },
      ship: { line1: "1 Test Street", city: "Berlin", postalCode: "10115", country: "DE" },
      variant: { prodigiSku: testSku, printReadyAssetUrl: SAMPLE_ASSET_URL, copies: 1 },
      shippingMethod: "Standard",
    });
    try {
      const resp = await prodigi.createOrder(req);
      const id = resp.order?.id ?? null;
      line(`ORDER outcome=${resp.outcome} · id=${id} · stage=${resp.order?.status?.stage}`);
      line(`  our mapProdigiStatus => ${mapProdigiStatus(resp)}`);
      line(`  our extractTracking  => ${JSON.stringify(extractTracking(resp))}`);
      line(`  status.details => ${JSON.stringify(resp.order?.status?.details ?? {})}`);
      if (resp.order?.status?.issues) line(`  issues => ${JSON.stringify(resp.order.status.issues)}`);
      if (id) {
        const got = await prodigi.getOrder(id);
        line(`GET order stage=${got.order?.status?.stage} · details=${JSON.stringify(got.order?.status?.details ?? {})}`);
        line(`  shipments=${JSON.stringify(got.order?.shipments ?? [])}`);
        try {
          const c = await prodigi.cancelOrder(id);
          line(`CANCEL outcome=${c.outcome}`);
        } catch (e) {
          line(`CANCEL not possible (${apiErr(e)}) — sandbox order left as-is (no charge in sandbox).`);
        }
      }
    } catch (e) {
      line(`ORDER failed :: ${apiErr(e)}`);
    }
    line("");
  } else {
    line("(order test skipped — pass --order to place ONE sandbox order)");
  }

  line("=== done ===");
}

main().catch((e) => {
  line(`FATAL :: ${apiErr(e)}`);
  process.exitCode = 1;
});
