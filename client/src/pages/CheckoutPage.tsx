/**
 * CHECKOUT — collect what is needed to send a crate, then hand off to Stripe.
 *
 * No card field appears anywhere in this file, or anywhere in this codebase. The form below
 * collects a name and an address; payment happens on Stripe's own page, which is why card
 * data never touches this server and why PCI scope stays where it belongs.
 *
 * The totals shown are recomputed by the server as the country changes, and recomputed AGAIN
 * — from fresh rows — inside the checkout request. What is displayed here is a preview of the
 * server's answer, never the input to it.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "@/lib/cart";
import { Eyebrow } from "@/components/editorial";
import { countryOptions, guessCountry } from "@/lib/countries";
import { readAttribution, trackBeginCheckout } from "@/lib/commerceAnalytics";

const REGION_REQUIRED = new Set(["US", "CA", "AU"]);

export default function CheckoutPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const cart = useCart();
  const artworkId = Number.parseInt(new URLSearchParams(search).get("artwork") ?? "", 10);

  const [country, setCountry] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", address1: "", address2: "", city: "", region: "", postalCode: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => { setCountry(cart.country ?? guessCountry()); }, [cart.country]);

  const { data } = useQuery<{ items: Array<{ id: number; title: string; dimensions: string; imageUrl: string; priceFormatted: string | null; purchasable: boolean }>;
    totals: null | { ok: true; itemsFormatted: string; shippingFormatted: string; totalFormatted: string; shippingEstimated: boolean; dutiesMayApply: boolean; totalMinor: number; shippingMinor: number; currency: string } | { ok: false } }>({
    queryKey: ["/api/commerce/cart/validate", artworkId, country],
    enabled: Number.isInteger(artworkId) && Boolean(country),
    queryFn: async () => {
      const r = await fetch("/api/commerce/cart/validate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artworkIds: [artworkId], country }),
      });
      if (!r.ok) throw new Error("validate failed");
      return r.json();
    },
  });

  const item = data?.items?.[0];
  const totals = data?.totals && "ok" in data.totals && data.totals.ok ? data.totals : null;

  const begun = useMemo(() => ({ done: false }), [artworkId]);
  useEffect(() => {
    if (item && totals && !begun.done) {
      begun.done = true;
      trackBeginCheckout([{ id: item.id, title: item.title }], totals.totalMinor, totals.currency);
    }
  }, [item, totals, begun]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setFailure(null); setErrors({});
    try {
      const r = await fetch("/api/commerce/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artworkIds: [artworkId],
          buyer: { ...form, country },
          attribution: { ...(readAttribution() ?? {}), artworkPath: `/artworks/${artworkId}` },
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (r.ok && body.url) {
        // Leaving for Stripe. The cart entry is cleared on the confirmation page, not here —
        // an abandoned payment must not lose the work from the cart.
        window.location.href = body.url as string;
        return;
      }
      if (body.errors) setErrors(body.errors as Record<string, string>);
      setFailure((body.message as string) ?? "Checkout could not be started.");
    } catch {
      setFailure("Checkout could not be started. Nothing has been charged.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!Number.isInteger(artworkId)) {
    return <Shell><p className="text-stone-600">No work selected. <Link href="/artworks"><a className="border-b border-stone-400">Browse the paintings</a></Link>.</p></Shell>;
  }

  return (
    <Shell>
      <div className="grid gap-12 lg:grid-cols-[1fr_360px]">
        <form onSubmit={submit} className="space-y-6" noValidate>
          <h2 className="font-playfair text-2xl text-stone-900">Where should it go?</h2>

          <Field label="Full name" value={form.name} onChange={set("name")} error={errors.name} autoComplete="name" />
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Email" type="email" value={form.email} onChange={set("email")} error={errors.email} autoComplete="email" />
            <Field label="Phone" value={form.phone} onChange={set("phone")} error={errors.phone} autoComplete="tel"
              hint="The courier needs this to arrange delivery." />
          </div>

          <div>
            <label className="block text-[11px] tracking-[0.2em] uppercase text-stone-500 mb-2">Country</label>
            <select
              className="w-full bg-transparent border-b border-stone-300 focus:border-stone-800 focus:outline-none py-2 text-stone-900"
              value={country ?? ""} onChange={(e) => { setCountry(e.target.value); cart.setCountry(e.target.value); }}>
              <option value="" disabled>Choose a country</option>
              {countryOptions().map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
            {errors.country && <p className="text-sm text-red-700 mt-1">{errors.country}</p>}
          </div>

          <Field label="Address" value={form.address1} onChange={set("address1")} error={errors.address1} autoComplete="address-line1" />
          <Field label="Address line 2 (optional)" value={form.address2} onChange={set("address2")} error={errors.address2} autoComplete="address-line2" />
          <div className="grid gap-6 sm:grid-cols-3">
            <Field label="City" value={form.city} onChange={set("city")} error={errors.city} autoComplete="address-level2" />
            {country && REGION_REQUIRED.has(country) && (
              <Field label="State / province" value={form.region} onChange={set("region")} error={errors.region} autoComplete="address-level1" />
            )}
            <Field label="Postal code" value={form.postalCode} onChange={set("postalCode")} error={errors.postalCode} autoComplete="postal-code" />
          </div>

          {failure && <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded">{failure}</p>}

          <button type="submit" disabled={submitting || !totals}
            className="inline-block bg-stone-900 text-stone-50 px-8 py-3 text-[11px] tracking-[0.2em] uppercase hover:bg-stone-700 transition-colors disabled:opacity-50">
            {submitting ? "Taking you to payment…" : "Continue to payment"}
          </button>
          <p className="text-xs text-stone-500">Payment is handled by Stripe. Your card details never reach this website.</p>
        </form>

        <aside className="lg:border-l lg:border-stone-300 lg:pl-10">
          {item && (
            <>
              <div className="aspect-[3/2] overflow-hidden bg-stone-200/60 mb-4">
                <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
              </div>
              <h3 className="font-playfair text-xl text-stone-900">{item.title}</h3>
              <p className="text-sm text-stone-600 mb-6">{item.dimensions}</p>
            </>
          )}
          {totals && (
            <dl className="space-y-3 border-t border-stone-300 pt-4">
              <Line label="Work" value={totals.itemsFormatted} />
              <Line label={totals.shippingEstimated ? "Estimated shipping" : "Shipping"} value={totals.shippingFormatted} />
              <div className="border-t border-stone-300 pt-3"><Line label="Total" value={totals.totalFormatted} strong /></div>
              {totals.dutiesMayApply && (
                <p className="text-xs text-stone-500 leading-relaxed pt-2">
                  Import duties or taxes charged by your country are not included and are payable
                  on delivery.
                </p>
              )}
            </dl>
          )}
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      <div className="mx-auto max-w-5xl px-6 py-16 md:py-24">
        <Eyebrow>Checkout</Eyebrow>
        <h1 className="font-playfair text-4xl md:text-5xl text-stone-900 mb-12">Complete your purchase</h1>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, error, type = "text", autoComplete, hint }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string; type?: string; autoComplete?: string; hint?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] tracking-[0.2em] uppercase text-stone-500 mb-2">{label}</label>
      <input type={type} value={value} onChange={onChange} autoComplete={autoComplete}
        className="w-full bg-transparent border-b border-stone-300 focus:border-stone-800 focus:outline-none py-2 text-stone-900" />
      {hint && !error && <p className="text-xs text-stone-500 mt-1">{hint}</p>}
      {error && <p className="text-sm text-red-700 mt-1">{error}</p>}
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={`text-[11px] tracking-[0.2em] uppercase ${strong ? "text-stone-700" : "text-stone-500"}`}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "text-stone-900" : "text-sm text-stone-800"}`}>{value}</dd>
    </div>
  );
}
