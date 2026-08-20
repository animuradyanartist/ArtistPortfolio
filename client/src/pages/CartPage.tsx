/**
 * THE CART — a list of paintings, revalidated by the server every time it is opened.
 *
 * The prices and availability below are not the ones the browser remembered; they are the
 * ones `/api/commerce/cart/validate` just read from the database. A work that sold while the
 * tab was open says so here rather than at the payment step.
 *
 * NO QUANTITY CONTROLS. Each work is unique, so there is one of it, and a stepper offering to
 * make it two would be a lie about what is being sold.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "@/lib/cart";
import { Eyebrow } from "@/components/editorial";
import { COUNTRY_NAME, guessCountry } from "@/lib/countries";

interface ValidatedCart {
  items: Array<{ id: number; title: string; dimensions: string; year: number; medium: string;
    imageUrl: string; priceFormatted: string | null; purchasable: boolean; unavailableReason: string | null }>;
  missing: number[];
  totals: null | { ok: true; itemsFormatted: string; shippingFormatted: string; totalFormatted: string;
    shippingEstimated: boolean; dutiesMayApply: boolean } | { ok: false; error: unknown };
}

export default function CartPage() {
  const cart = useCart();
  const [country, setCountry] = useState<string | null>(null);
  useEffect(() => { setCountry(cart.country ?? guessCountry()); }, [cart.country]);

  const { data, isLoading } = useQuery<ValidatedCart>({
    queryKey: ["/api/commerce/cart/validate", cart.ids.join(","), country],
    enabled: cart.ids.length > 0,
    queryFn: async () => {
      const r = await fetch("/api/commerce/cart/validate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artworkIds: cart.ids, country }),
      });
      if (!r.ok) throw new Error("validate failed");
      return r.json();
    },
  });

  // A work that no longer exists is silently dropped: keeping a dead id would fail every
  // future request for no benefit to anybody.
  useEffect(() => { data?.missing?.forEach((id) => cart.remove(id)); }, [data, cart]);

  const buyable = data?.items.filter((i) => i.purchasable) ?? [];

  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      <div className="mx-auto max-w-4xl px-6 py-16 md:py-24">
        <Eyebrow>Your selection</Eyebrow>
        <h1 className="font-playfair text-4xl md:text-5xl text-stone-900 mb-10">Cart</h1>

        {cart.ids.length === 0 ? (
          <p className="text-stone-600">
            Nothing here yet.{" "}
            <Link href="/artworks"><a className="border-b border-stone-400 hover:border-stone-800">Browse the paintings</a></Link>.
          </p>
        ) : isLoading ? (
          <p className="text-stone-500">Checking availability…</p>
        ) : (
          <>
            <ul className="border-t border-stone-300">
              {data?.items.map((item) => (
                <li key={item.id} className="flex gap-6 border-b border-stone-300 py-6">
                  <Link href={`/artworks/${item.id}`}>
                    <a className="shrink-0 w-24 h-24 overflow-hidden bg-stone-200/60">
                      <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                    </a>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-playfair text-xl text-stone-900">{item.title}</h2>
                    <p className="text-sm text-stone-600 mt-1">
                      {[item.medium, item.dimensions, item.year].filter(Boolean).join(" · ")}
                    </p>
                    {!item.purchasable && (
                      <p className="text-sm text-amber-700 mt-2">{item.unavailableReason}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm text-stone-900 tabular-nums">{item.priceFormatted ?? "—"}</p>
                    <button onClick={() => cart.remove(item.id)}
                      className="mt-3 text-[11px] tracking-[0.18em] uppercase text-stone-500 hover:text-stone-800 border-b border-transparent hover:border-stone-400">
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-8 max-w-sm ml-auto space-y-3">
              <label className="flex items-baseline justify-between gap-4">
                <span className="text-[11px] tracking-[0.2em] uppercase text-stone-500">Shipping to</span>
                <select className="bg-transparent text-sm text-stone-800 text-right border-b border-stone-300 focus:border-stone-800 focus:outline-none py-1"
                  value={country ?? ""} onChange={(e) => { setCountry(e.target.value); cart.setCountry(e.target.value); }}>
                  <option value="" disabled>Choose a country</option>
                  {Object.keys(COUNTRY_NAME).sort().map((c) => <option key={c} value={c}>{COUNTRY_NAME[c]}</option>)}
                </select>
              </label>

              {data?.totals && "ok" in data.totals && data.totals.ok && (
                <>
                  <Row label="Works" value={data.totals.itemsFormatted} />
                  <Row label={data.totals.shippingEstimated ? "Estimated shipping" : "Shipping"} value={data.totals.shippingFormatted} />
                  <div className="border-t border-stone-300 pt-3">
                    <Row label="Total" value={data.totals.totalFormatted} strong />
                  </div>
                </>
              )}
              {data?.totals && "ok" in data.totals && !data.totals.ok && (
                <p className="text-sm text-amber-700">
                  Shipping for this selection needs a quote.{" "}
                  <Link href="/contact"><a className="border-b border-stone-400">Contact us</a></Link>.
                </p>
              )}

              {buyable.length > 0 && (
                <Link href={`/checkout?artwork=${buyable[0]!.id}`}>
                  <a className="mt-4 block text-center bg-stone-900 text-stone-50 px-8 py-3 text-[11px] tracking-[0.2em] uppercase hover:bg-stone-700 transition-colors">
                    Checkout
                  </a>
                </Link>
              )}
              {/* Stated rather than discovered at the payment step. */}
              {buyable.length > 1 && (
                <p className="text-xs text-stone-500 leading-relaxed">
                  Each original is purchased in its own order, so shipping can be crated and
                  quoted properly. You will be brought back here for the next work.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={`text-[11px] tracking-[0.2em] uppercase ${strong ? "text-stone-700" : "text-stone-500"}`}>{label}</span>
      <span className={`tabular-nums ${strong ? "text-stone-900" : "text-sm text-stone-800"}`}>{value}</span>
    </div>
  );
}
