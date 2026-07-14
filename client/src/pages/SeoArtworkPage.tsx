import { useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ExternalLink, Mail } from "lucide-react";
import type { Artwork } from "@shared/schema";
import { updateCanonicalUrl, updateMetaDescription, injectJsonLd, removeJsonLd, BASE_URL, toSlug, generateArtworkAlt } from "@/lib/seo";
import { SHOW_PRICES } from "@/lib/featureFlags";

export default function SeoArtworkPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const seoSlug = params.seoSlug as string;

  const { data: artwork, isLoading, error } = useQuery<Artwork>({
    queryKey: ['/api/artworks/seo', seoSlug],
    queryFn: async () => {
      const res = await fetch(`/api/artworks/seo/${seoSlug}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: !!seoSlug,
    retry: false
  });

  useEffect(() => {
    if (artwork) {
      const artworkSlug = toSlug(artwork.title);
      const styleLabel = artwork.type === 'oil' ? 'oil painting' : artwork.type === 'acrylic' ? 'acrylic painting' : 'mixed media painting';

      document.title = `${artwork.title} – Original ${artwork.medium} by Ani Muradyan | Anymoore Art`;

      updateCanonicalUrl(`/${seoSlug}`);

      updateMetaDescription(
        `${artwork.title} – original ${styleLabel} by Armenian contemporary artist Ani Muradyan. ` +
        `${artwork.dimensions}, ${artwork.year}. Abstract realism, oil on canvas. ` +
        `${artwork.availability === 'available' ? 'Available for purchase.' : 'Enquire for availability.'}`
      );

      injectJsonLd('seo-artwork-jsonld', {
        "@context": "https://schema.org",
        "@type": "VisualArtwork",
        "name": artwork.title,
        "description": artwork.description,
        "artMedium": artwork.medium || "Oil on canvas",
        "artform": "Painting",
        "artworkSurface": "Canvas",
        "artworkStyle": "Abstract Realism",
        "dateCreated": artwork.year?.toString(),
        "height": artwork.dimensions,
        "image": artwork.images?.[0]
          ? (artwork.images[0].startsWith('http') ? artwork.images[0] : `${BASE_URL}${artwork.images[0]}`)
          : undefined,
        "url": `${BASE_URL}/${seoSlug}`,
        "creator": {
          "@type": ["Person", "VisualArtist"],
          "name": "Ani Muradyan",
          "alternateName": "Anymoore Art",
          "nationality": { "@type": "Country", "name": "Armenia" },
          "url": BASE_URL
        },
        "offers": SHOW_PRICES && artwork.availability === 'available' ? {
          "@type": "Offer",
          "price": artwork.price,
          "priceCurrency": "USD",
          "availability": "https://schema.org/InStock"
        } : undefined,
        "sameAs": `${BASE_URL}/artworks/${artworkSlug}`
      });

      injectJsonLd('seo-artwork-breadcrumb', {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": BASE_URL },
          { "@type": "ListItem", "position": 2, "name": "Artworks", "item": `${BASE_URL}/artworks` },
          { "@type": "ListItem", "position": 3, "name": artwork.title, "item": `${BASE_URL}/${seoSlug}` }
        ]
      });
    }
    return () => {
      removeJsonLd('seo-artwork-jsonld');
      removeJsonLd('seo-artwork-breadcrumb');
    };
  }, [artwork, seoSlug]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-soft-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-deep-blue" />
      </div>
    );
  }

  if (error || !artwork) {
    return (
      <div className="min-h-screen bg-soft-white flex items-center justify-center">
        <div className="text-center px-4">
          <h1 className="text-2xl font-bold text-charcoal mb-4">Page Not Found</h1>
          <p className="text-gray-600 mb-6">This artwork page doesn't exist.</p>
          <Button onClick={() => setLocation("/artworks")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Browse All Artworks
          </Button>
        </div>
      </div>
    );
  }

  const artworkSlug = toSlug(artwork.title);
  const altText = generateArtworkAlt(artwork.title, artwork.medium);
  const styleMap: Record<string, string> = {
    oil: 'Oil Painting',
    acrylic: 'Acrylic Painting',
    mixed: 'Mixed Media',
  };
  const styleLabel = styleMap[artwork.type] || artwork.type;

  return (
    <main className="min-h-screen bg-soft-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

          <nav aria-label="Breadcrumb" className="mb-8 text-sm text-gray-500 flex items-center gap-2">
            <Link href="/" className="hover:text-deep-blue transition-colors">Home</Link>
            <span>/</span>
            <Link href="/artworks" className="hover:text-deep-blue transition-colors">Artworks</Link>
            <span>/</span>
            <span className="text-charcoal font-medium">{artwork.title}</span>
          </nav>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div className="relative">
              {artwork.images && artwork.images.length > 0 ? (
                <img
                  src={artwork.images[0]}
                  alt={altText}
                  title={`${artwork.title} by Ani Muradyan – ${styleLabel}`}
                  className="w-full rounded-lg shadow-lg object-contain max-h-[600px] bg-gray-50"
                />
              ) : (
                <div className="w-full aspect-square bg-gray-100 rounded-lg flex items-center justify-center">
                  <span className="text-gray-400">No image available</span>
                </div>
              )}
              {artwork.images && artwork.images.length > 1 && (
                <div className="mt-4 grid grid-cols-4 gap-2">
                  {artwork.images.slice(1).map((img, i) => (
                    <img
                      key={i}
                      src={img}
                      alt={`${artwork.title} – view ${i + 2}`}
                      className="w-full aspect-square object-cover rounded shadow-sm"
                      loading="lazy"
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-6">
              <div>
                <div className="flex flex-wrap gap-2 mb-3">
                  <Badge variant="secondary">{styleLabel}</Badge>
                  {artwork.availability === 'available' ? (
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Available</Badge>
                  ) : (
                    <Badge variant="outline" className="text-gray-500">Sold</Badge>
                  )}
                </div>
                <h1 className="text-3xl sm:text-4xl font-serif font-bold text-charcoal leading-tight mb-2">
                  {artwork.title}
                </h1>
                <p className="text-gray-500 text-sm">
                  by <span className="font-medium text-charcoal">Ani Muradyan</span> · {artwork.year}
                </p>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">About This Painting</h2>
                <p className="text-charcoal leading-relaxed text-base">
                  {artwork.description}
                </p>
              </div>

              <div className="border-t border-gray-100 pt-5">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Artwork Details</h2>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <dt className="text-gray-500">Artist</dt>
                  <dd className="text-charcoal font-medium">Ani Muradyan</dd>

                  <dt className="text-gray-500">Medium</dt>
                  <dd className="text-charcoal font-medium">{artwork.medium}</dd>

                  <dt className="text-gray-500">Style</dt>
                  <dd className="text-charcoal font-medium">Abstract Realism</dd>

                  <dt className="text-gray-500">Year</dt>
                  <dd className="text-charcoal font-medium">{artwork.year}</dd>

                  <dt className="text-gray-500">Dimensions</dt>
                  <dd className="text-charcoal font-medium">{artwork.dimensions}</dd>

                  {SHOW_PRICES && artwork.availability === 'available' && artwork.price > 0 && (
                    <>
                      <dt className="text-gray-500">Price</dt>
                      <dd className="text-charcoal font-medium">${artwork.price.toLocaleString()}</dd>
                    </>
                  )}
                </dl>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                {artwork.availability === 'available' && (
                  <Button asChild className="bg-deep-blue hover:bg-blue-800">
                    <Link href="/contact">
                      <Mail className="w-4 h-4 mr-2" />
                      Enquire About This Painting
                    </Link>
                  </Button>
                )}
                <Button asChild variant="outline">
                  <Link href={`/artworks/${artworkSlug}`}>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View Full Details
                  </Link>
                </Button>
              </div>

              {(artwork.saatchiUrl || artwork.buyLink) && (
                <div className="flex flex-wrap gap-3 pt-1">
                  {artwork.saatchiUrl && (
                    <a
                      href={artwork.saatchiUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-deep-blue underline underline-offset-2 hover:text-blue-900"
                    >
                      View on Saatchi Art
                    </a>
                  )}
                  {artwork.buyLink && (
                    <a
                      href={artwork.buyLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-deep-blue underline underline-offset-2 hover:text-blue-900"
                    >
                      Purchase Online
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          <section className="mt-16 border-t border-gray-100 pt-10">
            <h2 className="text-xl font-serif font-semibold text-charcoal mb-3">About the Artist</h2>
            <p className="text-gray-600 leading-relaxed max-w-2xl">
              Ani Muradyan is a contemporary Armenian artist working in abstract realism. Her oil paintings
              explore themes of identity, stillness, and emotional depth through layered compositions and
              a restrained palette. Originally from Armenia, her work has been exhibited internationally
              and is available through Anymoore Art.
            </p>
            <div className="mt-6 flex flex-wrap gap-4">
              <Link href="/artworks" className="text-sm text-deep-blue hover:underline underline-offset-2">
                Browse all paintings
              </Link>
              <Link href="/contact" className="text-sm text-deep-blue hover:underline underline-offset-2">
                Contact the artist
              </Link>
            </div>
          </section>
        </div>
    </main>
  );
}
