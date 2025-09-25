import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import type { Artwork } from "@shared/schema";

export default function ArtworkDetailPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const artworkId = parseInt(params.id as string);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Fetch artwork data
  const { data: artwork, isLoading, error } = useQuery<Artwork>({
    queryKey: [`/api/artworks/${artworkId}`],
    enabled: !!artworkId && !isNaN(artworkId)
  });

  // Set page title for SEO and debug
  useEffect(() => {
    if (artwork) {
      console.log('Artwork data:', artwork);
      console.log('Artwork title:', artwork.title);
      document.title = `${artwork.title} | Original Artwork by Ani Muradyan`;
    }
  }, [artwork]);

  const nextImage = () => {
    if (!artwork || !artwork.images || artwork.images.length === 0) return;
    setCurrentImageIndex((prev) => 
      prev === artwork.images.length - 1 ? 0 : prev + 1
    );
  };

  const prevImage = () => {
    if (!artwork || !artwork.images || artwork.images.length === 0) return;
    setCurrentImageIndex((prev) => 
      prev === 0 ? artwork.images.length - 1 : prev - 1
    );
  };

  const selectImage = (index: number) => {
    setCurrentImageIndex(index);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-soft-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-deep-blue"></div>
          <p className="mt-4 text-charcoal">Loading artwork...</p>
        </div>
      </div>
    );
  }

  if (error || !artwork) {
    return (
      <div className="min-h-screen bg-soft-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-charcoal mb-4">Artwork Not Found</h1>
          <p className="text-gray-600 mb-6">The artwork you're looking for doesn't exist or has been removed.</p>
          <Button onClick={() => setLocation("/artworks")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Artworks
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-soft-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => setLocation("/artworks")}
          className="mb-8 text-charcoal hover:text-deep-blue"
          data-testid="button-back-artworks"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Artworks
        </Button>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Image Gallery */}
          <div className="space-y-4">
            {/* Main Image */}
            <div className="relative">
              {artwork.images && artwork.images.length > 0 ? (
                <img 
                  src={artwork.images[currentImageIndex]} 
                  alt={`${artwork.title} - Image ${currentImageIndex + 1}`}
                  className="w-full rounded-lg shadow-xl object-cover aspect-[3/4]"
                  data-testid={`img-artwork-main-${artworkId}`}
                />
              ) : (
                <div className="w-full rounded-lg shadow-xl bg-gray-200 aspect-[3/4] flex items-center justify-center">
                  <p className="text-gray-500">No image available</p>
                </div>
              )}
              
              {artwork.images && artwork.images.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={prevImage}
                    className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-white/80 hover:bg-white shadow-md"
                    data-testid="button-prev-image"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={nextImage}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-white/80 hover:bg-white shadow-md"
                    data-testid="button-next-image"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>

            {/* Image Thumbnails */}
            {artwork.images && artwork.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {artwork.images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => selectImage(index)}
                    className={`flex-shrink-0 w-20 h-20 rounded-md overflow-hidden border-2 transition-all ${
                      index === currentImageIndex
                        ? "border-deep-blue shadow-md"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    data-testid={`button-thumbnail-${index}`}
                  >
                    <img
                      src={image}
                      alt={`${artwork.title} thumbnail ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Artwork Details */}
          <div className="space-y-6">
            <div>
              <h1 className="text-4xl font-playfair text-deep-blue mb-4" data-testid={`text-title-${artworkId}`}>
                {artwork?.title || "Untitled"}
              </h1>
              
              <div className="flex items-center gap-4 mb-6">
                <Badge 
                  variant={artwork.availability === "available" ? "default" : "secondary"}
                  className="text-sm"
                  data-testid={`badge-availability-${artworkId}`}
                >
                  {artwork.availability === "available" ? "Available" : 
                   artwork.availability === "sold" ? "Sold" : "Reserved"}
                </Badge>
                <span className="text-2xl font-semibold text-charcoal" data-testid={`text-price-${artworkId}`}>
                  ${artwork.price?.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-charcoal mb-2">Description</h3>
                <p className="text-gray-700 leading-relaxed" data-testid={`text-description-${artworkId}`}>
                  {artwork.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold text-charcoal">Medium</h4>
                  <p className="text-gray-700">{artwork.medium}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-charcoal">Dimensions</h4>
                  <p className="text-gray-700">{artwork.dimensions}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-charcoal">Year</h4>
                  <p className="text-gray-700">{artwork.year}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-charcoal">Type</h4>
                  <p className="text-gray-700 capitalize">{artwork.type}</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-4 pt-6">
              {artwork.availability === "available" && (
                <div className="space-y-3">
                  {artwork.saatchiUrl && (
                    <Button 
                      className="w-full bg-deep-blue hover:bg-deep-blue/90"
                      onClick={() => artwork.saatchiUrl && window.open(artwork.saatchiUrl, '_blank')}
                      data-testid="button-saatchi-link"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      View on Saatchi Art
                    </Button>
                  )}
                  {artwork.buyLink && (
                    <Button 
                      variant="outline"
                      className="w-full"
                      onClick={() => artwork.buyLink && window.open(artwork.buyLink, '_blank')}
                      data-testid="button-buy-link"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Purchase Options
                    </Button>
                  )}
                </div>
              )}
              
              <div className="text-sm text-gray-600 text-center pt-4">
                <p>For inquiries about this artwork, please visit our <a href="/contact" className="text-deep-blue hover:underline">contact page</a>.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}