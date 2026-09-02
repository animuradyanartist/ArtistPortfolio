/**
 * THE PRINT STOREFRONT — the public collection of fine-art prints.
 *
 * It shows ONLY genuinely purchasable print products (the server gates this: a product with no
 * ready master, no eligible+enabled variant, or no own-site price never appears). Today that set
 * is empty — no high-resolution master exists yet — so the page shows an honest "coming soon"
 * state rather than exposing anything unready. A price is shown ONLY when a real own-site print
 * price exists.
 *
 * Prints are positioned as exactly what they are: museum-quality reproductions. The originals stay
 * the premium, one-of-a-kind work, and every route out of here says so.
 */
import { useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Eyebrow } from "@/components/editorial";
import { updateCanonicalUrl, updateMetaDescription } from "@/lib/seo";

interface PrintCard {
  id: number;
  title: string;
  slug: string;
  image: string | null;
  artworkId: number | null;
  startingPriceMinor: number | null;
  currency: string;
  sizeCount?: number;
  materialLabel?: string;
  preview?: boolean;
}

function money(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(0)} ${currency}`;
  }
}

export default function PrintsPage() {
  const { data, isLoading } = useQuery<{ prints: PrintCard[]; previewMode?: boolean }>({
    queryKey: ["/api/commerce/prints"],
    queryFn: async () => {
      const r = await fetch("/api/commerce/prints");
      if (!r.ok) throw new Error("Could not load prints");
      return r.json();
    },
  });
  const previewMode = Boolean(data?.previewMode);

  useEffect(() => {
    // Kept in step with the server SSR title/description for /prints (server/routes.ts) so the
    // served and hydrated pages cannot drift on this money page.
    document.title = "Fine Art Prints & Canvas Prints of Contemporary Paintings | Ani Muradyan";
    updateMetaDescription(
      "Museum-quality giclée fine art prints and canvas prints of Ani Muradyan's contemporary oil paintings — landscapes and seascapes on archival Hahnemühle paper or stretched canvas, printed to order. Each original remains a unique work.",
    );
    updateCanonicalUrl("/prints");
  }, []);

  const prints = data?.prints ?? [];

  // Remove the server-prerendered #prints-ssr block once the real React grid is populated, so the
  // page has exactly one <h1> (the prerendered one before hydration, this one after). Mirrors /artworks.
  useEffect(() => {
    const ssr = document.getElementById("prints-ssr");
    if (!ssr) return;
    if (!isLoading && prints.length > 0) ssr.remove();
    else ssr.style.display = "";
  }, [isLoading, prints.length]);

  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      <div className="mx-auto max-w-7xl px-6 md:px-10 py-16 md:py-24">
        <Eyebrow>Fine-Art Prints</Eyebrow>
        <h1 className="font-playfair text-4xl md:text-5xl text-stone-900 mb-4">Fine Art Prints</h1>
        {previewMode && (
          <div className="mb-8 border border-amber-300/70 bg-amber-50 text-amber-800 px-4 py-2.5 text-sm rounded max-w-2xl">
            <strong className="font-medium">Preview mode.</strong> These are demo products for design testing — purchasing is not yet available and prices are placeholders.
          </div>
        )}
        <p className="text-stone-700 max-w-2xl leading-relaxed mb-12">
          Museum-quality giclée reproductions on archival Hahnemühle paper or stretched canvas, printed
          to order. A fine-art print or canvas lets a painting live on more walls — the{" "}
          <Link href="/artworks" className="border-b border-stone-400 hover:border-stone-800">original works</Link>{" "}
          remain unique and one of a kind.
        </p>

        {isLoading && <p className="text-stone-500">Loading…</p>}

        {!isLoading && prints.length === 0 && (
          <div className="border border-stone-300/80 bg-white/40 px-8 py-16 text-center max-w-2xl">
            <h2 className="font-playfair text-2xl text-stone-900 mb-3">Coming soon</h2>
            <p className="text-stone-700 leading-relaxed mb-6">
              Fine-art prints are being prepared from high-resolution masters of the paintings. They
              are not yet available to order. In the meantime, the original works are available.
            </p>
            <Link
              href="/artworks"
              className="inline-block bg-stone-900 text-stone-50 px-8 py-3 text-[11px] tracking-[0.2em] uppercase hover:bg-stone-700 transition-colors"
            >
              View the paintings
            </Link>
          </div>
        )}

        {/* EDITORIAL LAYOUT — two large cards per row on desktop, one on mobile. The artwork is the
            dominant element, shown whole (object-contain on a soft gallery panel) so portrait and
            landscape prints alike are never stretched or destructively cropped. Deliberately NOT the
            dense multi-column originals grid — a small, curated print collection reads as a gallery. */}
        {prints.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 lg:gap-x-16 gap-y-14 md:gap-y-20">
            {prints.map((p) => (
              <Link key={p.id} href={`/prints/${p.slug}`} className="group block">
                <div className="relative flex items-center justify-center overflow-hidden bg-stone-200/50 h-[62vw] md:h-[30vw] md:max-h-[520px] p-6 md:p-10">
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={`Fine-art print of ${p.title}`}
                      loading="lazy"
                      className="max-w-full max-h-full w-auto h-auto object-contain shadow-[0_10px_40px_-12px_rgba(28,25,23,0.35)] group-hover:scale-[1.015] transition-transform duration-500"
                    />
                  ) : (
                    <div className="grid place-items-center text-stone-400 text-sm">No image</div>
                  )}
                </div>
                <div className="mt-5">
                  <p className="text-[11px] tracking-[0.25em] uppercase text-stone-500 mb-2">Fine Art Print</p>
                  <h3 className="font-playfair text-2xl md:text-3xl text-stone-900 group-hover:text-stone-600 transition-colors">{p.title}</h3>
                  {p.startingPriceMinor != null && (
                    <p className="text-base text-stone-700 tabular-nums mt-2">Starting from {money(p.startingPriceMinor, p.currency)}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
