import { useState, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Artwork } from "@shared/schema";
import { PurchasePanel } from "@/components/PurchasePanel";
import { artworkCommerceDisplay } from "@shared/commerce/display";
import { isKnownAddressFor } from "@shared/artworkAddress";
import { artworkJsonLd, artworkDimensions, type SsrArtwork } from "@shared/artworkSsr";
import { ArtworkMissingError, isMissingResponse, meansArtworkMissing, artworkViewState } from "@shared/artworkAvailability";
import { useAfterPaint } from "@/lib/afterPaint";
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
import CollectorSignup from "@/components/CollectorSignup";

/**
 * THE PAINTING THE SERVER ALREADY SENT.
 *
 * The artwork detail HTML carries the row it was prerendered from (see the SSR handler in
 * server/routes.ts). Without this the page mounted, discarded that prerender and showed a
 * full-screen "Loading…" until /api/artworks/:id answered — a wait the server had already
 * done the work to avoid.
 *
 * MATCHED BY ADDRESS, NOT ASSUMED. The preload describes the painting this DOCUMENT was
 * served for. Navigating to another work inside the app leaves it on `window`, so it is only
 * used when the URL genuinely belongs to that artwork — the same shared rule the server
 * redirect and the resolver use, so all three agree on what a painting's addresses are.
 */
const _preloadedArtwork: Artwork | undefined =
  typeof window !== "undefined" ? (window as any).__PRELOADED_ARTWORK__ : undefined;

function preloadFor(param: string): Artwork | undefined {
  const a = _preloadedArtwork;
  if (!a || typeof a.id !== "number") return undefined;
  return isKnownAddressFor(a, param) ? a : undefined;
}

const CATEGORY_LABEL = { landscape: "Landscape", figurative: "Figurative" } as const;

/** Four, so three remain after the work being viewed is filtered out. */
const RELATED_POOL = 4;

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

  const preloaded = preloadFor(idParam);

  const { data: fetchedArtwork, isLoading, error } = useQuery<Artwork>({
    queryKey: ["/api/artworks", idParam],
    queryFn: async () => {
      const res = await fetch(`/api/artworks/${idParam}`, { credentials: "include" });
      // A 404 is the server saying this painting does not exist. Anything else is the server
      // failing to answer — a different fact, which must not be reported as absence.
      if (isMissingResponse(res.status)) throw new ArtworkMissingError(idParam);
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: !!idParam,
    // Renders immediately from the server's own copy; the fetch still runs and replaces it.
    ...(preloaded ? { placeholderData: preloaded } : {}),
    // Never retry a definitive 404 — the answer will not change and each retry is a request
    // against a page that is already correctly not-found.
    retry: (count, err) => !meansArtworkMissing(err) && count < 2,
  });

  // WHICH PAINTING, IF ANY, THIS PAGE HAS TO SHOW.
  //
  // Decided by one shared rule rather than by `error || !artwork`, which treated EVERY failed
  // request as proof of absence. That is what turned Blue Drift into a soft 404: the fetch
  // failed once, and the page declared the painting non-existent while the server's own copy
  // of it sat on `window.__PRELOADED_ARTWORK__`. See shared/artworkAvailability.ts.
  //
  // Named `artwork` so everything below reads the painting that is actually being displayed —
  // the fetched row when there is one, the server's preload when there is not.
  const view = artworkViewState<Artwork>({ fetched: fetchedArtwork, preloaded, error, isLoading });
  const artwork = view.show;

  // "MORE FROM THE COLLECTION" IS NOT WHY ANYONE OPENED THIS PAGE.
  //
  // Three thumbnails, far below the fold, were costing the whole 54-artwork catalogue —
  // 111KB — requested in the same breath as the painting itself. Two things changed: it asks
  // for four works instead of every one, and it does not ask at all until the browser has
  // painted and gone idle, so it can no longer compete with the artwork for the first render.
  // Its own query key, so the gallery's cache of the full collection is untouched.
  const relatedReady = useAfterPaint();

  const { data: relatedPool = [] } = useQuery<Artwork[]>({
    queryKey: [`/api/artworks?limit=${RELATED_POOL}`],
    enabled: relatedReady,
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

      // THE SAME BUILDER THE SERVER USES — artworkJsonLd from @shared/artworkSsr.
      //
      // This block used to be hand-rolled here, which made it diverge from the server's
      // VisualArtwork in three ways at once: a different image URL (?v= vs clean), a malformed
      // `height` (the "89x79cm" string in a numeric field), and no width. And because the
      // server injects its block WITHOUT sharing this id, the two coexisted — duplicate,
      // conflicting structured data on the rendered page. Using the shared builder makes this
      // byte-identical to the server's, and injectJsonLd updates the server's #artwork-jsonld
      // in place, so the page carries exactly one correct VisualArtwork. artwork.images already
      // carry the ?v=<hash> the builder preserves, so the image URL matches the rendered <img>.
      injectJsonLd("artwork-jsonld", artworkJsonLd(artwork as unknown as SsrArtwork, BASE_URL));

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

  if (view.state === "loading") {
    return (
      <div className="min-h-screen bg-[#f5f1ea] flex items-center justify-center">
        <p className="font-playfair italic text-xl text-stone-500">Loading…</p>
      </div>
    );
  }

  if (view.state === "missing" || !artwork) {
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

  /**
   * ONE RULE, SHARED WITH THE SERVER. This used to re-derive "is it on direct sale?" inline,
   * which is exactly how a public page drifts away from what checkout will actually accept.
   */
  const commerce = artworkCommerceDisplay(artwork as never);
  const directSale = commerce.directSale;

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

  const moreWorks = relatedPool.filter((a) => a.id !== artwork.id).slice(0, 3);

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
                  width={artworkDimensions(artwork as unknown as SsrArtwork)?.width}
                  height={artworkDimensions(artwork as unknown as SsrArtwork)?.height}
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
            {/* TWO PRICES ON ONE PAGE IS A PAGE THAT CANNOT BE TRUSTED.
                When direct sale is on, the purchase panel below states the real price, the
                shipping and the total. This line — which reads the MARKETPLACE figure, and
                says "Inquire" when there is none — would sit above it saying something
                different about the same painting. So it stands down and the panel speaks. */}
            {!directSale && <p className="text-sm text-stone-800 mb-8">{priceLine}</p>}

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

            {/* DIRECT SALE, when she has switched it on for this work. The panel renders
                nothing at all otherwise, so every un-enabled painting keeps exactly the
                marketplace behaviour it has today (PART 34). */}
            <PurchasePanel artworkId={artwork.id} marketplaceUrl={commerce.marketplaceUrl}
              marketplaceLabel={commerce.marketplaceLabel} />

            {/* The existing marketplace actions, shown when direct sale is NOT the route. */}
            {!directSale && artwork.availability === "available" && (
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

        {/* Highest-intent surface: a collector viewing a specific original. Contextual,
            reused capture → the real owned list, tagged source="artwork" for measurement. */}
        <CollectorSignup
          source="artwork"
          variant="compact"
          heading="First choice on new originals"
          description="This painting is one of a kind — like every original. Join the collector list to see new work first, and be first to acquire it, before it's shown publicly."
        />
      </div>
    </div>
  );
}
