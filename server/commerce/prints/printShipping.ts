/**
 * PRINT SHIPPING — a REAL Prodigi shipping quote for a print variant to a destination.
 *
 * Shipping for a made-to-order print depends on the SKU and the destination country, so it cannot
 * be known on a bare product page and it is NEVER a hardcoded flat number. This module asks Prodigi's
 * `/quotes` endpoint (price + shipping for a SKU set, WITHOUT creating an order) and returns the real
 * shipping cost, or a fail-closed "unavailable" that the caller turns into an honest "calculated at
 * checkout" message.
 *
 * FAILS CLOSED. With no Prodigi key, or if the quote errors / returns nothing usable, this returns
 * `{ ok: false }` — it never invents an amount and never blocks the flow. The pure builders/parsers
 * are unit-tested; the network call is behind a small port so the decision logic needs no live key.
 */

import { prodigi as realProdigi, prodigiConfigured, ProdigiApiError } from "../prodigi/prodigiClient";
import { requiredAttributesForSku } from "@shared/commerce/prodigiProducts";
import type {
  ProdigiQuoteRequest,
  ProdigiQuoteResponse,
  ProdigiQuoteShippingMethod,
} from "../prodigi/prodigiTypes";

/** The minimal port the quote logic needs — the real `prodigi` object satisfies it. */
export interface ProdigiQuotePort {
  getQuote(req: ProdigiQuoteRequest): Promise<ProdigiQuoteResponse>;
}

export interface PrintQuoteInput {
  prodigiSku: string;
  copies: number;
  /** ISO country code of the destination (e.g. "DE", "US"). */
  country: string;
  currency: string;
  /** Only the attributes the SKU requires (e.g. frame colour). Omitted when none. */
  attributes?: Record<string, string>;
  /** Defaults to "standard"; quotes want lowercase, which the client normalises. */
  shippingMethod?: ProdigiQuoteShippingMethod;
}

export type PrintQuoteFailReason = "unconfigured" | "no-quote" | "error";

export type PrintQuoteResult =
  | { ok: true; shippingMinor: number; itemsMinor: number | null; currency: string; method: string }
  // On failure we carry OPTIONAL diagnostics for ADMIN-ONLY surfacing (never used by public checkout):
  //   `status`  — the Prodigi HTTP status when the call errored (e.g. 404 invalid SKU, 401 bad key)
  //   `outcome` — Prodigi's own `outcome` string when the response parsed but carried no usable quote
  //   `detail`  — a short, key-free human summary (HTTP status text / Prodigi issues)
  | { ok: false; reason: PrintQuoteFailReason; status?: number; outcome?: string; detail?: string };

/**
 * Whether a Prodigi `/quotes` outcome represents a usable quote.
 *
 * v4.0 returns `outcome: "Created"` on a clean success AND `outcome: "CreatedWithIssues"` when a VALID
 * quote came back but carries a WARNING — a US sales-tax note (`destinationCountryCode.UsSalesTaxWarning`),
 * or an international import/VAT/customs note. The quote in `quotes[]` is still real and is exactly what
 * the customer is charged. The old check accepted ONLY {"created","ok"}, so it rejected every
 * destination that triggers a warning — i.e. all US and international quotes — and returned "no-quote".
 * Armenia kept working because its quote comes back as a clean "Created". That was the international
 * checkout outage.
 *
 * So ANY "created…" outcome is a success here. Genuine failures — "NotEnoughInformation",
 * "CountryNotSupported", etc. — do NOT start with "created" and are still rejected, and the caller's
 * downstream guard (a priced quote must exist in `quotes[]`) keeps a warning-with-no-usable-quote
 * fail-closed. `"ok"` is retained as a defensive alias.
 */
export function isQuoteOkOutcome(outcome: unknown): boolean {
  const o = String(outcome ?? "").trim().toLowerCase();
  return o === "ok" || o.startsWith("created");
}

/** A short, KEY-FREE summary of a Prodigi error body (its `issues`/message), bounded in length. */
function prodigiIssueSummary(body: unknown): string {
  try {
    const b = body as { message?: unknown; issues?: Array<{ errorCode?: unknown; description?: unknown }> } | null;
    if (b && Array.isArray(b.issues) && b.issues.length) {
      const first = b.issues[0];
      const parts = [first?.errorCode, first?.description].filter(Boolean).map(String);
      if (parts.length) return ` :: ${parts.join(" — ")}`.slice(0, 200);
    }
    if (b && typeof b.message === "string" && b.message) return ` :: ${b.message}`.slice(0, 200);
  } catch {
    /* ignore — diagnostics must never throw */
  }
  return "";
}

