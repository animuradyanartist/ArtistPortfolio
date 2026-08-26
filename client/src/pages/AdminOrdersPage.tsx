/**
 * ADMIN — ORDERS.
 *
 * Deliberately a table and not a dashboard: what she needs on this screen is who bought what,
 * whether the money arrived, and what she still has to do about it. Filters and search run over
 * the fetched list (the volume is small, and it keeps the server simple).
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@shared/commerce/orderStatus";

interface Row {
  id: number; reference: string; status: OrderStatus; paymentStatus: string;
  buyerName: string | null; buyerEmail: string | null;
  artworkTitle: string | null; artworkImage: string | null; artworkId: number | null;
  country: string | null; itemsFormatted: string | null; shippingFormatted: string | null;
  totalFormatted: string | null; carrier: string | null; tracking: string | null;
  exceptionState: string | null; createdAt: string;
  // print fulfilment (null on original-artwork orders)
  itemType?: string; fulfilmentProvider?: string | null; fulfilmentStatus?: string | null;
  fulfilmentError?: string | null; prodigiOrderId?: string | null;
}

/** A paid PRINT order that has not reached a healthy provider state yet — the thing to surface. */
function printNeedsAttention(o: Row): boolean {
  return (
    o.itemType === "print" &&
    o.paymentStatus === "paid" &&
    (o.fulfilmentStatus == null ||
      ["pending", "config_missing", "failed"].includes(o.fulfilmentStatus))
  );
}

type Bucket = "all" | "new" | "preparing" | "packed" | "shipped" | "delivered" | "closed";
const BUCKETS: { key: Bucket; label: string; match: (o: Row) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "new", label: "New / Paid", match: (o) => o.status === "paid" },
  { key: "preparing", label: "Preparing", match: (o) => o.status === "preparing" },
  { key: "packed", label: "Packed", match: (o) => o.status === "packed" },
  { key: "shipped", label: "Shipped", match: (o) => o.status === "shipped" },
  { key: "delivered", label: "Delivered", match: (o) => o.status === "delivered" },
  { key: "closed", label: "Cancelled / Refunded", match: (o) => o.status === "cancelled" || o.status === "refunded" },
];

