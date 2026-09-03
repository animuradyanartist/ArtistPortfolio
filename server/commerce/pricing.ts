/**
 * WHAT THIS ORDER COSTS — decided here, on the server, from rows read just now.
 *
 * The client sends artwork ids and a destination. It does not send prices, and if it did they
 * would be ignored: every figure below comes from a fresh SELECT and the shared estimator.
 * That is the whole reason this module exists rather than the browser adding things up.
 *
 * It is also the ONLY place an order total is computed, so the quote shown on the artwork
 * page, the cart total, and the amount handed to Stripe cannot disagree with one another.
 */
import type { Artwork } from "@shared/schema";
import { purchasability, type NotPurchasableReason } from "@shared/commerce/purchasable";
import { DEFAULT_CURRENCY, isCurrency, type Currency } from "@shared/commerce/money";
import { shippingMinorInCurrency, type ShippableArtwork, type ShippingQuote } from "@shared/commerce/shipping";
import { shippingProvider } from "./providers";

/** The artwork row, reduced to what shipping needs — including the parsed overrides. */
export function toShippable(a: Artwork): ShippableArtwork {
  return {
    id: a.id,
    title: a.title,
    dimensions: a.dimensions,
    shippingEnabled: a.shippingEnabled !== false,
    shippingOverrideMinor: a.shippingOverrideMinor ?? null,
    shippingDestinationOverrides: parseDestinationOverrides(a.shippingDestinationOverrides),
    packedDepthCm: a.packedDepthCm ?? null,
    packingMarginCm: a.packingMarginCm ?? null,
  };
}

/**
 * The per-destination override column is free text holding JSON, so it is parsed defensively:
 * anything malformed becomes "no overrides" rather than throwing a 500 into a checkout.
 * Values must be positive integers — a zero here would ship a painting for nothing.
 */
export function parseDestinationOverrides(raw: string | null | undefined): Record<string, number> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (/^[A-Za-z]{2}$/.test(k) && typeof v === "number" && Number.isInteger(v) && v > 0) {
        out[k.toUpperCase()] = v;
      }
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

export function currencyOf(a: Artwork): Currency {
  return isCurrency(a.websiteCurrency) ? a.websiteCurrency : DEFAULT_CURRENCY;
}

export type PricedOrder =
  | {
      ok: true;
      currency: Currency;
      itemsMinor: number;
      shippingMinor: number;
      totalMinor: number;
      lines: Array<{ artwork: Artwork; priceMinor: number; shipping: ShippingQuote }>;
      shippingEstimated: boolean;
      shippingBasis: string;
      providerName: string;
    }
  | {
      ok: false;
      error:
        | { kind: "not-purchasable"; artworkId: number; reasons: NotPurchasableReason[] }
        | { kind: "mixed-currency"; found: string[] }
        | { kind: "shipping-unavailable"; quote: ShippingQuote }
        | { kind: "empty" };
    };

/**
 * Price a set of freshly-read artwork rows for one destination.
 *
 * Order of checks matters: purchasability first, because telling somebody the shipping on a
 * painting that has just sold is worse than telling them it has sold.
 */
export async function priceOrder(
  artworks: readonly Artwork[],
  countryCode: string,
  now: Date = new Date(),
): Promise<PricedOrder> {
  if (!artworks.length) return { ok: false, error: { kind: "empty" } };

  for (const a of artworks) {
    const p = purchasability(
      {
        id: a.id,
        availability: a.availability,
        directSaleEnabled: a.directSaleEnabled === true,
        websitePriceMinor: a.websitePriceMinor ?? null,
        websiteCurrency: a.websiteCurrency ?? null,
        shippingEnabled: a.shippingEnabled !== false,
        reservedUntil: a.reservedUntil ?? null,
        hasCommitment: a.hasCommitment ?? false,
        commitmentUntil: a.commitmentUntil ?? null,
      },
      now,
    );
    if (!p.purchasable) {
      return { ok: false, error: { kind: "not-purchasable", artworkId: a.id, reasons: p.reasons } };
    }
  }

  // One order, one currency. Mixing them would mean either a conversion this system has no
  // rate for, or two Stripe sessions pretending to be one purchase.
  const currencies = Array.from(new Set(artworks.map(currencyOf)));
  if (currencies.length > 1) {
    return { ok: false, error: { kind: "mixed-currency", found: currencies } };
  }
  const currency = currencies[0] ?? DEFAULT_CURRENCY;

  const provider = shippingProvider();

  // TEST HARNESS ($1.00 / $0.00 / $1.00 production-journey item). A `production-test` item ships
  // FREE, and must not depend on the estimator (which could refuse an odd destination). Real
  // catalogue rows are never source="production-test", so this is inert for every real sale.
  // Remove together with server/commerce/testArtwork.ts.
  const isTestItem = artworks.length === 1 && artworks[0]!.source === "production-test";

  const cart = await provider.quoteCart(artworks.map(toShippable), countryCode);
  if (!cart.ok && !isTestItem) return { ok: false, error: { kind: "shipping-unavailable", quote: cart.failed } };

  const lines = artworks.map((a, i) => ({
    artwork: a,
    priceMinor: a.websitePriceMinor!,
    shipping: cart.perArtwork[i]!,
  }));
  const itemsMinor = lines.reduce((t, l) => t + l.priceMinor, 0);
  // The estimator returns EUR; a USD order must charge shipping in USD. Convert EACH line at the
  // fixed rate and sum — the same per-work conversion the Merchant feed applies — so the charged
  // shipping equals the advertised shipping to the cent. EUR orders pass through unchanged.
  const shippingMinor = isTestItem
    ? 0
    : cart.ok
      ? lines.reduce(
          (t, l) => t + (l.shipping.ok ? shippingMinorInCurrency(l.shipping.amountMinor, currency) : 0),
          0,
        )
      : 0;

  // "Estimated" is true if ANY line was estimated — a total is only as certain as its least
  // certain part, and the label the buyer sees must not overstate.
  const shippingEstimated = !isTestItem && lines.some((l) => l.shipping.ok && l.shipping.estimated);
  const firstOk = lines.find((l) => l.shipping.ok);
  const shippingBasis = isTestItem ? "test-free-shipping" : (firstOk && firstOk.shipping.ok ? firstOk.shipping.basis : "unknown");

  return {
    ok: true, currency, itemsMinor, shippingMinor,
    totalMinor: itemsMinor + shippingMinor,
    lines, shippingEstimated, shippingBasis, providerName: provider.name,
  };
}
