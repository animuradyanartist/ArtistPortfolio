/**
 * THE SECURE TRACKING PAGE — reached only by the unguessable token, never by a sequential id.
 *
 * The token in the URL is the proof of access; the API returns only the buyer-safe view (no
 * street address, email, phone, Stripe id, or internal note). An invalid or unknown token gets
 * a calm "not found", not a hint that some other order exists.
 */
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Eyebrow } from "@/components/editorial";
import { ArtworkHeader, ExceptionBanner, OrderTimeline, ShipmentPanel, StudioNote } from "@/components/orderJourney";
import { formatDate, nextUpdateHint, type OrderView } from "@/lib/orderView";

const SUPPORT_EMAIL = "animuradyan.artist@gmail.com";

export default function TrackOrderPage() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, error } = useQuery<OrderView>({
    queryKey: ["/api/commerce/track", token],
    queryFn: async () => {
      const r = await fetch(`/api/commerce/track/${encodeURIComponent(token)}`);
      if (!r.ok) throw new Error("not-found");
      return r.json();
    },
    retry: false,
    // While it's in transit, a gentle refresh keeps the page live without hammering.
    refetchInterval: (q) => {
      const d = q.state.data as OrderView | undefined;
      return d && (d.status === "shipped" || d.status === "preparing" || d.status === "packed") ? 60000 : false;
    },
  });

  if (isLoading) return <Shell><p className="text-stone-500">Looking up your order…</p></Shell>;

  if (error || !data) {
    return (
      <Shell>
        <div className="max-w-xl">
          <h1 className="font-playfair text-3xl md:text-4xl text-stone-900 mb-4">We couldn't find that order.</h1>
          <p className="text-stone-600 leading-relaxed mb-8">
            This tracking link may be incomplete or out of date. Please use the most recent link
            from your confirmation email, or write to me and I'll help right away.
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-block border border-stone-800 px-6 py-3 text-[11px] tracking-[0.2em] uppercase text-stone-900 hover:bg-stone-900 hover:text-stone-50 transition-colors"
          >
            Contact Ani
          </a>
        </div>
      </Shell>
    );
  }

  const destination = [data.destination.city, data.destination.country].filter(Boolean).join(", ");
  const placed = formatDate(data.createdAt);

  return (
    <Shell>
      <div className="max-w-2xl">
        <h1 className="font-playfair text-4xl md:text-5xl text-stone-900 mb-2">Your order</h1>
        <p className="text-stone-500 mb-10 tabular-nums">
          {data.reference}{placed ? ` · placed ${placed}` : ""}
        </p>

        <ExceptionBanner o={data} />
        <ArtworkHeader o={data} />

        <div className="border-t border-stone-300 pt-8">
          <p className="text-[11px] tracking-[0.2em] uppercase text-stone-500 mb-2">Current status</p>
          <p className="font-playfair text-2xl text-stone-900">{data.statusLabel}</p>
          <p className="text-sm text-stone-700 leading-relaxed mt-3">{nextUpdateHint(data)}</p>
        </div>

        <OrderTimeline o={data} />
        <ShipmentPanel o={data} />
        <StudioNote o={data} />

        <div className="mt-10 border-t border-stone-300 pt-8">
          <dl className="space-y-3">
            {data.totalFormatted && <SummaryRow label="Total paid" value={data.totalFormatted} />}
            {destination && <SummaryRow label="Shipping to" value={destination} />}
          </dl>
        </div>

        <div className="mt-12 border-t border-stone-300 pt-8">
          <p className="text-sm text-stone-600 leading-relaxed">
            Any question at all — the piece, the timing, anything — just email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-stone-900 border-b border-stone-400 hover:border-stone-800">{SUPPORT_EMAIL}</a>.
            I read every message myself.
          </p>
          <Link
            href="/artworks"
            className="mt-6 inline-block border border-stone-800 px-6 py-3 text-[11px] tracking-[0.2em] uppercase text-stone-900 hover:bg-stone-900 hover:text-stone-50 transition-colors"
          >
            View more paintings
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
        <Eyebrow>Order tracking</Eyebrow>
        {children}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6">
      <dt className="text-[11px] tracking-[0.2em] uppercase text-stone-500">{label}</dt>
      <dd className="text-sm text-right text-stone-800 tabular-nums">{value}</dd>
    </div>
  );
}