/**
 * Build the Prodigi quote request for one print variant to a destination. Pure; unit-tested.
 *
 * CANONICAL ATTRIBUTE SOURCE: the SKU registry supplies the REQUIRED catalogue attributes (canvas
 * `wrap`), merged here with any caller-provided attributes (e.g. a frame colour). This is the SINGLE
 * serialization boundary for a quote item, so EVERY caller (CLI probe, admin estimator, checkout) sends
 * a canvas SKU its required wrap without having to remember to pass it — the class of bug that made
 * Prodigi reject canvas quotes with `MissingRequiredAttributes`. Paper SKUs contribute nothing.
 */
export function buildPrintQuoteRequest(input: PrintQuoteInput): ProdigiQuoteRequest {
  const attributes = { ...requiredAttributesForSku(input.prodigiSku), ...(input.attributes ?? {}) };
  return {
    destinationCountryCode: input.country.trim().toUpperCase(),
    currencyCode: input.currency.trim().toUpperCase(),
    shippingMethod: input.shippingMethod ?? "standard",
    items: [
      {
        sku: input.prodigiSku,
        copies: Math.max(1, Math.floor(input.copies)),
        ...(Object.keys(attributes).length ? { attributes } : {}),
        // A quote item only needs the print area, not the asset URL (no order is created).
        assets: [{ printArea: "default" }],
      },
    ],
  };
}

/**
 * Convert a Prodigi decimal cost string ("5.99", "12", "0.00") to integer minor units. Returns null
 * for anything non-numeric so a malformed response is treated as "no quote", never as free shipping.
 */
