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
import { type PrintCategory } from "@shared/commerce/prodigiProducts";
import {
  categoryOfMaterial,
  publicMaterialCategories,
  sizesForCategory,
  seedSelection,
  firstOptionInCategory,
  materialCategoryLabel,
} from "@/lib/printSelector";
import {
  readAttribution,
  trackViewItemPrint,
  trackSelectItemPrint,
  trackBeginCheckoutPrint,
} from "@/lib/commerceAnalytics";

interface Option {
  id: number | null;
  material: string;
  sizeLabel: string;
  widthCm?: number;
  heightCm?: number;
  framed: boolean;
  frameColour: string | null;
  currency: string;
  priceMinor: number | null;
  effectiveDpi?: number | null;
  mockup?: string | null;
  state: "purchasable" | "provisional" | "preview";
  reason: string | null;
  prodigiVerified?: boolean;
}

interface PrintDetail {
  id: number;
  slug: string;
  title: string;
  description: string;
  images: string[];
  image: string | null;
  artworkId: number | null;
  artworkPath?: string;
  purchasable: boolean;
  preview?: boolean;
  materialLabel?: string;
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

// Public UX is Material (CATEGORY: Fine Art Paper / Canvas) → Size, and NOTHING else. The paper/canvas
// stock, the Prodigi SKU, the canvas wrap, cost and margin are never shown or selectable (see printSelector).
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
  // Public selector: Material (CATEGORY) → Size. The stock/SKU/wrap are never a customer choice.
  const categories = useMemo(() => publicMaterialCategories(options), [options]);

  const [category, setCategory] = useState<PrintCategory | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [frame, setFrame] = useState<string | null>(null);

  // Sizes for the SELECTED category only — they change with the chosen material.
  const sizes = useMemo(() => sizesForCategory(options, category), [options, category]);
  const frames = useMemo(
    () => Array.from(new Set(options.filter((o) => !category || categoryOfMaterial(o.material) === category).map(frameKeyOf))),
    [options, category],
  );

  // Seed the selection once options arrive, preferring a purchasable combination.
  useEffect(() => {
    if (!options.length || category) return;
    const seed = seedSelection(options);
    if (!seed) return;
    setCategory(seed.category);
    setSize(seed.sizeLabel);
    setFrame(frameKeyOf(seed.option));
  }, [options, category]);

  // Switching Material picks a valid size within the new category (purchasable-first).
  const selectCategory = (cat: PrintCategory) => {
    setCategory(cat);
    const seed = firstOptionInCategory(options, cat);
    if (seed) { setSize(seed.sizeLabel); setFrame(frameKeyOf(seed)); }
  };

  const selected = useMemo(
    () => options.find((o) => categoryOfMaterial(o.material) === category && o.sizeLabel === size && frameKeyOf(o) === frame) ?? null,
    [options, category, size, frame],
  );

  // GALLERY IMAGES — the public storefront images plus the selected variant's Prodigi mockup (if it
  // is not already among them). The high-resolution production master is NEVER part of this list: the
  // server sends only `images` + per-option `mockup`, never the master's print-ready asset URL.
  // (Computed BEFORE any early return so hook order stays stable across loading/loaded renders.)
  const galleryImages = useMemo(() => {
    const list = [...(data?.images ?? [])];
    if (selected?.mockup && !list.includes(selected.mockup)) list.unshift(selected.mockup);
    return list.filter(Boolean);
  }, [data?.images, selected?.mockup]);

  // SEO + view_item (once per print).
  useEffect(() => {
    if (!data) return;
    document.title = `${data.title} — Fine-Art Print · Ani Muradyan`;
    updateMetaDescription(
      `Museum-quality giclée fine-art print of "${data.title}" by Ani Muradyan on archival Hahnemühle paper. Open edition. The original painting remains unique.`,
    );
    updateCanonicalUrl(`/prints/${data.slug}`);
    // NO GA for preview/demo products — demo prices must never enter analytics.
    if (data.preview) return;
    trackViewItemPrint({
      id: data.id,
      title: data.title,
      priceMinor: data.startingPriceMinor,
      printProductId: data.id,
      artworkId: data.artworkId,
    });
  }, [data]);

