/**
 * The shared buyer-facing order pieces — used by both the success page and the tracking page so
 * they read identically. Gallery-quiet: cream, warm stone, hairline rules, tracked uppercase
 * labels, square edges. No badges, no green ticks, no confetti.
 */
import type { OrderView } from "@/lib/orderView";
import { formatDate } from "@/lib/orderView";

/** Absolute-safe artwork image src (the API returns a relative /img ref). */
function artworkSrc(image?: string): string | undefined {
  if (!image) return undefined;
  return image;
}

export function ArtworkHeader({ o }: { o: OrderView }) {
  const a = o.artwork;
  if (!a) return null;
  const meta = [a.dimensions, a.medium, a.year ? String(a.year) : null].filter(Boolean).join(" · ");
  return (
    <div className="mb-10">
      {a.image && (
        <img
          src={artworkSrc(a.image)}
          alt={a.title ?? "Artwork"}
          className="w-full max-w-md border border-stone-300"
          loading="lazy"
        />
      )}
      {a.title && (
        <div className="font-playfair italic text-2xl text-stone-900 mt-5">{a.title}</div>
      )}
      {meta && <div className="text-sm text-stone-500 mt-1">{meta}</div>}
    </div>
  );
}

/** A calm banner for exceptional situations. Only rendered when there is one. */
export function ExceptionBanner({ o }: { o: OrderView }) {
  const map: Record<string, { title: string; body: string; tone: "warn" | "info" | "quiet" }> = {
    refunded: { title: "This order has been refunded", body: "The amount is being returned to your original payment method. If you have any questions, just reply to your order email.", tone: "info" },
    cancelled: { title: "This order was cancelled", body: "No payment was taken. If you didn't expect this, please get in touch and I'll help.", tone: "quiet" },
    payment_failed: { title: "Payment didn't go through", body: "No charge was made. You're welcome to try again, or reply to me if you'd like a hand.", tone: "warn" },
  };
  let entry = o.phase !== "normal" ? map[o.phase] : null;
  if (!entry && o.exception) {
    entry = o.exception.state === "delayed"
      ? { title: "A short delay", body: o.customerMessage || "Your order is delayed slightly. I'll email you as soon as it's moving again.", tone: "warn" }
      : { title: "A delivery issue", body: o.customerMessage || "There's a delivery issue I'm working to resolve. I'll keep you posted.", tone: "warn" };
  }
  if (!entry) return null;
  const border = entry.tone === "warn" ? "border-amber-300" : entry.tone === "info" ? "border-stone-300" : "border-stone-300";
  const bg = entry.tone === "warn" ? "bg-amber-50" : "bg-[#f5f1ea]";
  return (
    <div className={`border ${border} ${bg} px-6 py-5 mb-10`}>
      <div className="text-[11px] tracking-[0.2em] uppercase text-stone-600 mb-2">{entry.title}</div>
      <p className="text-sm text-stone-700 leading-relaxed">{entry.body}</p>
    </div>
  );
}

/** The six-step buyer timeline: Order confirmed → Preparing → Packed → Shipped → In transit → Delivered. */
export function OrderTimeline({ o }: { o: OrderView }) {
  // For cancelled/refunded/failed orders the ladder is not the right metaphor — the banner carries it.
  if (o.phase !== "normal") return null;
  return (
    <div className="mt-2">
      <p className="text-[11px] tracking-[0.2em] uppercase text-stone-500 mb-5">Progress</p>
      <ol className="relative">
        {o.timeline.map((step, i) => {
          const last = i === o.timeline.length - 1;
          const done = step.state === "done";
          const current = step.state === "current";
          const when = formatDate(step.at);
          return (
            <li key={step.key} className="relative flex gap-4 pb-7 last:pb-0">
              {/* connector */}
              {!last && (
                <span
                  className={`absolute left-[7px] top-4 bottom-0 w-px ${done ? "bg-stone-700" : "bg-stone-300"}`}
                  aria-hidden
                />
              )}
              {/* dot */}
              <span className="relative z-10 mt-1 shrink-0" aria-hidden>
                {done ? (
                  <span className="block h-3.5 w-3.5 rounded-full bg-stone-900" />
                ) : current ? (
                  <span className="block h-3.5 w-3.5 rounded-full border-2 border-amber-500 bg-amber-100" />
                ) : (
                  <span className="block h-3.5 w-3.5 rounded-full border border-stone-300 bg-white" />
                )}
              </span>
              <div className="min-w-0">
                <div className={`text-sm ${done || current ? "text-stone-900" : "text-stone-400"} ${current ? "font-medium" : ""}`}>
                  {step.label}
                  {current && <span className="ml-2 text-[10px] tracking-[0.18em] uppercase text-amber-600">In progress</span>}
                </div>
                {when && <div className="text-xs text-stone-500 mt-0.5 tabular-nums">{when}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Carrier + tracking with a clickable link (never asks the buyer to copy a number). */
export function ShipmentPanel({ o }: { o: OrderView }) {
  const shipped = formatDate(o.shippedAt);
  const eta = formatDate(o.estimatedDeliveryAt);
  if (!o.carrier && !o.tracking && !shipped && !eta) return null;
  return (
    <div className="mt-10 border-t border-stone-300 pt-8">
      <p className="text-[11px] tracking-[0.2em] uppercase text-stone-500 mb-4">Shipment</p>
      <dl className="space-y-3">
        {o.carrier && <PanelRow label="Carrier" value={o.carrier} />}
        {o.tracking && <PanelRow label="Tracking" value={o.tracking} />}
        {shipped && <PanelRow label="Shipped" value={shipped} />}
        {eta && <PanelRow label="Estimated delivery" value={eta} />}
      </dl>
      {o.trackingUrl && (
        <a
          href={o.trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-block border border-stone-800 px-6 py-3 text-[11px] tracking-[0.2em] uppercase text-stone-900 hover:bg-stone-900 hover:text-stone-50 transition-colors"
        >
          Track with {o.carrier ?? "carrier"}
        </a>
      )}
    </div>
  );
}

function PanelRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6">
      <dt className="text-[11px] tracking-[0.2em] uppercase text-stone-500">{label}</dt>
      <dd className="text-sm text-right text-stone-800">{value}</dd>
    </div>
  );
}

/** The latest buyer-visible note from the studio, if any (and not already shown by a banner). */
export function StudioNote({ o }: { o: OrderView }) {
  if (!o.customerMessage || o.exception) return null; // exception banner already carries the message
  return (
    <div className="mt-10 border-t border-stone-300 pt-8">
      <p className="text-[11px] tracking-[0.2em] uppercase text-stone-500 mb-3">A note from the studio</p>
      <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-line">{o.customerMessage}</p>
    </div>
  );
}
