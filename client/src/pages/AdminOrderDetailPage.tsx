/**
 * ADMIN — ONE ORDER, and the few things she may safely do to it.
 *
 * The actions offered are only those the state machine permits from the current status, and
 * payment is not among them anywhere: `paid` and `refunded` are excluded from ADMIN_SETTABLE
 * by construction, because whether money arrived is Stripe's fact and not a button.
 */
import { useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@shared/commerce/orderStatus";

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const key = ["/api/admin/orders", id];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: o, isLoading } = useQuery<any>({
    queryKey: key,
    queryFn: async () => { const r = await fetch(`/api/admin/orders/${id}`); if (!r.ok) throw new Error(); return r.json(); },
  });

  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");

  const setStatus = useMutation({
    mutationFn: async (status: OrderStatus) => {
      const r = await fetch(`/api/admin/orders/${id}/status`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? "failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const saveTracking = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/admin/orders/${id}/tracking`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carrier: carrier || o?.shipping_carrier, trackingNumber: tracking || o?.tracking_number }),
      });
      if (!r.ok) throw new Error("failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  if (isLoading) return <Shell><p className="text-stone-500">Loading…</p></Shell>;
  if (!o) return <Shell><p className="text-red-700">Order not found.</p></Shell>;

  const snap = o.artworkSnapshot as { title?: string; dimensions?: string; medium?: string } | null;
  const calc = o.shippingCalculation as Array<{ quote?: { breakdown?: { chargeableWeightKg?: number }; parcel?: { packedWidthCm: number; packedHeightCm: number; packedDepthCm: number }; estimated?: boolean; basis?: string } }> | null;
  const q = calc?.[0]?.quote;

  return (
    <Shell>
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="font-playfair text-3xl text-stone-900">{o.reference}</h1>
          <p className="text-sm text-stone-600 mt-1">
            {ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status} · payment {o.payment_status}
          </p>
        </div>
        <Link href="/admin/orders"><a className="text-sm text-stone-600 border-b border-stone-300">All orders</a></Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card title="Buyer">
          <Row k="Name" v={o.buyer_name} /><Row k="Email" v={o.buyer_email} /><Row k="Phone" v={o.buyer_phone} />
        </Card>
        <Card title="Ship to">
          <Row k="Address" v={[o.ship_address1, o.ship_address2].filter(Boolean).join(", ")} />
          <Row k="City" v={o.ship_city} /><Row k="Region" v={o.ship_region} />
          <Row k="Postal code" v={o.ship_postal_code} /><Row k="Country" v={o.ship_country} />
        </Card>
        <Card title="Purchase snapshot">
          <Row k="Work" v={snap?.title} /><Row k="Dimensions" v={snap?.dimensions} />
          <Row k="Work price" v={o.itemsFormatted} /><Row k="Shipping" v={o.shippingFormatted} />
          <Row k="Total" v={o.totalFormatted} /><Row k="Currency" v={o.currency} />
        </Card>
        <Card title="Shipping calculation">
          <Row k="Basis" v={o.shipping_basis} />
          <Row k="Chargeable weight" v={q?.breakdown?.chargeableWeightKg ? `${q.breakdown.chargeableWeightKg} kg` : "—"} />
          <Row k="Packed size" v={q?.parcel ? `${q.parcel.packedWidthCm}×${q.parcel.packedHeightCm}×${q.parcel.packedDepthCm} cm` : "—"} />
          <Row k="Estimated" v={q?.estimated ? "Yes — not a carrier quote" : "No — manual figure"} />
        </Card>
        <Card title="Stripe">
          <Row k="Checkout session" v={o.stripe_checkout_session_id} />
          <Row k="Payment intent" v={o.stripe_payment_intent_id} />
          <Row k="Paid at" v={o.paid_at ? new Date(o.paid_at).toLocaleString("en-GB") : "—"} />
        </Card>
        <Card title="Attribution">
          {o.attribution
            ? Object.entries(o.attribution as Record<string, string>).map(([k, v]) => <Row key={k} k={k} v={v} />)
            : <p className="text-sm text-stone-500">No campaign data recorded.</p>}
        </Card>
      </div>

      <div className="mt-10 bg-white border border-stone-200 rounded-lg p-6">
        <h2 className="font-medium text-stone-900 mb-4">Fulfilment</h2>

        <div className="flex flex-wrap gap-3 mb-6">
          {(o.availableStatuses as OrderStatus[] | undefined)?.length
            ? (o.availableStatuses as OrderStatus[]).map((s) => (
                <button key={s} onClick={() => setStatus.mutate(s)} disabled={setStatus.isPending}
                  className="border border-stone-800 px-5 py-2 text-[11px] tracking-[0.18em] uppercase hover:bg-stone-900 hover:text-white transition-colors disabled:opacity-50">
                  Mark {ORDER_STATUS_LABEL[s]}
                </button>
              ))
            : <p className="text-sm text-stone-500">
                No fulfilment actions available from this state{o.payment_status !== "paid" ? " until payment is confirmed" : ""}.
              </p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs text-stone-600 mb-1">Carrier</label>
            <input className="w-full border border-stone-300 rounded px-3 py-2 text-sm"
              defaultValue={o.shipping_carrier ?? ""} onChange={(e) => setCarrier(e.target.value)} placeholder="FedEx" />
          </div>
          <div>
            <label className="block text-xs text-stone-600 mb-1">Tracking number</label>
            <input className="w-full border border-stone-300 rounded px-3 py-2 text-sm"
              defaultValue={o.tracking_number ?? ""} onChange={(e) => setTracking(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button onClick={() => saveTracking.mutate()} disabled={saveTracking.isPending}
              className="bg-stone-900 text-white px-5 py-2 text-[11px] tracking-[0.18em] uppercase disabled:opacity-50">
              Save tracking
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-stone-50"><div className="mx-auto max-w-5xl px-6 py-10">{children}</div></div>;
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-stone-200 rounded-lg p-5">
      <h2 className="font-medium text-stone-900 mb-3">{title}</h2>
      <dl className="space-y-1">{children}</dl>
    </div>
  );
}
function Row({ k, v }: { k: string; v?: string | null }) {
  return (
    <div className="flex justify-between gap-4 text-sm py-1">
      <dt className="text-stone-500">{k}</dt>
      <dd className="text-stone-900 text-right break-all">{v || "—"}</dd>
    </div>
  );
}