export default function AdminOrdersPage() {
  const { data: orders, isLoading, error } = useQuery<Row[]>({ queryKey: ["/api/admin/orders"] });
  const { data: status } = useQuery<{ stripeMode: string; webhookSecretConfigured: boolean }>({
    queryKey: ["/api/admin/commerce/status"],
  });

  const [bucket, setBucket] = useState<Bucket>("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const b of BUCKETS) c[b.key] = (orders ?? []).filter(b.match).length;
    return c;
  }, [orders]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const fromT = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toT = to ? new Date(`${to}T23:59:59`).getTime() : null;
    const bucketMatch = BUCKETS.find((b) => b.key === bucket)?.match ?? (() => true);
    return (orders ?? []).filter((o) => {
      if (!bucketMatch(o)) return false;
      if (needle) {
        const hay = `${o.reference} ${o.buyerName ?? ""} ${o.buyerEmail ?? ""} ${o.artworkTitle ?? ""} ${o.country ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      const t = new Date(o.createdAt).getTime();
      if (fromT != null && t < fromT) return false;
      if (toT != null && t > toT) return false;
      return true;
    });
  }, [orders, bucket, q, from, to]);

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="font-playfair text-3xl text-stone-900">Orders</h1>
            <p className="text-sm text-stone-600 mt-1">Direct sales from the website.</p>
          </div>
          <Link href="/admin"><a className="text-sm text-stone-600 hover:text-stone-900 border-b border-stone-300">Back to admin</a></Link>
        </div>

        {status && (
          <div className={`mb-6 text-sm rounded-md px-4 py-3 ${
            status.stripeMode === "live" ? "bg-emerald-50 text-emerald-900"
            : status.stripeMode === "test" ? "bg-amber-50 text-amber-900"
            : "bg-stone-100 text-stone-700"}`}>
            {status.stripeMode === "unconfigured"
              ? "Payment is not configured — STRIPE_SECRET_KEY has not been added, so the website cannot take card payments yet."
              : `Stripe is in ${status.stripeMode} mode.`}
            {status.stripeMode !== "unconfigured" && !status.webhookSecretConfigured &&
              " Webhook signing secret is missing — payments cannot be confirmed until STRIPE_WEBHOOK_SECRET is set."}
          </div>
        )}

        {/* filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          {BUCKETS.map((b) => (
            <button key={b.key} onClick={() => setBucket(b.key)}
              className={`px-3 py-1.5 text-[11px] tracking-[0.12em] uppercase border transition-colors ${
                bucket === b.key ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-700 border-stone-300 hover:border-stone-500"}`}>
              {b.label}<span className="ml-2 text-stone-400">{counts[b.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3 mb-6">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order, buyer, email, artwork…"
            className="flex-1 min-w-[220px] border border-stone-300 rounded px-3 py-2 text-sm" />
          <label className="text-xs text-stone-600">From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ml-2 border border-stone-300 rounded px-2 py-1.5 text-sm" /></label>
          <label className="text-xs text-stone-600">To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ml-2 border border-stone-300 rounded px-2 py-1.5 text-sm" /></label>
          {(q || from || to) && (
            <button onClick={() => { setQ(""); setFrom(""); setTo(""); }} className="text-xs text-stone-500 border-b border-stone-300 hover:text-stone-900">Clear</button>
          )}
        </div>

        {isLoading && <p className="text-stone-500">Loading…</p>}
        {error && <p className="text-red-700">Could not load orders.</p>}
        {orders && filtered.length === 0 && <p className="text-stone-500">No orders match these filters.</p>}

        {filtered.length > 0 && (
          <div className="overflow-x-auto bg-white border border-stone-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-stone-100 text-left">
                <tr>
                  {["Order","Date","Work","Buyer","Country","Amount","Shipping","Total","Payment","Status","Tracking"].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium text-stone-600 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} className="border-t border-stone-200 hover:bg-stone-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/admin/orders/${o.id}`}><a className="text-stone-900 border-b border-stone-300">{o.reference}</a></Link>
                    </td>
                    <td className="px-4 py-3 text-stone-500 whitespace-nowrap">{new Date(o.createdAt).toLocaleDateString("en-GB")}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {o.artworkImage
                          ? <img src={o.artworkImage} alt="" className="h-9 w-9 object-cover border border-stone-200" loading="lazy" />
                          : <span className="h-9 w-9 bg-stone-100 border border-stone-200 inline-block" />}
                        <span className="text-stone-800">{o.artworkTitle ?? "—"}</span>
                        {o.itemType === "print" && (
                          <span className="text-[9px] font-semibold tracking-wide uppercase bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">Print</span>
                        )}
                      </div>
                      {printNeedsAttention(o) && (
                        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                          Paid · unfulfilled{o.fulfilmentStatus ? ` (${o.fulfilmentStatus})` : ""}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-stone-900">{o.buyerName ?? "—"}</div>
                      <div className="text-stone-500 text-xs">{o.buyerEmail ?? ""}</div>
                    </td>
                    <td className="px-4 py-3">{o.country ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{o.itemsFormatted ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{o.shippingFormatted ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums font-medium">{o.totalFormatted ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={o.paymentStatus === "paid" ? "text-emerald-700" : o.paymentStatus === "failed" ? "text-red-700" : "text-stone-500"}>
                        {o.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {ORDER_STATUS_LABEL[o.status] ?? o.status}
                      {o.exceptionState && <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600">!</span>}
                    </td>
                    <td className="px-4 py-3 text-stone-600 whitespace-nowrap">
                      {o.tracking ? `${o.carrier ? o.carrier + " " : ""}${o.tracking}` : <span className="text-stone-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
