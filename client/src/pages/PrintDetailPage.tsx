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
import { printViewState } from "@shared/printAvailability";
import { Eyebrow } from "@/components/editorial";
import { ImageLightbox } from "@/components/ImageLightbox";
import { updateCanonicalUrl, updateMetaDescription } from "@/lib/seo";
import { type PrintCategory } from "@shared/commerce/prodigiProducts";
import {
  categoryOfMaterial,
  publicMaterialCategories,
  sizesForCategory,
  seedSelection,
  retainedSizeOnCategoryChange,
  materialCategoryLabel,
  printCheckoutHref,
} from "@/lib/printSelector";
import { SizeSelect } from "@/components/SizeSelect";
import { useCart } from "@/lib/cart";
import { useToast } from "@/hooks/use-toast";
import {
  trackViewItemPrint,
  trackSelectItemPrint,
} from "@/lib/commerceAnalytics";

interface Option {
  id: number | null;
  material: string;
  sizeLabel: string;
  sizeName?: string | null;
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


/**
 * The server's own copy of this print, embedded in the initial HTML (window.__PRELOADED_PRINT__ =
 * serializePrintDetail(detail), the SAME shape /api/commerce/prints/:slug returns). It exists so the
 * page never depends on a runtime fetch of /api to know the print is real — Googlebot's renderer
 * obeys robots.txt, which disallows /api, so that fetch is blocked and the naive `isError → not
 * found` path turned a valid product into a Soft 404. Gated by slug (like the artwork PDP's address
 * check) so a stale preload from a previous client-side navigation is never used for another print.
 */
const _preloadedPrint: PrintDetail | undefined =
  typeof window !== "undefined" ? (window as { __PRELOADED_PRINT__?: PrintDetail }).__PRELOADED_PRINT__ : undefined;

function preloadedPrintFor(slug: string): PrintDetail | undefined {
  const p = _preloadedPrint;
  return p && typeof p.id === "number" && p.slug === slug ? p : undefined;
}

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

  const preloaded = preloadedPrintFor(slug);

  const { data: fetched, isLoading } = useQuery<PrintDetail>({
    queryKey: [`/api/commerce/prints/${slug}`],
    queryFn: async () => {
      const r = await fetch(`/api/commerce/prints/${encodeURIComponent(slug)}`);
      if (r.status === 404) throw new Error("not-found");
      if (!r.ok) throw new Error("Could not load this print");
      return r.json();
    },
    enabled: Boolean(slug),
    // Paint immediately from the server's embedded copy; the fetch still runs and replaces it.
    ...(preloaded ? { placeholderData: preloaded } : {}),
  });

  // The print this page shows: the freshly fetched row when there is one, otherwise the server's
  // own preload. A blocked or failed fetch is NOT proof the print is absent — Google's renderer
  // blocks /api, so relying on the fetch alone rendered a Soft 404 over a print the server resolved.
  // The decision lives in a shared, tested helper so the page and its tests cannot disagree.
  const view = printViewState<PrintDetail>({ fetched, preloaded, isLoading });
  const data = view.show;

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

  // Seed the MATERIAL once options arrive (prefer a purchasable one). Size stays unset so the dropdown
  // opens on "Select a size" — the customer explicitly picks a size.
  useEffect(() => {
    if (!options.length || category) return;
    const seed = seedSelection(options);
    if (seed) setCategory(seed.category);
  }, [options, category]);

  // Choose a size from the dropdown; carry the matching frame so `selected` resolves. Null → cleared.
  const chooseSize = (sizeLabel: string | null) => {
    setSize(sizeLabel);
    if (!sizeLabel) { setFrame(null); return; }
    const opt = options.find((o) => categoryOfMaterial(o.material) === category && o.sizeLabel === sizeLabel);
    setFrame(opt ? frameKeyOf(opt) : null);
  };

