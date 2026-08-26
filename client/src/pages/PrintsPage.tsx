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
}

function money(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(0)} ${currency}`;
  }
}

export default function PrintsPage() {
  const { data, isLoading } = useQuery<{ prints: PrintCard[] }>({
    queryKey: ["/api/commerce/prints"],
    queryFn: async () => {
      const r = await fetch("/api/commerce/prints");
      if (!r.ok) throw new Error("Could not load prints");
      return r.json();
    },
  });

  useEffect(() => {
    document.title = "Fine-Art Prints · Ani Muradyan";
    updateMetaDescription(
      "Museum-quality giclée fine-art prints of paintings by Ani Muradyan, on archival Hahnemühle paper. The originals remain unique, one-of-a-kind works.",
    );
    updateCanonicalUrl("/prints");
  }, []);

  const prints = data?.prints ?? [];

  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <Eyebrow>Fine-Art Prints</Eyebrow>
        <h1 className="font-playfair text-4xl md:text-5xl text-stone-900 mb-4">Prints</h1>
        <p className="text-stone-700 max-w-2xl leading-relaxed mb-12">
          Museum-quality giclée reproductions on archival Hahnemühle paper, printed to order. A print
          lets a painting live on more walls — the{" "}
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

        {prints.length > 0 && (
          <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {prints.map((p) => (
              <Link key={p.id} href={`/prints/${p.slug}`} className="group block">
                <div className="aspect-[3/4] overflow-hidden bg-stone-200/60 mb-4">
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={`Fine-art print of ${p.title}`}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-stone-400 text-sm">No image</div>
                  )}
                </div>
                <p className="text-[11px] tracking-[0.2em] uppercase text-stone-500 mb-1">Fine-Art Print</p>
                <h3 className="font-playfair text-xl text-stone-900 group-hover:text-stone-600 transition-colors">{p.title}</h3>
                {p.startingPriceMinor != null && (
                  <p className="text-sm text-stone-700 tabular-nums mt-1">From {money(p.startingPriceMinor, p.currency)}</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
