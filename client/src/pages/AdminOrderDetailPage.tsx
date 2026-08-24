/**
 * ADMIN — ONE ORDER, and everything she may safely do to it.
 *
 * The status moves offered are only those the state machine permits from the current status, and
 * payment is never among them: `paid` and `refunded` are excluded from ADMIN_SETTABLE by
 * construction, because whether money arrived (or was returned) is Stripe's fact and not a
 * button. Marking Shipped/Delivered here sends the matching buyer email automatically.
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@shared/commerce/orderStatus";
import { useToast } from "@/hooks/use-toast";

interface EmailRow { id: number; kind: string; to_email: string | null; subject: string | null; status: string; provider_id: string | null; error: string | null; created_at: string }
interface AuditRow { id: number; action: string; result: string | null; detail: string | null; actor: string | null; created_at: string }

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const key = ["/api/admin/orders", id];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: o, isLoading } = useQuery<any>({
    queryKey: key,
    queryFn: async () => { const r = await fetch(`/api/admin/orders/${id}`); if (!r.ok) throw new Error(); return r.json(); },
  });

  // fulfilment form
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [expDispatch, setExpDispatch] = useState("");
  const [estDelivery, setEstDelivery] = useState("");
  const [custMsg, setCustMsg] = useState("");
  const [notes, setNotes] = useState("");
  const [emailKind, setEmailKind] = useState<"manual" | "delay">("manual");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");

  useEffect(() => {
    if (!o) return;
    setCarrier(o.shipping_carrier ?? "");
    setTracking(o.tracking_number ?? "");
    setTrackingUrl(o.tracking_url ?? "");
    setExpDispatch(toDateInput(o.expected_dispatch_at));
    setEstDelivery(toDateInput(o.estimated_delivery_at));
    setCustMsg(o.customer_message ?? "");
    setNotes(o.internal_notes ?? "");
  }, [o?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function post(path: string, body: unknown) {
    const r = await fetch(`/api/admin/orders/${id}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.message ?? "Something went wrong");
    return data;
  }
  const done = () => qc.invalidateQueries({ queryKey: key });

  const setStatus = useMutation({
    mutationFn: (status: OrderStatus) => post(`/status`, { status }),
    onSuccess: (data: { email?: { status: string } | null }) => {
      done();
      const es = data?.email?.status;
      toast({ title: "Status updated", description: es === "sent" ? "Buyer email sent." : es === "skipped" ? "Status saved (no email sent)." : es === "failed" ? "Status saved, but the email failed — see the email log." : "Saved." });
    },
    onError: (e: Error) => toast({ title: "Couldn't update", description: e.message, variant: "destructive" }),
  });
  const checkPayment = useMutation({
    mutationFn: () => post(`/check-payment`, {}),
    onSuccess: (d: { stripePaymentStatus?: string | null; paymentIntentStatus?: string | null; note?: string }) => {
      done();
      toast({ title: "Stripe checked", description: d?.note ?? `Stripe payment: ${d?.stripePaymentStatus ?? "unknown"}${d?.paymentIntentStatus ? ` · intent ${d.paymentIntentStatus}` : ""}` });
    },
    onError: (e: Error) => toast({ title: "Couldn't check Stripe", description: e.message, variant: "destructive" }),
  });
  const reconcile = useMutation({
    mutationFn: () => post(`/reconcile`, {}),
    onSuccess: (d: { ok?: boolean; wasFirst?: boolean; stripePaymentStatus?: string | null; email?: { status: string } | null }) => {
      done();
      if (d?.ok === false) toast({ title: "Not reconciled", description: `Stripe says this payment is “${d?.stripePaymentStatus ?? "not paid"}”. The order was NOT marked paid.`, variant: "destructive" });
      else if (d?.wasFirst) toast({ title: "Payment reconciled", description: `Order marked paid, artwork sold, confirmation email: ${d?.email?.status ?? "n/a"}.` });
      else toast({ title: "Already paid", description: "Stripe confirms paid; the order was already paid — no change." });
    },
    onError: (e: Error) => toast({ title: "Reconcile failed", description: e.message, variant: "destructive" }),
  });
  const saveFulfil = useMutation({
    mutationFn: () => post(`/fulfilment`, { carrier, trackingNumber: tracking, trackingUrl, expectedDispatch: expDispatch, estimatedDelivery: estDelivery }),
    onSuccess: () => { done(); toast({ title: "Fulfilment saved" }); },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });
  const saveMsg = useMutation({
    mutationFn: () => post(`/customer-message`, { message: custMsg }),
    onSuccess: () => { done(); toast({ title: "Buyer-visible note saved" }); },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });
  const saveNotes = useMutation({
    mutationFn: () => post(`/internal-notes`, { notes }),
    onSuccess: () => { done(); toast({ title: "Private note saved" }); },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });
  const setException = useMutation({
    mutationFn: (state: string) => post(`/exception`, { state }),
    onSuccess: () => { done(); toast({ title: "Updated" }); },
    onError: (e: Error) => toast({ title: "Couldn't update", description: e.message, variant: "destructive" }),
  });
  const sendEmail = useMutation({
    mutationFn: (body: { kind: string; subject?: string; message?: string }) => post(`/email`, body),
    onSuccess: (data: { result?: { status: string; reason?: string } }) => {
      done();
      const s = data?.result?.status;
      toast({
        title: s === "sent" ? "Email sent" : s === "skipped" ? "Not sent" : "Email failed",
        description: s === "sent" ? undefined : (data?.result?.reason ?? ""),
        variant: s === "failed" ? "destructive" : undefined,
      });
    },
    onError: (e: Error) => toast({ title: "Couldn't send", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <Shell><p className="text-stone-500">Loading…</p></Shell>;
  if (!o) return <Shell><p className="text-red-700">Order not found.</p></Shell>;

  const snap = o.artworkSnapshot as { title?: string; dimensions?: string; medium?: string } | null;
  const emails = (o.emails ?? []) as EmailRow[];
  const available = (o.availableStatuses ?? []) as OrderStatus[];
  const busy = setStatus.isPending || saveFulfil.isPending;

  return (
    <Shell>
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="font-playfair text-3xl text-stone-900">{o.reference}</h1>
          <p className="text-sm text-stone-600 mt-1">
            {ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status} · payment {o.payment_status}
            {o.exception_state && <span className="ml-2 text-amber-700">· {o.exception_state === "delayed" ? "Delayed" : "Delivery issue"}</span>}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {o.tracking_token && (
            <a href={`/track/${o.tracking_token}`} target="_blank" rel="noreferrer" className="text-sm text-stone-600 border-b border-stone-300 hover:text-stone-900">Buyer view</a>
          )}
          <Link href="/admin/orders"><a className="text-sm text-stone-600 border-b border-stone-300">All orders</a></Link>
        </div>
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
        <Card title="Stripe">
          <Row k="Payment intent" v={o.stripe_payment_intent_id} />
          <Row k="Paid at" v={o.paid_at ? new Date(o.paid_at).toLocaleString("en-GB") : "—"} />
          <p className="text-xs text-stone-500 mt-2">Refunds are issued in Stripe and reflect here automatically.</p>
        </Card>
      </div>

      {/* Payment — Stripe is the source of truth; Reconcile is the emergency fallback. */}
      <Panel title="Payment">
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2 mb-5">
          <PayRow k="Order payment status" v={
            <span className={o.payment_status === "paid" ? "text-emerald-700" : o.payment_status === "failed" ? "text-red-700" : o.payment_status === "refunded" ? "text-stone-600" : "text-amber-700"}>{o.payment_status}</span>
          } />
          <PayRow k="Stripe payment status" v={o.stripe_payment_status ?? <span className="text-stone-400">not checked yet</span>} />
          <PayRow k="Paid via" v={o.payment_status === "paid" ? (o.payment_source === "reconcile" ? "Manual reconciliation" : "Stripe webhook") : "—"} />
          <PayRow k="Last Stripe check" v={o.last_payment_check_at ? new Date(o.last_payment_check_at).toLocaleString("en-GB") : <span className="text-stone-400">never</span>} />
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => checkPayment.mutate()} disabled={checkPayment.isPending}
            className="border border-stone-800 px-4 py-2 text-[11px] tracking-[0.16em] uppercase hover:bg-stone-900 hover:text-white transition-colors disabled:opacity-50">Check Stripe status</button>
          {o.payment_status !== "paid" && (
            <button
              onClick={() => { if (window.confirm("Reconcile payment?\n\nThis queries Stripe and — ONLY if Stripe confirms the payment is genuinely paid — marks this order paid, marks the artwork sold, and sends one confirmation email. An unpaid/failed Stripe payment can never be marked paid.")) reconcile.mutate(); }}
              disabled={reconcile.isPending}
              className="bg-amber-600 text-white px-4 py-2 text-[11px] tracking-[0.16em] uppercase hover:bg-amber-700 transition-colors disabled:opacity-50">Reconcile payment (emergency)</button>
          )}
        </div>
        <p className="mt-3 text-xs text-stone-500 max-w-2xl">
          Payment is Stripe's fact. Reconcile is an emergency fallback for a failed webhook — it never marks an unpaid payment paid, and it can't double-sell or double-email: it shares the webhook's once-only guards, so whichever arrives second does nothing.
        </p>

        {(o.audit ?? []).length > 0 && (
          <div className="mt-6">
            <h3 className="text-[11px] tracking-[0.2em] uppercase text-stone-500 mb-2">Audit history</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-stone-500"><tr><th className="py-1 pr-4 font-medium">When</th><th className="py-1 pr-4 font-medium">Action</th><th className="py-1 pr-4 font-medium">Result</th><th className="py-1 font-medium">Detail</th></tr></thead>
                <tbody>
                  {(o.audit as AuditRow[]).map((a) => (
                    <tr key={a.id} className="border-t border-stone-100">
                      <td className="py-1.5 pr-4 whitespace-nowrap text-stone-500">{new Date(a.created_at).toLocaleString("en-GB")}</td>
                      <td className="py-1.5 pr-4">{a.action}</td>
                      <td className="py-1.5 pr-4">{a.result}</td>
                      <td className="py-1.5 text-stone-600 max-w-[320px]">{a.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>

      {/* Fulfilment */}
      <Panel title="Fulfilment">
        <div className="flex flex-wrap gap-3 mb-6">
          {available.length
            ? available.map((s) => (
                <button key={s} onClick={() => setStatus.mutate(s)} disabled={busy}
                  className="border border-stone-800 px-5 py-2 text-[11px] tracking-[0.18em] uppercase hover:bg-stone-900 hover:text-white transition-colors disabled:opacity-50">
                  Mark {ORDER_STATUS_LABEL[s]}
                </button>
              ))
            : <p className="text-sm text-stone-500">No status actions from here{o.payment_status !== "paid" ? " until payment is confirmed" : ""}.</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Carrier"><input className={inputCls} value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="FedEx" /></Field>
          <Field label="Tracking number"><input className={inputCls} value={tracking} onChange={(e) => setTracking(e.target.value)} /></Field>
          <Field label="Tracking URL (clickable link)"><input className={inputCls} value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="https://…" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Expected dispatch"><input type="date" className={inputCls} value={expDispatch} onChange={(e) => setExpDispatch(e.target.value)} /></Field>
            <Field label="Estimated delivery"><input type="date" className={inputCls} value={estDelivery} onChange={(e) => setEstDelivery(e.target.value)} /></Field>
          </div>
        </div>
        <button onClick={() => saveFulfil.mutate()} disabled={saveFulfil.isPending}
          className="mt-5 bg-stone-900 text-white px-5 py-2 text-[11px] tracking-[0.18em] uppercase disabled:opacity-50">Save fulfilment</button>
      </Panel>

      {/* Exceptions */}
      <Panel title="Exceptional state">
        <p className="text-sm text-stone-600 mb-4">Raise a delay or delivery issue without changing where the order is. Shows the buyer a calm note on the tracking page.</p>
        <div className="flex flex-wrap gap-3">
          <ExButton active={o.exception_state === "delayed"} onClick={() => setException.mutate("delayed")}>Shipping delayed</ExButton>
          <ExButton active={o.exception_state === "delivery_issue"} onClick={() => setException.mutate("delivery_issue")}>Delivery issue</ExButton>
          <ExButton active={!o.exception_state} onClick={() => setException.mutate("")}>Clear</ExButton>
        </div>
      </Panel>

      {/* Buyer-visible note */}
      <Panel title="Buyer-visible update">
        <p className="text-sm text-stone-600 mb-3">Shown on the buyer's tracking page. Sending a delay/message email below also updates this.</p>
        <textarea className={`${inputCls} min-h-[80px]`} value={custMsg} onChange={(e) => setCustMsg(e.target.value)} placeholder="Packed and collected by the courier this morning…" />
        <button onClick={() => saveMsg.mutate()} disabled={saveMsg.isPending}
          className="mt-3 border border-stone-800 px-5 py-2 text-[11px] tracking-[0.18em] uppercase hover:bg-stone-900 hover:text-white transition-colors disabled:opacity-50">Save note</button>
      </Panel>

      {/* Private note */}
      <Panel title="Internal note (private)">
        <textarea className={`${inputCls} min-h-[80px]`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Only you can see this." />
        <button onClick={() => saveNotes.mutate()} disabled={saveNotes.isPending}
          className="mt-3 border border-stone-800 px-5 py-2 text-[11px] tracking-[0.18em] uppercase hover:bg-stone-900 hover:text-white transition-colors disabled:opacity-50">Save private note</button>
      </Panel>

      {/* Emails */}
      <Panel title="Emails">
        {o.emailConfigured === false && (
          <div className="mb-4 text-sm bg-amber-50 text-amber-900 rounded px-4 py-3">
            Email isn't configured yet (RESEND_API_KEY not set), so sends are recorded as “skipped”. Set the key to enable delivery.
          </div>
        )}
        <div className="flex flex-wrap gap-3 mb-5">
          <button onClick={() => sendEmail.mutate({ kind: "resend_confirmation" })} disabled={sendEmail.isPending}
            className="border border-stone-800 px-4 py-2 text-[11px] tracking-[0.16em] uppercase hover:bg-stone-900 hover:text-white transition-colors disabled:opacity-50">Resend confirmation</button>
          <button onClick={() => sendEmail.mutate({ kind: "preparing" })} disabled={sendEmail.isPending}
            className="border border-stone-800 px-4 py-2 text-[11px] tracking-[0.16em] uppercase hover:bg-stone-900 hover:text-white transition-colors disabled:opacity-50">Send preparing update</button>
        </div>
        <div className="border border-stone-200 rounded p-4 mb-6">
          <div className="flex gap-3 mb-3">
            <select value={emailKind} onChange={(e) => setEmailKind(e.target.value as "manual" | "delay")} className={`${inputCls} max-w-[180px]`}>
              <option value="manual">General message</option>
              <option value="delay">Delay notice</option>
            </select>
            <input className={inputCls} value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Subject (optional)" />
          </div>
          <textarea className={`${inputCls} min-h-[90px]`} value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)} placeholder="Write a note to the buyer…" />
          <button
            onClick={() => { if (!emailMessage.trim()) { toast({ title: "Write a message first", variant: "destructive" }); return; } sendEmail.mutate({ kind: emailKind, subject: emailSubject, message: emailMessage }); }}
            disabled={sendEmail.isPending}
            className="mt-3 bg-stone-900 text-white px-5 py-2 text-[11px] tracking-[0.18em] uppercase disabled:opacity-50">Send to buyer</button>
        </div>

        <h3 className="text-[11px] tracking-[0.2em] uppercase text-stone-500 mb-2">Email history</h3>
        {emails.length === 0
          ? <p className="text-sm text-stone-500">No emails yet.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-stone-500">
                  <tr><th className="py-1 pr-4 font-medium">When</th><th className="py-1 pr-4 font-medium">Type</th><th className="py-1 pr-4 font-medium">To</th><th className="py-1 pr-4 font-medium">Status</th><th className="py-1 font-medium">Detail</th></tr>
                </thead>
                <tbody>
                  {emails.map((e) => (
                    <tr key={e.id} className="border-t border-stone-100">
                      <td className="py-1.5 pr-4 whitespace-nowrap text-stone-500">{new Date(e.created_at).toLocaleString("en-GB")}</td>
                      <td className="py-1.5 pr-4">{e.kind}</td>
                      <td className="py-1.5 pr-4 text-stone-600">{e.to_email ?? "—"}</td>
                      <td className="py-1.5 pr-4">
                        <span className={e.status === "sent" ? "text-emerald-700" : e.status === "failed" ? "text-red-700" : "text-stone-500"}>{e.status}</span>
                      </td>
                      <td className="py-1.5 text-stone-500 max-w-[240px] truncate" title={e.error ?? e.provider_id ?? ""}>{e.error ?? e.provider_id ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Panel>
    </Shell>
  );
}

const inputCls = "w-full border border-stone-300 rounded px-3 py-2 text-sm";

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
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-8 bg-white border border-stone-200 rounded-lg p-6">
      <h2 className="font-medium text-stone-900 mb-4">{title}</h2>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-stone-600 mb-1">{label}</label>{children}</div>;
}
function ExButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-[11px] tracking-[0.16em] uppercase border transition-colors ${active ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-700 border-stone-300 hover:border-stone-500"}`}>
      {children}
    </button>
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
function PayRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-stone-500">{k}</span>
      <span className="text-stone-900 text-right">{v}</span>
    </div>
  );
}
