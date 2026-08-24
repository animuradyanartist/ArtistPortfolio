/**
 * AFTER PAYMENT — the premium confirmation, and careful about what it claims.
 *
 * Landing here means Stripe redirected the browser. It does NOT mean money moved: the redirect
 * is a navigation, and a person can reach this URL by pressing back, refreshing, or pasting a
 * link. So this page reads OUR order row — written only by a signature-verified webhook — and
 * says exactly what that row says. It polls briefly while the webhook and redirect race.
 *
 * The durable tracking link is returned by the API only when the `session_id` from Stripe's
 * redirect matches this order, so a stranger who guesses a reference never gets one.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Eyebrow } from "@/components/editorial";
import { ArtworkHeader, ExceptionBanner, OrderTimeline, ShipmentPanel, StudioNote } from "@/components/orderJourney";
import { useCart } from "@/lib/cart";
import { trackPurchaseOnce } from "@/lib/commerceAnalytics";
import { minorFromFormatted, nextUpdateHint, type OrderView } from "@/lib/orderView";

export default function OrderConfirmationPage() {
  const { reference } = useParams<{ reference: string }>();
  const search = useSearch();
  const sessionId = useMemo(() => new URLSearchParams(search).get("session_id") ?? "", [search]);
  const cart = useCart();
  const [tries, setTries] = useState(0);

  const { data } = useQuery<OrderView>({
    queryKey: ["/api/commerce/order", reference, sessionId],
    queryFn: async () => {
      const qs = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
      const r = await fetch(`/api/commerce/order/${encodeURIComponent(reference)}${qs}`);
      if (!r.ok) throw new Error("not found");
      return r.json();
    },
    // Poll only while payment is still unconfirmed, and only for about a minute.
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
      trackPurchaseOnce({
        reference: data.reference,
        totalMinor: minorFromFormatted(data.totalFormatted),
        shippingMinor: minorFromFormatted(data.shippingFormatted),
        currency: data.currency || "EUR",
        items: data.artwork?.id ? [{ id: data.artwork.id, title: data.artwork.title ?? "" }] : [],
      });
      if (data.artwork?.id) cart.remove(data.artwork.id);
    }
  }, [data, cart]);

  if (!data) return <Shell><p className="text-stone-500">Looking up your order…</p></Shell>;

  const paid = data.paymentStatus === "paid";
  const destination = [data.destination.city, data.destination.country].filter(Boolean).join(", ");
  const heading =
    data.phase === "refunded" ? "Your order has been refunded."
    : data.phase === "cancelled" ? "This order was cancelled."
    : data.phase === "payment_failed" ? "Payment didn't go through."
    : paid ? `Thank you${data.buyerFirstName ? `, ${data.buyerFirstName}` : ""}.`
    : "Almost there.";
  const intro =
    data.phase !== "normal" ? null
    : paid
      ? "Your painting is now yours. I'll prepare it with care in my Yerevan studio and keep you updated at every step from here to your door."
      : "I'm confirming your payment with the bank. This page will update on its own — there's no need to pay again.";

  return (
    <Shell>
      <div className="max-w-2xl">
        <h1 className="font-playfair text-4xl md:text-5xl text-stone-900 mb-4">{heading}</h1>
        {intro && <p className="text-stone-700 leading-relaxed mb-10">{intro}</p>}

        <ExceptionBanner o={data} />
        <ArtworkHeader o={data} />

        <dl className="border-t border-stone-300">
          <Row label="Order" value={data.reference} />
          <Row label="Artwork" value={data.itemsFormatted ?? "—"} />
          <Row label="Shipping" value={data.shippingFormatted ?? (data.itemsFormatted ? "Included" : "—")} />
          <Row label="Total paid" value={data.totalFormatted ?? "—"} strong />
          <Row label="Payment" value={paid ? "Confirmed" : "Confirming"} />
          <Row label="Status" value={data.statusLabel} />
          {destination && <Row label="Shipping to" value={destination} />}
        </dl>

        {data.phase === "normal" && (
          <div className="mt-10 border-t border-stone-300 pt-8">
            <p className="text-[11px] tracking-[0.2em] uppercase text-stone-500 mb-3">What happens next</p>
            <p className="text-sm text-stone-700 leading-relaxed">{nextUpdateHint(data)}</p>
          </div>
        )}

        {paid && <OrderTimeline o={data} />}
        <ShipmentPanel o={data} />
        <StudioNote o={data} />

        <div className="mt-12 flex flex-wrap items-center gap-4">
          {data.trackingToken ? (
            <Link
              href={`/track/${data.trackingToken}`}
              className="inline-block bg-[#26221c] px-8 py-3 text-[11px] tracking-[0.2em] uppercase text-[#f5f1ea] hover:bg-stone-800 transition-colors"
            >
              Track your order
            </Link>
          ) : paid ? (
            <p className="text-sm text-stone-500">Your tracking link is in your confirmation email.</p>
          ) : null}
          <Link
            href="/artworks"
            className="inline-block border border-stone-800 px-8 py-3 text-[11px] tracking-[0.2em] uppercase text-stone-900 hover:bg-stone-900 hover:text-stone-50 transition-colors"
          >
            Back to the paintings
          </Link>
        </div>
      </div>
    </Shell>
  );
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

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-6 border-b border-stone-300 py-4">
      <dt className="text-[11px] tracking-[0.2em] uppercase text-stone-500">{label}</dt>
      <dd className={`text-right tabular-nums ${strong ? "text-base font-medium text-stone-900" : "text-sm text-stone-800"}`}>{value}</dd>
    </div>
  );
}
