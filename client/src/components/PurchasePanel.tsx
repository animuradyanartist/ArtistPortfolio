/**
 * THE PURCHASE AREA — the only part of the artwork page this change touches.
 *
 * It is written to look like the rest of her site and not like a shop: the same hairline
 * rules, the same tracked uppercase micro-labels, the same restrained type. No badges, no
 * green ticks, no card shadows, no "Only 1 left!". The painting is still the loudest thing
 * on the page.
 *
 * IT SHOWS THE TOTAL BEFORE THE BUTTON. The brief is firm that shipping must not be hidden
 * until the last step, so the destination sits in the panel, the estimate updates with it,
 * and the total is stated in plain words above Buy.
 *
 * IT NEVER COMPUTES MONEY. Every figure here arrives from /api/commerce/quote. The component
 * cannot add up a price even if it wanted to.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "@/lib/cart";
import { trackAddToCart, trackViewItem } from "@/lib/commerceAnalytics";
import { countryOptions, guessCountry } from "@/lib/countries";

interface Quote {
  artwork: { id: number; title: string } | null;
  purchasable: boolean;
  reasons: string[];
  priceMinor: number | null;
  currency: string;
  priceFormatted: string | null;
  supportedCountries: string[];
  checkoutEnabled: boolean;
  shipping:
    | { ok: true; amountMinor: number; amountFormatted: string; estimated: boolean; zoneLabel: string | null;
        totalFormatted: string | null; dutiesMayApply: boolean }
    | { ok: false; reason: string; detail: string }
    | null;
}

export function PurchasePanel({ artworkId, marketplaceUrl }: { artworkId: number; marketplaceUrl?: string | null }) {
  const cart = useCart();
  const [country, setCountry] = useState<string | null>(null);

  // DETECTION IS A CONVENIENCE, NEVER A GATE (PART 5). The locale is a hint; the select below
  // is always available and always wins, and nothing about eligibility depends on either.
  useEffect(() => {
    setCountry(cart.country ?? guessCountry());
  }, [cart.country]);

  const { data, isLoading } = useQuery<Quote>({
    queryKey: ["/api/commerce/quote", artworkId, country],
    queryFn: async () => {
      const q = new URLSearchParams({ artworkId: String(artworkId) });
      if (country) q.set("country", country);
      const r = await fetch(`/api/commerce/quote?${q}`);
      if (!r.ok) throw new Error("quote failed");
      return r.json();
    },
  });

  const reported = useMemo(() => ({ done: false }), [artworkId]);
  useEffect(() => {
    if (data?.purchasable && data.artwork && !reported.done) {
      reported.done = true;
      trackViewItem({ id: data.artwork.id, title: data.artwork.title,
        priceMinor: data.priceMinor, currency: data.currency });
    }
  }, [data, reported]);

  // Not for direct sale: say nothing at all and let the page's existing enquiry route stand.
  if (isLoading || !data || !data.purchasable) return null;

  const inCart = cart.has(artworkId);
  const shipping = data.shipping;

  const onAdd = () => {
    cart.add(artworkId);
    if (data.artwork) {
      trackAddToCart({ id: data.artwork.id, title: data.artwork.title,
        priceMinor: data.priceMinor, currency: data.currency });
    }
  };

  return (
    <section className="mt-10 border-t border-stone-300 pt-8" aria-label="Purchase">
      <div className="flex items-baseline justify-between gap-6">
        <p className="text-[11px] tracking-[0.2em] uppercase text-stone-500">Price</p>
        <p className="font-playfair text-3xl text-stone-900">{data.priceFormatted}</p>
      </div>

      <div className="mt-6 space-y-3">
        <label className="flex items-baseline justify-between gap-4">
          <span className="text-[11px] tracking-[0.2em] uppercase text-stone-500">Shipping to</span>
          <select
            className="bg-transparent text-sm text-stone-800 text-right border-b border-stone-300 focus:border-stone-800 focus:outline-none py-1 max-w-[60%]"
            value={country ?? ""}
            onChange={(e) => { setCountry(e.target.value); cart.setCountry(e.target.value); }}
          >
            <option value="" disabled>Choose a country</option>
            {countryOptions(data.supportedCountries).map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </label>

        {shipping?.ok && (
          <>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[11px] tracking-[0.2em] uppercase text-stone-500">
                {shipping.estimated ? "Estimated shipping" : "Shipping"}
              </span>
              <span className="text-sm text-stone-800 tabular-nums">{shipping.amountFormatted}</span>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-stone-200 pt-3">
              <span className="text-[11px] tracking-[0.2em] uppercase text-stone-700">Total</span>
              <span className="text-sm text-stone-900 tabular-nums">{shipping.totalFormatted}</span>
            </div>
          </>
        )}

        {/* PART 9 — the refusal, said plainly, with a way forward rather than a dead end. */}
        {shipping && !shipping.ok && (
          <p className="text-sm text-stone-700 leading-relaxed">
            Shipping to this destination needs a quote — {shipping.detail.toLowerCase()}{" "}
            <Link href="/contact"><a className="border-b border-stone-400 hover:border-stone-800">Ask for a shipping quote</a></Link>.
          </p>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        {/* FAILS CLOSED ON PAYMENT.
            No Buy button exists until BOTH Stripe secrets are present. Rendering one and
            letting somebody type their address before a 503 is worse than never offering it:
            the price and the shipping estimate below are still true and still useful, so they
            stay — only the action that cannot complete is withheld. */}
        {shipping?.ok && data.checkoutEnabled ? (
          <Link href={`/checkout?artwork=${artworkId}`}>
            <a className="inline-block bg-stone-900 text-stone-50 px-8 py-3 text-[11px] tracking-[0.2em] uppercase hover:bg-stone-700 transition-colors duration-300">
              Buy now
            </a>
          </Link>
        ) : null}

        <button
          onClick={onAdd}
          disabled={inCart}
          className="inline-block border border-stone-800 px-8 py-3 text-[11px] tracking-[0.2em] uppercase text-stone-900 hover:bg-stone-900 hover:text-stone-50 transition-colors duration-300 disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-stone-900"
        >
          {inCart ? "In your cart" : "Add to cart"}
        </button>
      </div>

      {!data.checkoutEnabled && (
        <p className="mt-6 text-sm text-stone-700 leading-relaxed max-w-md">
          Online payment for this work is not open yet.{" "}
          <Link href="/contact"><a className="border-b border-stone-400 hover:border-stone-800">Enquire about buying it</a></Link>{" "}
          and Ani will arrange it with you directly.
        </p>
      )}

      {/* PART 10 — factual, and deliberately not a tax engine. Nothing is collected on it. */}
      {shipping?.ok && shipping.dutiesMayApply && (
        <p className="mt-6 text-xs leading-relaxed text-stone-500 max-w-md">
          Shipped from Armenia. Import duties or taxes charged by the destination country are not
          included and are payable by the recipient. Shipping covers carriage and packing, not
          fine-art insurance.
        </p>
      )}

      {marketplaceUrl && (
        <p className="mt-4 text-xs text-stone-500">
          Also listed on{" "}
          <a href={marketplaceUrl} target="_blank" rel="noopener noreferrer"
             className="border-b border-stone-300 hover:border-stone-700">the marketplace</a>.
        </p>
      )}
    </section>
  );
}