export function costToMinor(amount: string | null | undefined): number | null {
  if (amount == null) return null;
  const n = Number(String(amount).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * Pick the shipping figure from a quote response. Prefers a quote whose `shipmentMethod` matches the
 * requested method (case-insensitive); otherwise the cheapest shipping. Returns null when the outcome
 * is not a success ("Created"/"CreatedWithIssues"/"Ok") or no quote carries a usable shipping cost —
 * the fail-closed path.
 */
export function selectShipping(
  resp: ProdigiQuoteResponse,
  preferredMethod?: string,
): { shippingMinor: number; itemsMinor: number | null; currency: string; method: string } | null {
  if (!resp || !isQuoteOkOutcome(resp.outcome) || !Array.isArray(resp.quotes) || resp.quotes.length === 0) {
    return null;
  }
  const priced = resp.quotes
    .map((q) => ({
      method: q.shipmentMethod ?? "",
      shippingMinor: costToMinor(q.costSummary?.shipping?.amount),
      itemsMinor: costToMinor(q.costSummary?.items?.amount),
      currency: q.costSummary?.shipping?.currency ?? q.costSummary?.items?.currency ?? "",
    }))
    .filter((q): q is { method: string; shippingMinor: number; itemsMinor: number | null; currency: string } => q.shippingMinor != null);
  if (priced.length === 0) return null;

  const wanted = preferredMethod?.trim().toLowerCase();
  const match = wanted ? priced.find((q) => q.method.toLowerCase() === wanted) : undefined;
  const chosen = match ?? priced.reduce((a, b) => (b.shippingMinor < a.shippingMinor ? b : a));
  return {
    shippingMinor: chosen.shippingMinor,
    itemsMinor: chosen.itemsMinor,
    currency: chosen.currency || "",
    method: chosen.method,
  };
}

/** The checkout decision from a shipping quote. FAIL CLOSED: a failed quote refuses the checkout with a
 *  clear message (never free shipping, never a wrong total). A successful quote carries the shipping to
 *  charge the customer AND Prodigi's own production cost (for order-side accounting; never shown publicly). */
export type CheckoutShippingOutcome =
  | { proceed: true; shippingMinor: number; prodigiCostMinor: number | null; method: string }
  | { proceed: false; reason: "unconfigured" | "no-quote" | "error"; message: string };

/**
 * ADMIN-ONLY diagnostic for a FAILED quote — lets the admin UI tell the causes apart instead of one
 * flat "unavailable". NEVER used on any public route; the strings are key-free (built only from HTTP
 * status + Prodigi's own outcome/issues). `code` is a stable machine value; `message` is admin text.
 */
export type AdminQuoteDiagnosticCode =
  | "not-configured" | "invalid-sku" | "destination-unsupported"
  | "quote-unavailable" | "prodigi-auth" | "prodigi-api-error";

export function adminQuoteDiagnostic(
  quote: Extract<PrintQuoteResult, { ok: false }>,
): { code: AdminQuoteDiagnosticCode; message: string } {
  if (quote.reason === "unconfigured") {
    return { code: "not-configured", message: "No Prodigi API key is configured on the server, so production cost cannot be quoted." };
  }
  if (quote.reason === "error") {
    const detail = quote.detail ? ` (${quote.detail})` : "";
    if (quote.status === 401 || quote.status === 403) {
      return { code: "prodigi-auth", message: `Prodigi rejected the API key for this environment${detail}. Check the sandbox vs live key.` };
    }
    if (quote.status === 404) {
      return { code: "invalid-sku", message: `Prodigi does not recognise this SKU in the current environment${detail}. Confirm the SKU exists in this sandbox/live account.` };
    }
    return { code: "prodigi-api-error", message: `Prodigi API error while quoting${detail}.` };
  }
  // no-quote: the call succeeded but no priced quote came back — most often an unsupported destination
  // for this product, otherwise a transient no-quote.
  const outcome = quote.outcome ? ` (outcome: ${quote.outcome})` : "";
  if (quote.outcome && /country|destination|ship/i.test(quote.outcome)) {
    return { code: "destination-unsupported", message: `Prodigi returned no quote for this destination${outcome}. This product may not ship there.` };
  }
  return { code: "quote-unavailable", message: `Prodigi returned no priced quote${outcome}. The destination may be unsupported for this product, or quoting is temporarily unavailable.` };
}

export function checkoutShippingOutcome(quote: PrintQuoteResult): CheckoutShippingOutcome {
  if (!quote.ok) {
    return {
      proceed: false,
      reason: quote.reason,
      message: quote.reason === "unconfigured"
        ? "Print ordering is temporarily unavailable. Please try again shortly."
        : "We couldn't calculate shipping to your destination right now. Please try again in a moment.",
    };
  }
  return { proceed: true, shippingMinor: quote.shippingMinor, prodigiCostMinor: quote.itemsMinor, method: quote.method };
}

/**
 * Get a REAL shipping quote for a print variant to a destination. Fails closed: with no Prodigi key
 * or on any error/empty response it returns `{ ok: false }` — never a fabricated amount.
 */
export async function quotePrintShipping(
  input: PrintQuoteInput,
  deps: { prodigi?: ProdigiQuotePort; configured?: () => boolean } = {},
): Promise<PrintQuoteResult> {
  const configured = deps.configured ?? prodigiConfigured;
  if (!configured()) return { ok: false, reason: "unconfigured" };
  const client = deps.prodigi ?? realProdigi;
  try {
    const resp = await client.getQuote(buildPrintQuoteRequest(input));
    const picked = selectShipping(resp, input.shippingMethod ?? "standard");
    if (!picked) {
      // Parsed OK but nothing usable — surface Prodigi's own `outcome` so an admin can tell a genuinely
      // unquotable destination apart from a parse/shape problem.
      const outcome = resp?.outcome != null ? String(resp.outcome) : undefined;
      return { ok: false, reason: "no-quote", ...(outcome ? { outcome } : {}) };
    }
    return {
      ok: true,
      shippingMinor: picked.shippingMinor,
      itemsMinor: picked.itemsMinor,
      currency: (picked.currency || input.currency).toUpperCase(),
      method: picked.method,
    };
  } catch (e) {
    // A Prodigi HTTP error (bad key, invalid SKU, unsupported destination) carries a status + issues
    // but NEVER the key — capture them for the admin diagnostic. Non-Prodigi errors stay opaque.
    if (e instanceof ProdigiApiError) {
      return { ok: false, reason: "error", status: e.statusCode, detail: `HTTP ${e.statusCode} ${e.statusText}${prodigiIssueSummary(e.body)}` };
    }
    return { ok: false, reason: "error" };
  }
}
