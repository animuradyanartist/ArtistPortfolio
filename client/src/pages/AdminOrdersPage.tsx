/**
 * ADMIN — ORDERS.
 *
 * Deliberately a table and not a dashboard: what she needs on this screen is who bought what,
 * whether the money arrived, and what she still has to do about it.
 */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@shared/commerce/orderStatus";

interface Row {
  id: number; reference: string; status: OrderStatus; paymentStatus: string;
  buyerName: string | null; buyerEmail: string | null; artworkTitle: string | null;
  country: string | null; itemsFormatted: string | null; shippingFormatted: string | null;
  totalFormatted: string | null; createdAt: string;
}

export default function AdminOrdersPage() {
  const { data: orders, isLoading, error } = useQuery<Row[]>({ queryKey: ["/api/admin/orders"] });
  const { data: status } = useQuery<{ stripeMode: string; webhookSecretConfigured: boolean }>({
    queryKey: ["/api/admin/commerce/status"],
  });

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

        {/* Says out loud whether payment is actually live, so she never has to guess. */}
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

        {isLoading && <p className="text-stone-500">Loading…</p>}
        {error && <p className="text-red-700">Could not load orders.</p>}
        {orders && orders.length === 0 && <p className="text-stone-500">No orders yet.</p>}

        {orders && orders.length > 0 && (
          <div className="overflow-x-auto bg-white border border-stone-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-stone-100 text-left">
                <tr>
                  {["Order","Buyer","Work","Amount","Shipping","Total","Country","Payment","Status","Created"].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium text-stone-600 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-t border-stone-200 hover:bg-stone-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/admin/orders/${o.id}`}><a className="text-stone-900 border-b border-stone-300">{o.reference}</a></Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-stone-900">{o.buyerName ?? "—"}</div>
                      <div className="text-stone-500 text-xs">{o.buyerEmail ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 text-stone-800">{o.artworkTitle ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{o.itemsFormatted ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{o.shippingFormatted ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums font-medium">{o.totalFormatted ?? "—"}</td>
                    <td className="px-4 py-3">{o.country ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={o.paymentStatus === "paid" ? "text-emerald-700" : o.paymentStatus === "failed" ? "text-red-700" : "text-stone-500"}>
                        {o.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3">{ORDER_STATUS_LABEL[o.status] ?? o.status}</td>
                    <td className="px-4 py-3 text-stone-500 whitespace-nowrap">
                      {new Date(o.createdAt).toLocaleDateString("en-GB")}
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