  // select_item on each configurator change (real products only — never demo).
  useEffect(() => {
    if (!data || data.preview || !selected || selected.id == null) return;
    trackSelectItemPrint({
      id: data.id,
      title: data.title,
      priceMinor: selected.priceMinor,
      currency: selected.currency,
      printProductId: data.id,
      printVariantId: selected.id,
      artworkId: data.artworkId,
      material: selected.material,
      size: selected.sizeLabel,
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

  return (
    <Shell>
      <div className="grid gap-12 lg:grid-cols-[1fr_420px]">
        {/* Image gallery — object-contain on a soft panel so any aspect ratio shows whole. */}
        <div>
          <PrintGallery images={galleryImages} title={data.title} />
          {data.artworkId != null && (
            <Link
              href={data.artworkPath ?? `/artworks/${data.artworkId}`}
              className="inline-block mt-4 text-[11px] tracking-[0.2em] uppercase text-stone-600 border-b border-stone-400 hover:border-stone-800"
            >
              View original artwork →
            </Link>
          )}
        </div>

        {/* Configurator */}
        <div>
          {data.preview && (
            <div className="mb-4 border border-amber-300/70 bg-amber-50 text-amber-800 px-3 py-2 text-xs rounded">
              Preview — demo product for design testing. Purchasing is not yet available.
            </div>
          )}
          <p className="text-[11px] tracking-[0.2em] uppercase text-stone-500 mb-2">Fine Art Print · Open edition · Unsigned</p>
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

          {/* The ONLY material choice: the plain-language category (Fine Art Paper / Canvas). No paper-
              stock selector, no canvas-type/wrap selector — the stock behind each category is implicit. */}
          {categories.length > 0 && (
            <Choice label="Material">
              {categories.map((cat) => (
                <Pill key={cat} active={category === cat} onClick={() => selectCategory(cat)}>
                  {materialCategoryLabel(cat)}
                </Pill>
              ))}
            </Choice>
          )}
          {sizes.length > 0 && (
            <Choice label="Size">
              {sizes.map((s) => (
                <Pill key={s.sizeLabel} active={size === s.sizeLabel} onClick={() => setSize(s.sizeLabel)}>
                  {s.sizeLabel}{s.widthCm && s.heightCm ? ` · ${s.widthCm}×${s.heightCm} cm` : ""}
                </Pill>
              ))}
            </Choice>
          )}
          {/* Framing is deliberately not offered yet (framed SKUs unverified) — the product info
              states "Unframed". Only show a Frame choice if more than one frame option exists. */}
          {frames.length > 1 && (
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
            {selected && selected.state === "preview" && selected.priceMinor != null && (
              <PreviewBlock option={selected} />
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
                    <>The <Link href={data.artworkPath ?? `/artworks/${data.artworkId}`} className="border-b border-stone-400 hover:border-stone-800">original painting</Link> is available now.</>
                  )}
                </p>
              </div>
            )}
          </div>

          <ProductInfo />
        </div>
      </div>
    </Shell>
  );
}

/**
 * A live shipping quote for the chosen variant + destination. `idle` before a destination is known
 * (we show "calculated at checkout", never a fake number); `ok` with a real Prodigi figure; or
 * `unavailable` when Prodigi cannot quote yet — still no fabricated amount.
 */
type ShipQuote =
  | { status: "idle" | "loading" | "unavailable" }
  | { status: "ok"; shippingMinor: number; totalMinor: number; currency: string };

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
  const [ship, setShip] = useState<ShipQuote>({ status: "idle" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Fetch a REAL shipping quote once a destination is known (the form is open + a country chosen).
  // Debounced; the server calls Prodigi. On any failure we fall back to "calculated at checkout" —
  // shipping truly depends on destination, so we never show a number we didn't get from the provider.
  useEffect(() => {
    if (!buying || option.id == null || !country) { setShip({ status: "idle" }); return; }
    let cancelled = false;
    setShip({ status: "loading" });
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/commerce/prints/quote", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variantId: option.id, quantity: qty, country }),
        });
        const b = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (r.ok && b.available && typeof b.shippingMinor === "number") {
          setShip({ status: "ok", shippingMinor: b.shippingMinor, totalMinor: b.totalMinor, currency: b.currency ?? option.currency });
        } else {
          setShip({ status: "unavailable" });
        }
      } catch {
        if (!cancelled) setShip({ status: "unavailable" });
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [buying, option.id, country, qty, option.currency]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setFailure(null); setErrors({});
    trackBeginCheckoutPrint(
      {
        id: detail.id, title: detail.title, priceMinor: option.priceMinor, currency: option.currency,
        printProductId: detail.id, printVariantId: option.id ?? undefined, artworkId: detail.artworkId,
        material: option.material, size: option.sizeLabel,
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
          Printed to order · ships worldwide · shipping calculated at checkout{option.effectiveDpi ? ` · ${option.effectiveDpi} DPI` : ""}
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

  const printMinor = (option.priceMinor ?? 0) * qty;

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="flex items-start justify-between gap-4">
        {/* Print / Shipping / Total — shipping is a REAL Prodigi quote to the chosen country; until
            a destination resolves we say "calculated at checkout" rather than invent a figure. */}
        <div className="space-y-1 text-sm">
          <div className="flex items-baseline gap-3">
            <span className="text-stone-500 w-16">Print</span>
            <span className="text-stone-900 tabular-nums">{money(printMinor, option.currency)}</span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-stone-500 w-16">Shipping</span>
            <span className="text-stone-900 tabular-nums">
              {ship.status === "ok"
                ? money(ship.shippingMinor, ship.currency)
                : ship.status === "loading"
                  ? "Calculating…"
                  : <span className="text-stone-500">Calculated at checkout</span>}
            </span>
          </div>
          <div className="flex items-baseline gap-3 pt-1 border-t border-stone-200">
            <span className="text-stone-500 w-16">Total</span>
            <span className="font-playfair text-xl text-stone-900 tabular-nums">
              {ship.status === "ok"
                ? money(ship.totalMinor, ship.currency)
                : <>{money(printMinor, option.currency)}<span className="text-sm text-stone-500 font-sans"> + shipping</span></>}
            </span>
          </div>
        </div>
        <label className="flex items-center gap-2 text-[11px] tracking-[0.2em] uppercase text-stone-500 shrink-0">
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

/**
 * PREVIEW/DEMO purchase block. Shows the price + quantity selector so the full UI can be
 * evaluated, but the CTA is DISABLED — it makes NO checkout request. A preview option carries no
 * DB variant id, so even a forced request would be refused by the server. Demo prices never leave
 * this component (no checkout, no GA, no feed).
 */
function PreviewBlock({ option }: { option: Option }) {
  const [qty, setQty] = useState(1);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <p className="font-playfair text-3xl text-stone-900 tabular-nums">{money((option.priceMinor ?? 0) * qty, option.currency)}</p>
        <label className="flex items-center gap-2 text-[11px] tracking-[0.2em] uppercase text-stone-500">
          Qty
          <select value={qty} onChange={(e) => setQty(Number(e.target.value))}
            className="bg-transparent border-b border-stone-300 focus:border-stone-800 focus:outline-none py-1 text-stone-900">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <button
        disabled
        aria-disabled="true"
        className="inline-block bg-stone-300 text-stone-600 px-8 py-3 text-[11px] tracking-[0.2em] uppercase cursor-not-allowed"
      >
        Preview — purchasing will be available soon
      </button>
      <p className="text-xs text-stone-500 mt-2">Demo pricing, shown for design testing only.</p>
    </div>
  );
}

/** Shared print information — shown on every PDP (preview and real). No archival-longevity claims. */
function ProductInfo() {
  const facts = [
    ["Type", "Fine art giclée print"],
    ["Paper", "Museum-quality Hahnemühle paper"],
    ["Edition", "Open edition · Unsigned"],
    ["Production", "Printed to order"],
    ["Framing", "Unframed"],
  ];
  return (
    <div className="border-t border-stone-300 mt-10 pt-6">
      <h2 className="text-[11px] tracking-[0.2em] uppercase text-stone-500 mb-4">About this print</h2>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
        {facts.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-stone-200/70 py-1.5">
            <dt className="text-xs tracking-wide uppercase text-stone-400">{k}</dt>
            <dd className="text-sm text-stone-800 text-right">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-stone-500 leading-relaxed mt-4 max-w-prose">
        Each print is made to order. Colours may vary slightly between your screen and the physical
        print, and between production batches — every screen renders colour a little differently.
      </p>
    </div>
  );
}

/**
 * The PDP image gallery. A large "stage" that shows the active image WHOLE (object-contain on a soft
 * panel — portrait and landscape prints alike, never cropped) with a thumbnail strip when there is
 * more than one image. Only public storefront images + Prodigi mockups reach here; never the master.
 */
function PrintGallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);
  const idx = Math.min(active, Math.max(0, images.length - 1));
  const current = images[idx] ?? null;
  return (
    <div>
      <div className="relative flex items-center justify-center overflow-hidden bg-stone-200/50 aspect-[4/5] p-6 md:p-10">
        {current ? (
          <img
            src={current}
            alt={`Fine-art print of ${title}`}
            className="max-w-full max-h-full w-auto h-auto object-contain shadow-[0_10px_40px_-12px_rgba(28,25,23,0.35)]"
          />
        ) : (
          <div className="grid place-items-center text-stone-400">No image</div>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex flex-wrap gap-3 mt-4">
          {images.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`View image ${i + 1}`}
              aria-current={i === idx}
              className={`w-16 h-16 flex items-center justify-center overflow-hidden bg-stone-200/50 border transition-colors ${
                i === idx ? "border-stone-900" : "border-transparent hover:border-stone-400"
              }`}
            >
              <img src={src} alt="" className="max-w-full max-h-full w-auto h-auto object-contain" />
            </button>
          ))}
        </div>
      )}
    </div>
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
