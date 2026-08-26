/**
 * PRINT PDP + CONFIGURATOR.
 *
 * Shows a print as exactly what it is — a museum-quality reproduction, open edition — never as an
 * equivalent of the original. It offers ONLY the material × size × frame combinations the server
 * says are configured (enabled + eligible); a combination behind an unready master is shown as
 * "available soon", never sold. When (and only when) a combination is genuinely purchasable does a
 * Buy form appear; the SERVER sets the price, and the client sends only the chosen variant + qty.
 *
 * Every route out links back to the ORIGINAL painting, keeping the print-vs-original line clear.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Eyebrow } from "@/components/editorial";
import { countryOptions } from "@/lib/countries";
import { updateCanonicalUrl, updateMetaDescription } from "@/lib/seo";
import {
  readAttribution,
  trackViewItemPrint,
  trackSelectItemPrint,
  trackBeginCheckoutPrint,
} from "@/lib/commerceAnalytics";

interface Option {
  id: number;
  material: string;
  sizeLabel: string;
  widthCm: number;
  heightCm: number;
  framed: boolean;
  frameColour: string | null;
  currency: string;
  priceMinor: number | null;
  effectiveDpi: number | null;
  mockup: string | null;
  state: "purchasable" | "provisional";
  reason: string | null;
  prodigiVerified: boolean;
}

interface PrintDetail {
  id: number;
  slug: string;
  title: string;
  description: string;
  images: string[];
  image: string | null;
  artworkId: number | null;
  purchasable: boolean;
  startingPriceMinor: number | null;
  masterReady: boolean;
  options: Option[];
}

const REGION_REQUIRED = new Set(["US", "CA", "AU"]);

function money(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

const MATERIAL_LABEL: Record<string, string> = {
  "german-etching": "German Etching",
  "photo-rag": "Photo Rag",
};
const materialLabel = (m: string) => MATERIAL_LABEL[m] ?? m;
const frameKeyOf = (o: { framed: boolean; frameColour: string | null }) =>
  o.framed ? `framed:${o.frameColour ?? "natural"}` : "unframed";
const frameLabel = (key: string) =>
  key === "unframed" ? "Unframed" : `Framed · ${key.split(":")[1].replace(/^\w/, (c) => c.toUpperCase())}`;

export default function PrintDetailPage() {
  const params = useParams();
  const slug = String(params.slug ?? "");
  const [, navigate] = useLocation();

  const { data, isLoading, isError } = useQuery<PrintDetail>({
    queryKey: [`/api/commerce/prints/${slug}`],
    queryFn: async () => {
      const r = await fetch(`/api/commerce/prints/${encodeURIComponent(slug)}`);
      if (r.status === 404) throw new Error("not-found");
      if (!r.ok) throw new Error("Could not load this print");
      return r.json();
    },
    enabled: Boolean(slug),
  });

  const options = data?.options ?? [];
  const materials = useMemo(() => Array.from(new Set(options.map((o) => o.material))), [options]);
  const sizes = useMemo(() => {
    const seen = new Map<string, Option>();
    for (const o of options) if (!seen.has(o.sizeLabel)) seen.set(o.sizeLabel, o);
    return Array.from(seen.values());
  }, [options]);
  const frames = useMemo(() => Array.from(new Set(options.map(frameKeyOf))), [options]);

  const [material, setMaterial] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [frame, setFrame] = useState<string | null>(null);

  // Seed the selection once options arrive, preferring a purchasable combination.
  useEffect(() => {
    if (!options.length || material) return;
    const seed = options.find((o) => o.state === "purchasable") ?? options[0];
    setMaterial(seed.material);
    setSize(seed.sizeLabel);
    setFrame(frameKeyOf(seed));
  }, [options, material]);

  const selected = useMemo(
    () => options.find((o) => o.material === material && o.sizeLabel === size && frameKeyOf(o) === frame) ?? null,
    [options, material, size, frame],
  );

  // SEO + view_item (once per print).
  useEffect(() => {
    if (!data) return;
    document.title = `${data.title} — Fine-Art Print · Ani Muradyan`;
    updateMetaDescription(
      `Museum-quality giclée fine-art print of "${data.title}" by Ani Muradyan on archival Hahnemühle paper. Open edition. The original painting remains unique.`,
    );
    updateCanonicalUrl(`/prints/${data.slug}`);
    trackViewItemPrint({
      id: data.id,
      title: data.title,
      priceMinor: data.startingPriceMinor,
      printProductId: data.id,
      artworkId: data.artworkId,
    });
  }, [data]);

  // select_item on each configurator change.
  useEffect(() => {
    if (!data || !selected) return;
    trackSelectItemPrint({
      id: data.id,
      title: data.title,
      priceMinor: selected.priceMinor,
      currency: selected.currency,
      printProductId: data.id,
      printVariantId: selected.id,
      artworkId: data.artworkId,
      material: selected.material,
      size: `${selected.widthCm}×${selected.heightCm} cm`,
      frame: frameLabel(frameKeyOf(selected)),
    });
  }, [data, selected]);

  if (isLoading) return <Shell><p className="text-stone-500">Loading…</p></Shell>;
  if (isError || !data) {
    return (
      <Shell>
        <p className="text-stone-700">
          This print could not be found.{" "}
          <Link href="/prints" className="border-b border-stone-400 hover:border-stone-800">Browse all prints</Link>.
        </p>
      </Shell>
    );
  }

  const heroImage = selected?.mockup ?? data.image ?? data.images[0] ?? null;

  return (
    <Shell>
      <div className="grid gap-12 lg:grid-cols-[1fr_420px]">
        {/* Image */}
        <div>
          <div className="aspect-[3/4] overflow-hidden bg-stone-200/60">
            {heroImage ? (
              <img src={heroImage} alt={`Fine-art print of ${data.title}`} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full grid place-items-center text-stone-400">No image</div>
            )}
          </div>
          {data.artworkId != null && (
            <Link
              href={`/artworks/${data.artworkId}`}
              className="inline-block mt-4 text-[11px] tracking-[0.2em] uppercase text-stone-600 border-b border-stone-400 hover:border-stone-800"
            >
              View the original painting →
            </Link>
          )}
        </div>

        {/* Configurator */}
        <div>
          <p className="text-[11px] tracking-[0.2em] uppercase text-stone-500 mb-2">Fine-Art Print · Open edition</p>
          <h1 className="font-playfair text-3xl md:text-4xl text-stone-900 mb-4">{data.title}</h1>
          <p className="text-stone-700 leading-relaxed mb-8">
            A museum-quality giclée reproduction on archival Hahnemühle paper, printed to order with
            pigment inks. This is a print — the{" "}
            {data.artworkId != null ? (
              <Link href={`/artworks/${data.artworkId}`} className="border-b border-stone-400 hover:border-stone-800">original painting</Link>
            ) : (
              "original painting"
            )}{" "}
            is a unique, one-of-a-kind work.
          </p>

          {materials.length > 0 && (
            <Choice label="Paper">
              {materials.map((m) => (
                <Pill key={m} active={material === m} onClick={() => setMaterial(m)}>{materialLabel(m)}</Pill>
              ))}
            </Choice>
          )}
          {sizes.length > 0 && (
            <Choice label="Size">
              {sizes.map((s) => (
                <Pill key={s.sizeLabel} active={size === s.sizeLabel} onClick={() => setSize(s.sizeLabel)}>
                  {s.sizeLabel} · {s.widthCm}×{s.heightCm} cm
                </Pill>
              ))}
            </Choice>
          )}
          {frames.length > 0 && (
            <Choice label="Frame">
              {frames.map((f) => (
                <Pill key={f} active={frame === f} onClick={() => setFrame(f)}>{frameLabel(f)}</Pill>
              ))}
            </Choice>
          )}

          <div className="border-t border-stone-300 mt-8 pt-6">
            {!selected && (
              <p className="text-stone-600 text-sm">That combination isn’t offered. Please choose another.</p>
            )}
            {selected && selected.state === "purchasable" && selected.priceMinor != null && (
              <PurchasableBlock detail={data} option={selected} navigate={navigate} />
            )}
            {selected && selected.state === "provisional" && (
              <div>
                {selected.priceMinor != null && (
                  <p className="font-playfair text-2xl text-stone-900 mb-1 tabular-nums">
                    {money(selected.priceMinor, selected.currency)}
                  </p>
                )}
                <p className="text-[11px] tracking-[0.2em] uppercase text-amber-700 mb-2">Available soon</p>
                <p className="text-sm text-stone-600 leading-relaxed max-w-prose">
                  This print is being prepared from a high-resolution master and is not yet available
                  to order. {data.artworkId != null && (
                    <>The <Link href={`/artworks/${data.artworkId}`} className="border-b border-stone-400 hover:border-stone-800">original painting</Link> is available now.</>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function PurchasableBlock({ detail, option, navigate }: {
  detail: PrintDetail; option: Option; navigate: (to: string) => void;
}) {
  const [buying, setBuying] = useState(false);
  const [qty, setQty] = useState(1);
  const [country, setCountry] = useState("DE");
  const [form, setForm] = useState({ name: "", email: "", phone: "", address1: "", address2: "", city: "", region: "", postalCode: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setFailure(null); setErrors({});
    trackBeginCheckoutPrint(
      {
        id: detail.id, title: detail.title, priceMinor: option.priceMinor, currency: option.currency,
        printProductId: detail.id, printVariantId: option.id, artworkId: detail.artworkId,
        material: option.material, size: `${option.widthCm}×${option.heightCm} cm`,
        frame: frameLabel(frameKeyOf(option)), quantity: qty,
      },
      (option.priceMinor ?? 0) * qty, option.currency,
    );
    try {
      const r = await fetch("/api/commerce/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          print: { variantId: option.id, quantity: qty },
          buyer: { ...form, country },
          attribution: { ...(readAttribution() ?? {}), printPath: `/prints/${detail.slug}` },
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (r.ok && body.url) { window.location.href = body.url as string; return; }
      if (body.errors) setErrors(body.errors as Record<string, string>);
      setFailure((body.message as string) ?? "Checkout could not be started.");
    } catch {
      setFailure("Checkout could not be started. Nothing has been charged.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!buying) {
    return (
      <div>
        <p className="font-playfair text-3xl text-stone-900 mb-1 tabular-nums">
          {money(option.priceMinor!, option.currency)}
        </p>
        <p className="text-xs text-stone-500 mb-4">
          Printed to order · ships worldwide{option.effectiveDpi ? ` · ${option.effectiveDpi} DPI` : ""}
        </p>
        <button
          onClick={() => setBuying(true)}
          className="inline-block bg-stone-900 text-stone-50 px-8 py-3 text-[11px] tracking-[0.2em] uppercase hover:bg-stone-700 transition-colors"
        >
          Buy this print
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="flex items-baseline justify-between">
        <p className="font-playfair text-2xl text-stone-900 tabular-nums">{money((option.priceMinor ?? 0) * qty, option.currency)}</p>
        <label className="flex items-center gap-2 text-[11px] tracking-[0.2em] uppercase text-stone-500">
          Qty
          <select value={qty} onChange={(e) => setQty(Number(e.target.value))}
            className="bg-transparent border-b border-stone-300 focus:border-stone-800 focus:outline-none py-1 text-stone-900">
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      <PField label="Full name" value={form.name} onChange={set("name")} error={errors.name} autoComplete="name" />
      <div className="grid gap-5 sm:grid-cols-2">
        <PField label="Email" type="email" value={form.email} onChange={set("email")} error={errors.email} autoComplete="email" />
        <PField label="Phone" value={form.phone} onChange={set("phone")} error={errors.phone} autoComplete="tel" />
      </div>
      <div>
        <label className="block text-[11px] tracking-[0.2em] uppercase text-stone-500 mb-2">Country</label>
        <select className="w-full bg-transparent border-b border-stone-300 focus:border-stone-800 focus:outline-none py-2 text-stone-900"
          value={country} onChange={(e) => setCountry(e.target.value)}>
          {countryOptions().map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        {errors.country && <p className="text-sm text-red-700 mt-1">{errors.country}</p>}
      </div>
      <PField label="Address" value={form.address1} onChange={set("address1")} error={errors.address1} autoComplete="address-line1" />
      <PField label="Address line 2 (optional)" value={form.address2} onChange={set("address2")} error={errors.address2} autoComplete="address-line2" />
      <div className="grid gap-5 sm:grid-cols-3">
        <PField label="City" value={form.city} onChange={set("city")} error={errors.city} autoComplete="address-level2" />
        {REGION_REQUIRED.has(country) && (
          <PField label="State / province" value={form.region} onChange={set("region")} error={errors.region} autoComplete="address-level1" />
        )}
        <PField label="Postal code" value={form.postalCode} onChange={set("postalCode")} error={errors.postalCode} autoComplete="postal-code" />
      </div>

      {failure && <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded">{failure}</p>}

      <button type="submit" disabled={submitting}
        className="inline-block bg-stone-900 text-stone-50 px-8 py-3 text-[11px] tracking-[0.2em] uppercase hover:bg-stone-700 transition-colors disabled:opacity-50">
        {submitting ? "Taking you to payment…" : "Continue to payment"}
      </button>
      <p className="text-xs text-stone-500">Payment is handled by Stripe. Your card details never reach this website.</p>
    </form>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      <div className="mx-auto max-w-5xl px-6 py-16 md:py-24">
        <Eyebrow>
          <Link href="/prints" className="hover:text-stone-800">Prints</Link>
        </Eyebrow>
        {children}
      </div>
    </div>
  );
}

function Choice({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="text-[11px] tracking-[0.2em] uppercase text-stone-500 mb-3">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm border transition-colors ${
        active ? "border-stone-900 bg-stone-900 text-stone-50" : "border-stone-300 text-stone-700 hover:border-stone-500"
      }`}
    >
      {children}
    </button>
  );
}

function PField({ label, value, onChange, error, type = "text", autoComplete }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string; type?: string; autoComplete?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] tracking-[0.2em] uppercase text-stone-500 mb-2">{label}</label>
      <input type={type} value={value} onChange={onChange} autoComplete={autoComplete}
        className="w-full bg-transparent border-b border-stone-300 focus:border-stone-800 focus:outline-none py-2 text-stone-900" />
      {error && <p className="text-sm text-red-700 mt-1">{error}</p>}
    </div>
  );
}
