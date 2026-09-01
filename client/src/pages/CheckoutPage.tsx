/**
 * CHECKOUT — one dedicated page for BOTH an original artwork and a fine-art print.
 *
 * No card field appears anywhere in this file, or anywhere in this codebase. The form collects a
 * name and an address; payment happens on Stripe's own page, which is why card data never touches
 * this server and why PCI scope stays where it belongs.
 *
 * ONE ITEM PER CHECKOUT (the backend is one-item-per-order by design). The item is identified by the
 * URL — `?artwork=<id>` for an original, or `?variant=<id>&qty=<n>` for a print — and NOTHING about
 * price or fulfilment travels in the URL. The summary and the charge are BOTH resolved by the server:
 * what is shown here is a preview of the server's answer, never the input to it. A tampered
 * client-side price cannot change what is charged.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "@/lib/cart";
import { Eyebrow } from "@/components/editorial";
import { countryOptions, displayCountry } from "@/lib/countries";
import { readAttribution, trackBeginCheckout } from "@/lib/commerceAnalytics";

const REGION_REQUIRED = new Set(["US", "CA", "AU"]);

function money(minor: number, currency: string): string {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100); }
  catch { return `${(minor / 100).toFixed(2)} ${currency}`; }
}

interface OriginalValidate {
  checkoutEnabled: boolean;
  items: Array<{ id: number; title: string; dimensions: string; imageUrl: string; priceFormatted: string | null; purchasable: boolean }>;
  totals: null | { ok: true; itemsFormatted: string; shippingFormatted: string; totalFormatted: string; shippingEstimated: boolean; dutiesMayApply: boolean; totalMinor: number; shippingMinor: number; currency: string } | { ok: false };
}
interface PrintQuote {
  available: boolean; reason?: string; checkoutEnabled?: boolean;
  title: string; itemKind: string; materialLabel: string; sizeLabel: string; imageUrl: string | null;
  unitMinor: number | null; quantity: number; itemsMinor: number; currency: string;
  shippingMinor?: number; totalMinor?: number;
}

export default function CheckoutPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const cart = useCart();
  const params = new URLSearchParams(search);
  const artworkId = Number.parseInt(params.get("artwork") ?? "", 10);
  const variantId = Number.parseInt(params.get("variant") ?? "", 10);
  const qtyRaw = Number.parseInt(params.get("qty") ?? "1", 10);
  const quantity = Number.isInteger(qtyRaw) ? Math.min(10, Math.max(1, qtyRaw)) : 1;
  const isPrint = Number.isInteger(variantId) && variantId > 0;
  const isOriginal = !isPrint && Number.isInteger(artworkId) && artworkId > 0;

  const [country, setCountry] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", address1: "", address2: "", city: "", region: "", postalCode: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => { setCountry(displayCountry(cart.country)); }, [cart.country]);

  // ── ORIGINAL: validate + price via the cart endpoint ──
  const originalQ = useQuery<OriginalValidate>({
    queryKey: ["/api/commerce/cart/validate", artworkId, country],
    enabled: isOriginal && Boolean(country),
    queryFn: async () => {
      const r = await fetch("/api/commerce/cart/validate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artworkIds: [artworkId], country }),
      });
      if (!r.ok) throw new Error("validate failed");
      return r.json();
    },
  });

  // ── PRINT: server-resolved display + shipping via the print quote endpoint (fail-closed) ──
  const printQ = useQuery<PrintQuote>({
    queryKey: ["/api/commerce/prints/quote", variantId, quantity, country],
    enabled: isPrint,
    queryFn: async () => {
      const r = await fetch("/api/commerce/prints/quote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, quantity, country: country ?? "" }),
      });
      if (!r.ok) throw new Error("quote failed");
      return r.json();
    },
  });

  // A single normalised summary the aside renders, whichever kind this is.
  const summary = useMemo(() => {
    if (isPrint) {
      const d = printQ.data;
      if (!d || !d.title) return null;
      return {
        kind: "print" as const, title: d.title, imageUrl: d.imageUrl, dimensions: null as string | null,
        itemKind: "Fine Art Print", materialLabel: d.materialLabel, sizeLabel: d.sizeLabel, quantity: d.quantity,
        itemsFormatted: d.itemsMinor != null ? money(d.itemsMinor, d.currency) : null,
        shippingFormatted: d.shippingMinor != null ? money(d.shippingMinor, d.currency) : null,
        totalFormatted: d.totalMinor != null ? money(d.totalMinor, d.currency) : null,
        shippingEstimated: false, dutiesMayApply: true,
        ready: d.available === true, totalMinor: d.totalMinor ?? null, currency: d.currency,
      };
    }
    const item = originalQ.data?.items?.[0];
    const totals = originalQ.data?.totals && "ok" in originalQ.data.totals && originalQ.data.totals.ok ? originalQ.data.totals : null;
    if (!item) return null;
    return {
      kind: "original" as const, title: item.title, imageUrl: item.imageUrl, dimensions: item.dimensions,
      itemKind: "Original artwork", materialLabel: null as string | null, sizeLabel: null as string | null, quantity: 1,
      itemsFormatted: totals?.itemsFormatted ?? null,
      shippingFormatted: totals?.shippingFormatted ?? null,
      totalFormatted: totals?.totalFormatted ?? null,
      shippingEstimated: Boolean(totals?.shippingEstimated), dutiesMayApply: Boolean(totals?.dutiesMayApply),
      ready: Boolean(totals), totalMinor: totals?.totalMinor ?? null, currency: totals?.currency ?? "EUR",
    };
  }, [isPrint, printQ.data, originalQ.data]);

  const checkoutEnabled = isPrint ? printQ.data?.checkoutEnabled : originalQ.data?.checkoutEnabled;

  const begun = useMemo(() => ({ done: false }), [artworkId, variantId]);
  useEffect(() => {
    if (summary?.ready && summary.totalMinor != null && !begun.done) {
      begun.done = true;
      trackBeginCheckout([{ id: isPrint ? variantId : artworkId, title: summary.title }], summary.totalMinor, summary.currency);
    }
  }, [summary, begun, isPrint, variantId, artworkId]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setFailure(null); setErrors({});
    // The server owns validation; we send name as a single field (buyer_name is one column) and let
    // the server be the rule. Phone is optional end-to-end.
    const buyer = {
      name: `${form.firstName} ${form.lastName}`.trim(),
      email: form.email, phone: form.phone, country,
      address1: form.address1, address2: form.address2, city: form.city, region: form.region, postalCode: form.postalCode,
    };
    try {
      const payload = isPrint
        ? { print: { variantId, quantity }, buyer, attribution: { ...(readAttribution() ?? {}), printPath: `/prints` } }
        : { artworkIds: [artworkId], buyer, attribution: { ...(readAttribution() ?? {}), artworkPath: `/artworks/${artworkId}` } };
      const r = await fetch("/api/commerce/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const body = await r.json().catch(() => ({}));
      if (r.ok && body.url) {
        // Leaving for Stripe. The cart line is cleared on the confirmation page, not here — an
        // abandoned payment must not lose the item from the cart.
        window.location.href = body.url as string;
        return;
      }
      // Server errors are keyed by `name/email/…`; map the single `name` error onto both name fields.
      if (body.errors) {
        const errs = body.errors as Record<string, string>;
        if (errs.name) { errs.firstName = errs.name; }
        setErrors(errs);
      }
      setFailure((body.message as string) ?? "Checkout could not be started.");
    } catch {
      setFailure("Checkout could not be started. Nothing has been charged.");
    } finally {
      setSubmitting(false);
    }
  };

  // Payment unconfigured (a pasted URL cannot know that) → collect no address it cannot use.
  if (checkoutEnabled === false) {
    return (
      <Shell>
        <p className="text-stone-700 max-w-prose leading-relaxed">
          Online payment is not open yet. Please{" "}
          <Link href="/contact" className="border-b border-stone-400 hover:border-stone-800">enquire about this work</Link>{" "}
          and Ani will arrange the purchase with you directly.
        </p>
      </Shell>
    );
  }

  if (!isPrint && !isOriginal) {
    return <Shell><p className="text-stone-600">No item selected. <Link href="/prints" className="border-b border-stone-400">Browse the prints</Link> or the <Link href="/artworks" className="border-b border-stone-400">paintings</Link>.</p></Shell>;
  }

  return (
    <Shell>
      <div className="grid gap-12 lg:grid-cols-[1fr_360px]">
        <form onSubmit={submit} className="space-y-6" noValidate>
          <h2 className="font-playfair text-2xl text-stone-900">Where should it go?</h2>

          <Field label="Email" type="email" value={form.email} onChange={set("email")} error={errors.email} autoComplete="email" />
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="First name" value={form.firstName} onChange={set("firstName")} error={errors.firstName} autoComplete="given-name" />
            <Field label="Last name" value={form.lastName} onChange={set("lastName")} error={errors.lastName} autoComplete="family-name" />
          </div>

          <div>
            <label className="block text-[11px] tracking-[0.2em] uppercase text-stone-500 mb-2">Country</label>
            <select
              className="w-full bg-transparent border-b border-stone-300 focus:border-stone-800 focus:outline-none py-2 text-stone-900"
              value={country ?? ""} onChange={(e) => { setCountry(e.target.value); cart.setCountry(e.target.value); }}>
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
          <Field label="Phone (optional)" value={form.phone} onChange={set("phone")} error={errors.phone} autoComplete="tel"
            hint="Optional — only used if the courier needs to reach you about delivery." />

          {failure && <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded">{failure}</p>}

          <button type="submit" disabled={submitting || !summary?.ready}
            className="inline-block bg-stone-900 text-stone-50 px-8 py-3 text-[11px] tracking-[0.2em] uppercase hover:bg-stone-700 transition-colors disabled:opacity-50">
            {submitting ? "Taking you to payment…" : "Continue to payment"}
          </button>
          {!summary?.ready && country && (
            <p className="text-xs text-stone-500">We couldn't get a live shipping quote to that destination. Please try another address or contact us.</p>
          )}
          <p className="text-xs text-stone-500">Payment is handled by Stripe. Your card details never reach this website.</p>
        </form>

        <aside className="lg:border-l lg:border-stone-300 lg:pl-10">
          {summary && (
            <>
              {summary.imageUrl && (
                <div className="aspect-[3/2] overflow-hidden bg-stone-200/60 mb-4">
                  <img src={summary.imageUrl} alt={summary.title} className="w-full h-full object-cover" />
                </div>
              )}
              <p className="text-[11px] tracking-[0.2em] uppercase text-stone-500">{summary.itemKind}</p>
              <h3 className="font-playfair text-xl text-stone-900 mt-1">{summary.title}</h3>
              {summary.kind === "original" && summary.dimensions && (
                <p className="text-sm text-stone-600 mb-6">{summary.dimensions}</p>
              )}
              {summary.kind === "print" && (
                <p className="text-sm text-stone-600 mb-6">{summary.materialLabel} · {summary.sizeLabel}{summary.quantity > 1 ? ` · Qty ${summary.quantity}` : ""}</p>
              )}
            </>
          )}
          {summary?.ready ? (
            <dl className="space-y-3 border-t border-stone-300 pt-4">
              <Line label={summary.kind === "print" ? "Print" : "Work"} value={summary.itemsFormatted ?? ""} />
              <Line label={summary.shippingEstimated ? "Estimated shipping" : "Shipping"} value={summary.shippingFormatted ?? ""} />
              <div className="border-t border-stone-300 pt-3"><Line label="Total" value={summary.totalFormatted ?? ""} strong /></div>
              {summary.dutiesMayApply && (
                <p className="text-xs text-stone-500 leading-relaxed pt-2">
                  Import duties or taxes charged by your country are not included and are payable on delivery.
                </p>
              )}
            </dl>
          ) : summary ? (
            <div className="border-t border-stone-300 pt-4">
              {summary.itemsFormatted && <Line label={summary.kind === "print" ? "Print" : "Work"} value={summary.itemsFormatted} />}
              <p className="text-xs text-stone-500 mt-3">Choose your country to see shipping and the total.</p>
            </div>
          ) : null}
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
