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

import { prodigi as realProdigi, prodigiConfigured } from "../prodigi/prodigiClient";
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

export type PrintQuoteResult =
  | { ok: true; shippingMinor: number; itemsMinor: number | null; currency: string; method: string }
  | { ok: false; reason: "unconfigured" | "no-quote" | "error" };

/** Build the Prodigi quote request for one print variant to a destination. Pure; unit-tested. */
export function buildPrintQuoteRequest(input: PrintQuoteInput): ProdigiQuoteRequest {
  return {
    destinationCountryCode: input.country.trim().toUpperCase(),
    currencyCode: input.currency.trim().toUpperCase(),
    shippingMethod: input.shippingMethod ?? "standard",
    items: [
      {
        sku: input.prodigiSku,
        copies: Math.max(1, Math.floor(input.copies)),
        ...(input.attributes && Object.keys(input.attributes).length ? { attributes: input.attributes } : {}),
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
 * is not "Ok" or no quote carries a usable shipping cost — the fail-closed path.
 */
export function selectShipping(
  resp: ProdigiQuoteResponse,
  preferredMethod?: string,
): { shippingMinor: number; itemsMinor: number | null; currency: string; method: string } | null {
  if (!resp || String(resp.outcome).toLowerCase() !== "ok" || !Array.isArray(resp.quotes) || resp.quotes.length === 0) {
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
    if (!picked) return { ok: false, reason: "no-quote" };
    return {
      ok: true,
      shippingMinor: picked.shippingMinor,
      itemsMinor: picked.itemsMinor,
      currency: (picked.currency || input.currency).toUpperCase(),
      method: picked.method,
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}
