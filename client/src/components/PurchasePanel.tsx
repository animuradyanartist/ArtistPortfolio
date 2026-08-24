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
import { countryOptions, displayCountry, COUNTRY_NAME } from "@/lib/countries";

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

export function PurchasePanel({ artworkId, marketplaceUrl, marketplaceLabel = "View on Singulart" }:
  { artworkId: number; marketplaceUrl?: string | null; marketplaceLabel?: string }) {
  const cart = useCart();
  // SEEDED ON THE FIRST RENDER, NOT AFTER IT.
  //
  // `country` is part of the query key, so starting at null asked /api/commerce/quote once
  // with no country, then again the moment the effect below resolved one — two round trips,
  // ~3s combined on the live site, before a price appeared. `displayCountry` is pure and
  // synchronous (time zone, then locale, then a stated default), so there was never a reason
  // to wait for an effect to call it. The effect stays, to follow a country chosen elsewhere
  // in the app; on first render it now sets the value that is already there, which React
  // discards without re-rendering — so exactly one quote is requested.
  const [country, setCountry] = useState<string | null>(() => displayCountry(cart.country));
  const [changing, setChanging] = useState(false);

  // DETECTION IS A CONVENIENCE, NEVER A GATE (PART 5). The locale is a hint; the select below
  // is always available and always wins, and nothing about eligibility depends on either.
  // NOBODY SHOULD HAVE TO PICK A COUNTRY TO LEARN WHAT SOMETHING COSTS.
  //
  // The first version left the select on "Choose a country" whenever detection failed, and
  // showed no shipping and no total until it was operated — administration before an answer.
  // `displayCountry` always returns one: the time zone's, else the locale's, else a stated
  // default. It is a DISPLAY choice only; checkout re-prices from the address typed into the
  // form, so a wrong guess costs a visitor nothing.
  useEffect(() => {
    setCountry(displayCountry(cart.country));
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

  // Not our surface at all: no public price, or direct sale is off entirely → say nothing and
  // let the page's existing enquiry route stand, exactly as before.
  if (isLoading || !data) return null;
  if (!data.priceFormatted || data.reasons?.includes("direct-sale-disabled")) return null;

  // It IS a direct-sale work with a public price but is not purchasable right now (a hold, a
  // sale, a commitment). Show the PRICE and the correct state rather than vanishing — vanishing
  // is exactly what made the price "disappear" during a reservation. Never a Buy button here,
  // and never a misleading payable price on a sold work.
  if (!data.purchasable) {
    const sold = data.reasons?.includes("not-available");
    const reserved = data.reasons?.includes("reserved");
    const committed = data.reasons?.includes("committed");
    if (sold) {
      return (
        <section className="mt-10 border-t border-stone-300 pt-8" aria-label="Purchase">
          <p className="text-[11px] tracking-[0.2em] uppercase text-stone-500">Status</p>
          <p className="font-playfair text-3xl text-stone-900 mt-1">Sold</p>
          <p className="mt-3 text-sm text-stone-600 leading-relaxed">This original is now in a private collection.</p>
        </section>
      );
    }
    return (
      <section className="mt-10 border-t border-stone-300 pt-8" aria-label="Purchase">
        <div className="flex items-baseline justify-between gap-6">
          <p className="text-[11px] tracking-[0.2em] uppercase text-stone-500">Price</p>
          <p className="font-playfair text-3xl text-stone-900">{data.priceFormatted}</p>
        </div>
        <p className="mt-4 text-sm text-stone-700 leading-relaxed">
          {reserved
            ? "Currently reserved — a checkout is in progress. Please check back shortly."
            : committed
              ? "This work is promised to a gallery or collector."
              : "This work isn't open for direct purchase right now."}{" "}
          <Link href="/contact" className="border-b border-stone-400 hover:border-stone-800">Enquire</Link>.
        </p>
      </section>
    );
  }

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
        {/* The answer first, as a sentence, with the country named in it. The control to change
            it is one click away and never in the way. */}
        {!changing ? (
          <p className="text-sm text-stone-700 leading-relaxed">
            {shipping?.ok ? (
              <>
                Shipping to <span className="text-stone-900">{COUNTRY_NAME[country ?? ""] ?? country}</span>
                {" — "}
                {shipping.estimated ? "estimated " : ""}
                <span className="text-stone-900 tabular-nums">{shipping.amountFormatted}</span>
              </>
            ) : (
              <>Shipping to <span className="text-stone-900">{COUNTRY_NAME[country ?? ""] ?? country}</span></>
            )}
            {" "}
            <button type="button" onClick={() => setChanging(true)}
              className="text-[11px] tracking-[0.18em] uppercase text-stone-500 hover:text-stone-800 border-b border-stone-300 hover:border-stone-700 ml-1 align-baseline">
              Change country
            </button>
          </p>
        ) : (
          <label className="flex items-baseline justify-between gap-4">
            <span className="text-[11px] tracking-[0.2em] uppercase text-stone-500">Shipping to</span>
            <select
              autoFocus
              className="bg-transparent text-sm text-stone-800 text-right border-b border-stone-300 focus:border-stone-800 focus:outline-none py-1 max-w-[60%]"
              value={country ?? ""}
              onChange={(e) => { setCountry(e.target.value); cart.setCountry(e.target.value); setChanging(false); }}
            >
              {countryOptions(data.supportedCountries).map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </label>
        )}

        {shipping?.ok && (
          <div className="flex items-baseline justify-between gap-4 border-t border-stone-200 pt-3">
            <span className="text-[11px] tracking-[0.2em] uppercase text-stone-700">Estimated total</span>
            <span className="text-sm text-stone-900 tabular-nums">{shipping.totalFormatted}</span>
          </div>
        )}

        {/* PART 9 — the refusal, said plainly, with a way forward rather than a dead end. */}
        {shipping && !shipping.ok && (
          <p className="text-sm text-stone-700 leading-relaxed">
            Shipping to this destination needs a quote — {shipping.detail.toLowerCase()}{" "}
            <Link href="/contact" className="border-b border-stone-400 hover:border-stone-800">Ask for a shipping quote</Link>.
          </p>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        {/* FAILS CLOSED ON PAYMENT.
            No Buy button exists until BOTH Stripe secrets are present. Rendering one and
            letting somebody type their address before a 503 is worse than never offering it:
            the price and the shipping estimate below are still true and still useful, so they
            stay — only the action that cannot complete is withheld. */}
        {/* ONE anchor, not two. `<Link><a>…</a></Link>` rendered a nested pair: an outer anchor
            with NO href wrapping the real one, so a click landing on the wrapper did nothing at
            all — and a visitor whose Buy Now appeared dead would reasonably try the marketplace
            link underneath it. */}
        {shipping?.ok && data.checkoutEnabled ? (
          <Link
            href={`/checkout?artwork=${artworkId}`}
            className="inline-block bg-stone-900 text-stone-50 px-8 py-3 text-[11px] tracking-[0.2em] uppercase hover:bg-stone-700 transition-colors duration-300"
          >
            Buy now
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
          <Link href="/contact" className="border-b border-stone-400 hover:border-stone-800">Enquire about buying it</Link>{" "}
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

      {/* SECONDARY, AND NAMED FOR WHERE IT GOES. Small, quiet, below the duties note, and it
          says "View on Singulart" rather than anything that could read as buying it here. */}
      {marketplaceUrl && (
        <p className="mt-4 text-xs text-stone-500">
          <a href={marketplaceUrl} target="_blank" rel="noopener noreferrer"
             className="border-b border-stone-300 hover:border-stone-700">{marketplaceLabel}</a>
        </p>
      )}
    </section>
  );
}
