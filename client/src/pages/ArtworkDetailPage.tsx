import { useState, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Artwork } from "@shared/schema";
import {
  updateCanonicalUrl,
  updateMetaDescription,
  injectJsonLd,
  removeJsonLd,
  BASE_URL,
  artworkPath,
  generateArtworkAlt,
} from "@/lib/seo";
import { SHOW_PRICES } from "@/lib/featureFlags";
import { Eyebrow, OutlineButton } from "@/components/editorial";
import { artworkCategory } from "@/lib/artworkCategory";

const CATEGORY_LABEL = { landscape: "Landscape", figurative: "Figurative" } as const;

/** Solid dark action button matching the homepage CTAs */
function DarkButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="inline-block px-6 py-3 text-[11px] tracking-[0.2em] uppercase text-stone-50 hover:opacity-90 transition-opacity"
      style={{ backgroundColor: "#26221c" }}
    >
      {children}
    </button>
  );
}

export default function ArtworkDetailPage() {
  const params = useParams();
  const [location, setLocation] = useLocation();
  const idParam = params.id as string;
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const { data: artwork, isLoading, error } = useQuery<Artwork>({
    queryKey: ["/api/artworks", idParam],
    queryFn: async () => {
      const res = await fetch(`/api/artworks/${idParam}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: !!idParam,
  });

  // Full collection — for the "More from the collection" strip (cached query)
  const { data: allArtworks = [] } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks"],
  });

  // Reset gallery to first image when navigating between artworks
  useEffect(() => {
    setCurrentImageIndex(0);
  }, [idParam]);

  // Page title, canonical URL, and per-artwork JSON-LD for SEO
  useEffect(() => {
    if (artwork) {
      const canonicalPath = artwork.seoSlug ? `/${artwork.seoSlug}` : artworkPath(artwork);
      document.title = `${artwork.title} | Original ${artwork.medium} by Ani Muradyan`;
      updateCanonicalUrl(canonicalPath);
      updateMetaDescription(
        `${artwork.title} – original ${artwork.medium} painting by Armenian contemporary artist Ani Muradyan. ${artwork.dimensions}, ${artwork.year}. ${artwork.availability === "available" ? "Available for purchase." : ""}`
      );

      injectJsonLd("artwork-jsonld", {
        "@context": "https://schema.org",
        "@type": "VisualArtwork",
        name: artwork.title,
        description: artwork.description,
        artMedium: artwork.medium || "Oil on canvas",
        artform: "Painting",
        artworkSurface: "Canvas",
        dateCreated: artwork.year?.toString(),
        height: artwork.dimensions,
        image: artwork.images?.[0]
          ? artwork.images[0].startsWith("http")
            ? artwork.images[0]
            : `${BASE_URL}${artwork.images[0]}`
          : undefined,
        url: `${BASE_URL}${canonicalPath}`,
        creator: {
          "@type": ["Person", "VisualArtist"],
          name: "Ani Muradyan",
          url: BASE_URL,
          nationality: { "@type": "Country", name: "Armenia" },
        },
        offers:
          SHOW_PRICES && artwork.availability === "available"
            ? {
                "@type": "Offer",
                price: artwork.price,
                priceCurrency: "USD",
                availability: "https://schema.org/InStock",
              }
            : undefined,
      });

      if (location !== canonicalPath) {
        window.history.replaceState(null, "", canonicalPath);
      }
    }
    return () => removeJsonLd("artwork-jsonld");
  }, [artwork, location]);

  const images = artwork?.images ?? [];
  const nextImage = () =>
    setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  const prevImage = () =>
    setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f5f1ea] flex items-center justify-center">
        <p className="font-playfair italic text-xl text-stone-500">Loading…</p>
      </div>
    );
  }

  if (error || !artwork) {
    return (
      <div className="min-h-screen bg-[#f5f1ea] flex items-center justify-center px-6">
        <div className="text-center">
          <h1 className="font-playfair text-3xl text-stone-900 mb-3">Artwork not found</h1>
          <p className="text-sm text-stone-600 mb-8">
            The piece you're looking for doesn't exist or has been removed.
          </p>
          <Link href="/artworks">
            <OutlineButton>Back to Originals</OutlineButton>
          </Link>
        </div>
      </div>
    );
  }

  const availabilityLabel =
    artwork.availability === "available"
      ? "Available"
      : artwork.availability === "sold"
        ? "Sold"
        : "Reserved";

  const priceLine =
    artwork.availability === "available"
      ? SHOW_PRICES && artwork.price
        ? `€${artwork.price.toLocaleString()}`
        : "Inquire"
      : availabilityLabel;

  const moreWorks = allArtworks.filter((a) => a.id !== artwork.id).slice(0, 3);

  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      <div className="mx-auto max-w-6xl px-6 py-10 md:py-14">
        {/* Back link */}
        <Link href="/artworks">
          <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.2em] uppercase text-stone-500 hover:text-stone-900 transition-colors mb-10">
            <ChevronLeft className="h-3.5 w-3.5" />
            Originals
          </span>
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">
          {/* Image column */}
          <div>
            <div className="relative bg-stone-200 overflow-hidden">
              {images.length > 0 ? (
                <img
                  src={images[currentImageIndex]}
                  alt={generateArtworkAlt(artwork.title, artwork.medium)}
                  title={`${artwork.title} – ${artwork.medium} by Ani Muradyan`}
                  className="w-full object-cover aspect-[4/5]"
                  loading="eager"
                />
              ) : (
                <div className="w-full aspect-[4/5] flex items-center justify-center">
                  <p className="text-sm text-stone-400">No image available</p>
                </div>
              )}

              {images.length > 1 && (
                <>
                  <button
                    onClick={prevImage}
                    aria-label="Previous image"
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center bg-white/85 hover:bg-white text-stone-800 shadow-md transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={nextImage}
                    aria-label="Next image"
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center bg-white/85 hover:bg-white text-stone-800 shadow-md transition-colors"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>

            {images.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pt-4">
                {images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentImageIndex(index)}
                    aria-label={`View image ${index + 1}`}
                    className={`flex-shrink-0 w-16 h-20 overflow-hidden transition-all ${
                      index === currentImageIndex
                        ? "ring-1 ring-stone-800 ring-offset-2 ring-offset-[#f5f1ea]"
                        : "opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={image}
                      alt={`${artwork.title} – view ${index + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details column */}
          <div className="lg:pt-4">
            <Eyebrow>{CATEGORY_LABEL[artworkCategory(artwork)]}</Eyebrow>
            <h1 className="font-playfair text-4xl md:text-5xl text-stone-900 mb-4">
              {artwork.title || "Untitled"}
            </h1>
            <p className="text-sm text-stone-800 mb-8">{priceLine}</p>

            {artwork.description && (
              <p className="text-sm leading-relaxed text-stone-700 mb-10 max-w-md">
                {artwork.description}
              </p>
            )}

            {/* Detail rows */}
            <dl className="border-t border-stone-300 mb-10">
              {[
                ["Medium", artwork.medium],
                ["Dimensions", artwork.dimensions],
                ["Year", artwork.year?.toString()],
                ["Availability", availabilityLabel],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex justify-between gap-6 border-b border-stone-300 py-4"
                >
                  <dt className="text-[11px] tracking-[0.2em] uppercase text-stone-500">{label}</dt>
                  <dd
                    className={`text-sm text-right ${
                      label === "Availability" && artwork.availability !== "available"
                        ? "text-red-600"
                        : "text-stone-800"
                    }`}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            {/* Actions — only for pieces that are still available */}
            {artwork.availability === "available" && (
              <div className="flex flex-wrap items-center gap-4">
                {artwork.buyLink ? (
                  <a href={artwork.buyLink} target="_blank" rel="noopener noreferrer">
                    <DarkButton>Buy Now</DarkButton>
                  </a>
                ) : (
                  <Link href="/contact">
                    <DarkButton>Buy Now</DarkButton>
                  </Link>
                )}
                {artwork.saatchiUrl && (
                  <button
                    onClick={() => window.open(artwork.saatchiUrl!, "_blank")}
                    className="inline-block border border-stone-800 px-6 py-3 text-[11px] tracking-[0.2em] uppercase text-stone-900 hover:bg-stone-900 hover:text-stone-50 transition-colors duration-300"
                  >
                    View on Saatchi Art
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* More from the collection */}
        {moreWorks.length > 0 && (
          <div className="mt-24 md:mt-32">
            <div className="flex items-end justify-between mb-10">
              <h2 className="font-playfair text-3xl md:text-4xl text-stone-900">
                More from the collection
              </h2>
              <Link href="/artworks">
                <span className="text-[10px] tracking-[0.2em] uppercase text-stone-700 border-b border-stone-400 pb-0.5 hover:text-stone-900 hover:border-stone-800 transition-colors">
                  View All Originals
                </span>
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-12">
              {moreWorks.map((a) => (
                <div key={a.id}>
                  <Link href={artworkPath(a)}>
                    <div className="group aspect-[4/5] overflow-hidden cursor-pointer bg-stone-200">
                      <img
                        src={a.images[0]}
                        alt={generateArtworkAlt(a.title, a.medium)}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        loading="lazy"
                      />
                    </div>
                  </Link>
                  <h3 className="font-playfair italic text-lg text-stone-900 mt-4">{a.title}</h3>
                  <p className="text-xs text-stone-500 mt-1">
                    {a.medium || "Oil on canvas"} · {a.dimensions}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
