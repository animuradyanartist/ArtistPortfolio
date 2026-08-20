/**
 * WHO SAYS WHAT SHIPPING COSTS.
 *
 * The brief asks for a seam so that a real carrier rate can replace the internal estimate
 * later "without rewriting checkout". This is that seam, and it is deliberately small: one
 * method, one return type, and the return type is the same `ShippingQuote` the pure estimator
 * already produces — including its refusals. A provider that cannot quote says so; it never
 * falls back to a cheaper number, because a silent fallback is exactly the failure the whole
 * shipping design exists to prevent.
 *
 * WHY THERE IS NO FEDEX PROVIDER IN THIS COMMIT. FedEx's rating API needs an account number,
 * an API key and a secret, issued against a contracted account. None exists, and the brief is
 * explicit that the commerce system must not block on it — and equally explicit that exact
 * FedEx rates must not be fabricated. So the interface is here, the registry chooses by
 * configuration, and `FEDEX_*` being absent selects the deterministic provider. Adding the
 * real one is a new file and one registry line; checkout does not change.
 */
import { estimateShipping, estimateShippingForCart, type ShippableArtwork, type ShippingQuote } from "@shared/commerce/shipping";

export interface ShippingRateProvider {
  /** Stable identifier, stored on the order so a quote can be traced to its source. */
  readonly name: string;
  quote(artwork: ShippableArtwork, countryCode: string): Promise<ShippingQuote>;
  quoteCart(artworks: readonly ShippableArtwork[], countryCode: string):
    Promise<{ ok: true; amountMinor: number; perArtwork: ShippingQuote[] } | { ok: false; failed: ShippingQuote; perArtwork: ShippingQuote[] }>;
}

/**
 * The calibrated deterministic estimator — the only provider that exists today.
 *
 * Async purely to satisfy the interface; it performs no I/O, which is why a shipping quote on
 * an artwork page costs nothing and cannot fail on a network.
 */
export const deterministicProvider: ShippingRateProvider = {
  name: "deterministic-v1",
  async quote(artwork, countryCode) {
    return estimateShipping(artwork, countryCode);
  },
  async quoteCart(artworks, countryCode) {
    return estimateShippingForCart(artworks, countryCode);
  },
};

/**
 * Which provider is in force.
 *
 * Reads configuration at CALL time, not at import, so enabling a future carrier is a restart
 * rather than a redeploy — and so tests can flip it without module surgery.
 */
export function shippingProvider(): ShippingRateProvider {
  // When a FedEx provider lands it is selected here, on the presence of its credentials:
  //   if (process.env.FEDEX_API_KEY && process.env.FEDEX_ACCOUNT_NUMBER) return fedexProvider;
  return deterministicProvider;
}
