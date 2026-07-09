import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Artwork } from "@shared/schema";
import { updateCanonicalUrl, updateMetaDescription, toSlug, generateArtworkAlt } from "@/lib/seo";
import { SHOW_PRICES } from "@/lib/featureFlags";
import { Eyebrow } from "@/components/editorial";
import { artworkCategory, type ArtworkCategory } from "@/lib/artworkCategory";

// Server-injected preloaded artworks (eliminates loading state for crawlers + first paint).
const _raw: Artwork[] | undefined =
  typeof window !== "undefined" ? (window as any).__PRELOADED_ARTWORKS__ : undefined;
const preloadedArtworks: Artwork[] | undefined =
  Array.isArray(_raw) && _raw.length > 0 ? _raw : undefined;

type CategoryTab = "all" | ArtworkCategory;
type AvailabilityFilter = "all" | "available" | "sold";

const CATEGORY_TABS: { value: CategoryTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "landscape", label: "Landscape" },
  { value: "figurative", label: "Figurative" },
];

const AVAILABILITY_FILTERS: { value: AvailabilityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "available", label: "Available" },
  { value: "sold", label: "Sold" },
];

export default function ArtworksPage() {
  useEffect(() => {
    document.title = "Original Paintings by Ani Muradyan | Oil Paintings for Sale";
    updateCanonicalUrl("/artworks");
    updateMetaDescription(
      "Browse original oil paintings by Armenian contemporary artist Ani Muradyan — figurative works and landscapes, available and collected."
    );
  }, []);

  const [category, setCategory] = useState<CategoryTab>("all");
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");

  const { data: artworks = [], isLoading, isPlaceholderData, status } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks"],
    ...(preloadedArtworks ? { placeholderData: preloadedArtworks } : {}),
  });

  const filteredArtworks = useMemo(() => {
    return artworks.filter((artwork) => {
      if (category !== "all" && artworkCategory(artwork) !== category) return false;
      if (availability !== "all" && artwork.availability !== availability) return false;
      return true;
    });
  }, [artworks, category, availability]);

  const hasConfirmedData = status === "success" && !isPlaceholderData && !isLoading;
  const showEmptyState = hasConfirmedData && filteredArtworks.length === 0;

  // Keep the SEO SSR block visible until the real React grid is populated
  useEffect(() => {
    const ssrSection = document.getElementById("artworks-ssr");
    if (!ssrSection) return;
    const hasRealGrid = hasConfirmedData && artworks.length > 0;
    ssrSection.style.display = hasRealGrid ? "none" : "";
  }, [hasConfirmedData, artworks.length]);

  const priceLabel = (artwork: Artwork) => {
    if (artwork.availability !== "available") {
      return artwork.availability === "reserved" ? "Reserved" : "Sold";
    }
    if (SHOW_PRICES && artwork.price) return `€${artwork.price.toLocaleString()}`;
    return "Inquire";
  };

  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      {/* ── Header ─────────────────────────────────────────── */}
      <section className="px-6 pt-20 md:pt-28 pb-10 text-center">
        <Eyebrow>The Collection</Eyebrow>
        <h1 className="font-playfair text-5xl md:text-6xl text-stone-900 mb-5">Originals</h1>
        <p className="mx-auto max-w-xl text-sm md:text-base text-stone-600">
          Original oil paintings on canvas — figurative works and landscapes, each made to hold a
          quiet moment. Available pieces can be inquired about directly.
        </p>
      </section>

      {/* ── Category tabs + availability filters ───────────── */}
      <section className="px-6">
        <div className="mx-auto max-w-6xl">
          {/* Category tabs */}
          <div className="flex justify-center gap-8 md:gap-12 border-b border-stone-300">
            {CATEGORY_TABS.map((tab) => {
              const active = category === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setCategory(tab.value)}
                  className={`relative -mb-px pb-4 font-playfair text-lg md:text-xl transition-colors ${
                    active ? "text-stone-900" : "text-stone-400 hover:text-stone-600"
                  }`}
                >
                  {tab.label}
                  {active && <span className="absolute inset-x-0 bottom-0 h-px bg-stone-900" />}
                </button>
              );
            })}
          </div>

          {/* Availability filters */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-8">
            {AVAILABILITY_FILTERS.map((f) => {
              const active = availability === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setAvailability(f.value)}
                  className={`px-5 py-2 text-[11px] tracking-[0.2em] uppercase transition-colors ${
                    active
                      ? "bg-stone-900 text-stone-50"
                      : "border border-stone-300 text-stone-600 hover:border-stone-500 hover:text-stone-900"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Grid ───────────────────────────────────────────── */}
      <section className="px-6 py-14 md:py-20">
        <div className="mx-auto max-w-6xl">
          {showEmptyState ? (
            <div className="py-20 text-center">
              <p className="font-playfair italic text-2xl text-stone-700 mb-3">
                Nothing here just yet
              </p>
              <p className="text-sm text-stone-500">
                No paintings match these filters. Try another category or availability.
              </p>
            </div>
          ) : filteredArtworks.length > 0 ? (
            <>
              <p className="mb-10 text-center text-[11px] tracking-[0.2em] uppercase text-stone-400">
                {filteredArtworks.length}{" "}
                {filteredArtworks.length === 1 ? "painting" : "paintings"}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-14">
                {filteredArtworks.map((artwork) => (
                  <div key={artwork.id} className="animate-fadeIn">
                    <Link href={`/artworks/${artwork.slug || toSlug(artwork.title)}`}>
                      <div className="group aspect-[4/5] overflow-hidden cursor-pointer bg-stone-200">
                        <img
                          src={artwork.images[0]}
                          alt={generateArtworkAlt(artwork.title, artwork.medium)}
                          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                          loading="lazy"
                        />
                      </div>
                    </Link>
                    <h3 className="font-playfair italic text-lg text-stone-900 mt-4">
                      {artwork.title}
                    </h3>
                    <p className="text-xs text-stone-500 mt-1">
                      {artwork.medium || "Oil on canvas"} · {artwork.dimensions}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-sm text-stone-800">{priceLabel(artwork)}</span>
                      <Link href={`/artworks/${artwork.slug || toSlug(artwork.title)}`}>
                        <span className="text-[10px] tracking-[0.2em] uppercase text-stone-700 border-b border-stone-400 pb-0.5 hover:text-stone-900 hover:border-stone-800 transition-colors">
                          View Work
                        </span>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            // Still loading — #artworks-ssr remains visible as fallback
            <div className="py-20 text-center text-sm text-stone-400">Loading the collection…</div>
          )}
        </div>
      </section>

      {/* ── Footer note ────────────────────────────────────── */}
      <section className="px-6 pb-24 text-center">
        <p className="text-sm text-stone-500">
          <Link href="/about" className="border-b border-stone-400 hover:text-stone-900 hover:border-stone-800 transition-colors">
            Learn about Ani Muradyan
          </Link>{" "}
          and her practice, or browse the{" "}
          <Link href="/gallery" className="border-b border-stone-400 hover:text-stone-900 hover:border-stone-800 transition-colors">
            exhibition gallery
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