  // Switching Material keeps the size ONLY if it exists in the new material, else resets to "Select a
  // size" — a variant from the previous material is never silently retained.
  const selectCategory = (cat: PrintCategory) => {
    setCategory(cat);
    const retained = retainedSizeOnCategoryChange(options, cat, size);
    setSize(retained);
    const opt = retained ? options.find((o) => categoryOfMaterial(o.material) === cat && o.sizeLabel === retained) : null;
    setFrame(opt ? frameKeyOf(opt) : null);
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

  // "Loading" only while we have nothing to show yet. With a preload, the print is already `data`,
  // so the product renders on the first paint and never flashes Loading or Not-Found.
  if (view.state === "loading") return <Shell><p className="text-stone-500">Loading…</p></Shell>;
  // Genuinely absent: no fetched row AND no server preload for this slug. A failed fetch alone is
  // NOT enough — that was the Soft-404 bug (robots-blocked /api fetch reported as "not found").
  if (view.state === "missing" || !data) {
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
          {/* Size is a single accessible dropdown (never a row of size buttons). Each option reads
              "{name} ({cm}) — {retail price}"; options are already filtered to the selected material. */}
          {sizes.length > 0 && (
            <div className="mb-6">
              <p className="text-[11px] tracking-[0.2em] uppercase text-stone-500 mb-2">Size</p>
              <SizeSelect sizes={sizes} value={size} onChange={chooseSize} />
            </div>
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
            {!size && (
              <p className="text-stone-600 text-sm">Select a size to see the price and order.</p>
            )}
            {size && !selected && (
              <p className="text-stone-600 text-sm">That size isn’t available. Please choose another.</p>
            )}
            {selected && selected.state === "purchasable" && selected.priceMinor != null && (
              <BuyBlock detail={data} option={selected} navigate={navigate} />
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
 * BUY BLOCK — the print PDP purchase actions. NO address/shipping form appears here (that awkward
 * inline flow is gone): the customer picks a quantity, then either ADDS TO CART (stays on the page,
 * keeps browsing) or BUYS NOW (→ the dedicated /checkout page). Only safe identifiers/display metadata
 * are stored in the cart; the server re-resolves the authoritative price + shipping at checkout.
 */
function BuyBlock({ detail, option, navigate }: { detail: PrintDetail; option: Option; navigate: (to: string) => void }) {
  const cart = useCart();
  const { toast } = useToast();
  const [qty, setQty] = useState(1);
  const inCart = option.id != null && cart.prints.some((l) => l.variantId === option.id);

  const sizeText = option.sizeName
    ? `${option.sizeName}${option.widthCm && option.heightCm ? ` (${option.widthCm}×${option.heightCm} cm)` : ""}`
    : option.sizeLabel;
  const materialLabel = materialCategoryLabel(categoryOfMaterial(option.material));

  const addToCart = () => {
    if (option.id == null || option.priceMinor == null) return;
    cart.addPrint({
      variantId: option.id, quantity: qty, title: detail.title,
      materialLabel, sizeLabel: sizeText, unitPriceMinor: option.priceMinor, currency: option.currency,
      imageUrl: detail.artworkId != null ? `/img/artwork/${detail.artworkId}/0` : "",
    });
    toast({ title: "Added to cart", description: `${detail.title} · ${materialLabel} · ${sizeText}` });
  };
  const buyNow = () => {
    if (option.id == null) return;
    navigate(printCheckoutHref(option.id, qty));
  };

  return (
    <div>
      <p className="font-playfair text-3xl text-stone-900 mb-1 tabular-nums">{money(option.priceMinor!, option.currency)}</p>
      <p className="text-xs text-stone-500 mb-5">Printed to order · ships worldwide · shipping calculated at checkout{option.effectiveDpi ? ` · ${option.effectiveDpi} DPI` : ""}</p>

      <div className="flex items-center gap-3 mb-5">
        <span className="text-[11px] tracking-[0.2em] uppercase text-stone-500">Quantity</span>
        <div className="inline-flex items-center border border-stone-300">
          <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-3 py-2 text-stone-700 hover:bg-stone-100 disabled:opacity-40" disabled={qty <= 1}>−</button>
          <span className="px-4 tabular-nums" aria-live="polite">{qty}</span>
          <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(10, q + 1))} className="px-3 py-2 text-stone-700 hover:bg-stone-100 disabled:opacity-40" disabled={qty >= 10}>+</button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {/* Primary: Add to cart. Secondary: Buy now. */}
        <button type="button" onClick={addToCart}
          className="flex-1 bg-stone-900 text-stone-50 px-6 py-3 text-[11px] tracking-[0.2em] uppercase hover:bg-stone-700 transition-colors">
          {inCart ? "Add another" : "Add to cart"}
        </button>
        <button type="button" onClick={buyNow}
          className="flex-1 border border-stone-800 text-stone-900 px-6 py-3 text-[11px] tracking-[0.2em] uppercase hover:bg-stone-900 hover:text-white transition-colors">
          Buy now
        </button>
      </div>
      {inCart && (
        <p className="text-xs text-stone-500 mt-3">
          In your <Link href="/cart" className="border-b border-stone-400 hover:border-stone-800">cart</Link> — each item is checked out on its own.
        </p>
      )}
      <p className="text-xs text-stone-500 mt-3">Payment is handled by Stripe. Your card details never reach this website.</p>
    </div>
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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const idx = Math.min(active, Math.max(0, images.length - 1));
  const current = images[idx] ?? null;
  return (
    <div>
      <div className="relative flex items-center justify-center overflow-hidden bg-stone-200/50 aspect-[4/5] p-6 md:p-10">
        {current ? (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label="Open full-screen viewer"
            className="flex h-full w-full items-center justify-center cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-800"
          >
            <img
              src={current}
              alt={`Fine-art print of ${title}`}
              className="max-w-full max-h-full w-auto h-auto object-contain shadow-[0_10px_40px_-12px_rgba(28,25,23,0.35)]"
            />
          </button>
        ) : (
          <div className="grid place-items-center text-stone-400">No image</div>
        )}
      </div>
      {/* Fullscreen viewer — the SAME public gallery list (storefront images + Prodigi mockup); the master never reaches here. */}
      <ImageLightbox
        images={images}
        index={idx}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onIndexChange={setActive}
        alt={() => `Fine-art print of ${title}`}
        title={title}
      />
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
