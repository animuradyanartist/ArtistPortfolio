/**
 * AFTER PAYMENT — and careful about what it claims.
 *
 * Landing here means Stripe redirected the browser. It does NOT mean money moved: the redirect
 * is a navigation, and a person can reach this URL by pressing back, refreshing, or pasting a
 * link. So this page reads OUR order row — written only by a signature-verified webhook — and
 * says exactly what that row says.
 *
 * The webhook and the redirect race, and either can win. When the redirect arrives first the
 * row still reads `unpaid`, which is why this polls briefly and says "confirming" rather than
 * either lying that it is done or alarming somebody whose payment is fine.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Eyebrow } from "@/components/editorial";
import { useCart } from "@/lib/cart";
import { trackPurchaseOnce } from "@/lib/commerceAnalytics";

interface OrderView {
  reference: string; status: string; paymentStatus: string;
  artwork: { id: number; title: string; dimensions: string; image: string } | null;
  itemsFormatted: string | null; shippingFormatted: string | null; totalFormatted: string | null;
  ship: { name: string | null; country: string | null; city: string | null; address1: string | null;
    address2: string | null; region: string | null; postalCode: string | null };
  carrier: string | null; tracking: string | null;
}

export default function OrderConfirmationPage() {
  const { reference } = useParams<{ reference: string }>();
  const cart = useCart();
  const [tries, setTries] = useState(0);

  const { data } = useQuery<OrderView>({
    queryKey: ["/api/commerce/order", reference],
    queryFn: async () => {
      const r = await fetch(`/api/commerce/order/${encodeURIComponent(reference)}`);
      if (!r.ok) throw new Error("not found");
      return r.json();
    },
    // Poll only while payment is still unconfirmed, and only for about a minute — a webhook
    // that has not arrived by then is an operational matter, not something to spin on.
    refetchInterval: (q) => {
      const d = q.state.data as OrderView | undefined;
      return d && d.paymentStatus === "unpaid" && tries < 20 ? 3000 : false;
    },
  });

  useEffect(() => { if (data?.paymentStatus === "unpaid") setTries((t) => t + 1); }, [data]);

  const fired = useRef(false);
  useEffect(() => {
    if (data?.paymentStatus === "paid" && !fired.current) {
      fired.current = true;
      // Only now, and only once per reference even across refreshes.
      trackPurchaseOnce({
        reference: data.reference,
        totalMinor: money(data.totalFormatted), shippingMinor: money(data.shippingFormatted),
        currency: "EUR",
        items: data.artwork ? [{ id: data.artwork.id, title: data.artwork.title }] : [],
      });
      if (data.artwork) cart.remove(data.artwork.id);
    }
  }, [data, cart]);

  if (!data) {
    return <Shell><p className="text-stone-500">Looking up your order…</p></Shell>;
  }

  const paid = data.paymentStatus === "paid";

  return (
    <Shell>
      <div className="max-w-2xl">
        <h1 className="font-playfair text-4xl md:text-5xl text-stone-900 mb-4">
          {paid ? "Thank you." : "Almost there."}
        </h1>
        <p className="text-stone-700 leading-relaxed mb-10">
          {paid
            ? "Your payment has been received and the painting is now yours. Ani will be in touch about crating and collection."
            : "We are confirming your payment with the bank. This page will update on its own — there is no need to pay again."}
        </p>

        <dl className="border-t border-stone-300">
          <Row label="Order" value={data.reference} />
          {data.artwork && <Row label="Work" value={data.artwork.title} />}
          {data.artwork && <Row label="Dimensions" value={data.artwork.dimensions} />}
          <Row label="Work price" value={data.itemsFormatted ?? "—"} />
          <Row label="Shipping" value={data.shippingFormatted ?? "—"} />
          <Row label="Total" value={data.totalFormatted ?? "—"} />
          <Row label="Payment" value={paid ? "Received" : "Confirming"} />
          {data.tracking && <Row label="Tracking" value={`${data.carrier ?? ""} ${data.tracking}`.trim()} />}
        </dl>

        <div className="mt-10">
          <p className="text-[11px] tracking-[0.2em] uppercase text-stone-500 mb-3">Shipping to</p>
          <p className="text-sm text-stone-800 leading-relaxed">
            {[data.ship.name, data.ship.address1, data.ship.address2, data.ship.city,
              data.ship.region, data.ship.postalCode, data.ship.country].filter(Boolean).join(", ")}
          </p>
        </div>

        <div className="mt-10 border-t border-stone-300 pt-8">
          <p className="text-[11px] tracking-[0.2em] uppercase text-stone-500 mb-3">What happens next</p>
          <p className="text-sm text-stone-700 leading-relaxed">
            The work is crated by hand in Yerevan and dispatched by courier. Ani will email you
            with the tracking number once it is on its way. Import duties or taxes charged by
            your country are payable on delivery.
          </p>
        </div>

        <Link href="/artworks" className="mt-10 inline-block border border-stone-800 px-8 py-3 text-[11px] tracking-[0.2em] uppercase text-stone-900 hover:bg-stone-900 hover:text-stone-50 transition-colors">Back to the paintings</Link>
      </div>
    </Shell>
  );
}

/** The formatted strings are what the API returns; this recovers minor units for analytics. */
function money(formatted: string | null): number {
  if (!formatted) return 0;
  const n = Number(formatted.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      <div className="mx-auto max-w-4xl px-6 py-16 md:py-24">
        <Eyebrow>Order</Eyebrow>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 border-b border-stone-300 py-4">
      <dt className="text-[11px] tracking-[0.2em] uppercase text-stone-500">{label}</dt>
      <dd className="text-sm text-right text-stone-800 tabular-nums">{value}</dd>
    </div>
  );
}
