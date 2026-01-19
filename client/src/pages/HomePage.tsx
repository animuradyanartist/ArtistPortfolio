import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Link } from "wouter";
import { ExternalLink, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { Artwork, HomepageSettings, GalleryPhoto } from "@shared/schema";
import backgroundImage from "@assets/1bg_1750936488071.png";
import { updateCanonicalUrl } from "@/lib/seo";

export default function HomePage() {
  useEffect(() => {
    updateCanonicalUrl('/');
  }, []);
  
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const { data: homepageSettings } = useQuery<HomepageSettings>({
    queryKey: ["/api/homepage-settings"]
  });

  const { data: artworks = [], isLoading: artworksLoading } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks"]
  });

  const { data: galleryPhotos = [] } = useQuery<GalleryPhoto[]>({
    queryKey: ["/api/gallery-photos"]
  });

  // Get the latest artwork (most recent by ID)
  const latestArtwork = artworks.length > 0 ? artworks[artworks.length - 1] : null;
  
  const featuredArtworks = artworks.filter(artwork => artwork.featured).slice(0, 3);
  const featuredGalleryPhotos = galleryPhotos
    .filter(photo => photo.featured)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .slice(0, 4);

  const handleBuyNow = (saatchiUrl?: string) => {
    if (saatchiUrl) {
      window.open(saatchiUrl, '_blank');
    }
  };

  const openLightbox = (index: number) => {
    setCurrentPhotoIndex(index);
    setLightboxOpen(true);
  };

  const nextPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev + 1) % featuredGalleryPhotos.length);
  };

  const previousPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev - 1 + featuredGalleryPhotos.length) % featuredGalleryPhotos.length);
  };

  const currentPhoto = featuredGalleryPhotos[currentPhotoIndex];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* Hero Section */}
      <div className="relative h-screen overflow-hidden">
        {/* Animated Background */}
        <div 
          className="absolute inset-0 bg-cover bg-center transform scale-105 animate-float"
          style={{
            backgroundImage: `url('${homepageSettings?.heroImage || backgroundImage}')`
          }}
        />
        
        {/* Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/70 via-slate-900/50 to-slate-900/70" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent" />
        
        {/* Animated Particles */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-2 h-2 bg-white/20 rounded-full animate-pulse"></div>
          <div className="absolute top-40 right-32 w-1 h-1 bg-blue-400/30 rounded-full animate-pulse animation-delay-200"></div>
          <div className="absolute bottom-32 left-40 w-1.5 h-1.5 bg-indigo-400/20 rounded-full animate-pulse animation-delay-400"></div>
          <div className="absolute bottom-20 right-20 w-2 h-2 bg-white/10 rounded-full animate-pulse animation-delay-600"></div>
        </div>
        
        <div className="relative h-screen flex items-center justify-center text-center text-white">
          <div className="w-full max-w-6xl px-4">
            <div className="flex flex-col items-center justify-center h-full">
              <div className="inline-flex items-center gap-3 bg-white/10 backdrop-blur-md px-8 py-4 rounded-full text-sm font-medium text-white mb-10 animate-fadeIn border border-white/20">
                <div className="w-3 h-3 bg-gradient-to-r from-blue-400 to-indigo-400 rounded-full animate-pulse"></div>
                <span className="text-base">Contemporary Abstract Realism Artist • Oil Paintings & Fine Art Prints</span>
              </div>
              
              <h1 className="text-6xl md:text-8xl lg:text-9xl font-bold mb-8 bg-gradient-to-r from-white via-slate-100 to-white bg-clip-text text-transparent animate-slideUp text-center">
                Ani Muradyan
              </h1>
              
              <blockquote className="text-2xl md:text-4xl lg:text-5xl italic mb-16 text-slate-200 font-light leading-relaxed max-w-5xl text-center animate-slideUp animation-delay-200">
                "{homepageSettings?.heroQuote || 'Art must bring hope into people\'s lives.'}"
              </blockquote>
              
              <div className="flex flex-col sm:flex-row gap-6 items-center justify-center animate-slideUp animation-delay-400">
                <Link href="/artworks">
                  <Button className="group h-16 px-10 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium rounded-2xl transition-all duration-500 transform hover:scale-105 shadow-2xl hover:shadow-blue-500/25">
                    <span className="text-lg group-hover:text-white transition-colors">View Artworks</span>
                    <div className="ml-2 transform group-hover:translate-x-1 transition-transform">
                      <ExternalLink className="w-5 h-5" />
                    </div>
                  </Button>
                </Link>
                <Link href="/about">
                  <Button className="group h-16 px-10 bg-white/10 backdrop-blur-md text-white border border-white/30 hover:bg-white/20 hover:border-white/50 font-medium rounded-2xl transition-all duration-500 transform hover:scale-105 shadow-xl">
                    <span className="text-lg group-hover:text-white transition-colors">About the Artist</span>
                  </Button>
                </Link>
              </div>
            </div>
          </div>
          
          {/* Scroll Indicator */}
          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-fadeIn animation-delay-600">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center">
                <div className="w-1 h-3 bg-white/50 rounded-full animate-pulse mt-2"></div>
              </div>
              <span className="text-white/60 text-sm">Scroll to explore</span>
            </div>
          </div>
        </div>
      </div>


      {/* Featured Works Section */}
      <div className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-3 rounded-full text-sm font-medium text-blue-700 mb-6">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              Featured Works
            </div>
            <h2 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-transparent mb-6">
              Curated Selection
            </h2>
            <p className="text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
              A curated selection of pieces that represent the essence of my artistic journey.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {featuredArtworks.map((artwork) => (
              <div key={artwork.id} className="bg-white rounded-3xl shadow-xl border border-slate-200/50 overflow-hidden hover:shadow-2xl transition-all duration-300 transform hover:scale-105">
                <div className="aspect-[4/3] bg-gradient-to-br from-slate-100 to-slate-200">
                  <img 
                    src={artwork.images[0]} 
                    alt={`${artwork.title} by Ani Muradyan – contemporary abstract realism oil painting`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="p-6">
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">
                    {artwork.title}
                  </h3>
                  <p className="text-slate-600 text-sm mb-4">
                    {artwork.medium}, {artwork.dimensions}
                  </p>
                  <div className="flex justify-between items-center">
                    <span className="text-2xl font-bold text-slate-900">
                      ${artwork.price.toLocaleString()}
                    </span>
                    <Badge 
                      variant={artwork.availability === 'available' ? 'default' : 'destructive'}
                      className={artwork.availability === 'available' 
                        ? 'bg-green-100 text-green-800 hover:bg-green-100' 
                        : 'bg-red-100 text-red-800 hover:bg-red-100'
                      }
                    >
                      {artwork.availability === 'available' ? 'Available' : 'Sold'}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-16">
            <Link href="/artworks">
              <Button className="h-12 px-8 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-lg">
                <span className="text-lg">View All Artworks</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Gallery Section */}
      {featuredGalleryPhotos.length > 0 && (
        <div className="py-24 bg-gradient-to-br from-slate-50 to-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-20">
              <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-3 rounded-full text-sm font-medium text-blue-700 mb-6">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                Exhibition Gallery
              </div>
              <h2 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-transparent mb-6">
                Behind the Scenes
              </h2>
              <p className="text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
                Glimpses from exhibitions and special moments in the artistic journey.
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {featuredGalleryPhotos.map((photo, index) => (
                <div 
                  key={photo.id} 
                  className="group relative animate-fadeIn cursor-pointer"
                  style={{ animationDelay: `${index * 100}ms` }}
                  onClick={() => openLightbox(index)}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-3xl blur opacity-0 group-hover:opacity-20 transition-opacity duration-500"></div>
                  <div className="relative bg-white rounded-3xl shadow-xl border border-slate-200/50 overflow-hidden hover:shadow-2xl transition-all duration-500 transform group-hover:scale-105">
                    <div className="aspect-square overflow-hidden">
                      <img
                        src={photo.image}
                        alt={`${photo.title || 'Exhibition photo'} by Ani Muradyan – contemporary abstract realism exhibition photo`}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        loading="lazy"
                        data-testid={`img-homepage-gallery-${photo.id}`}
                      />
                    </div>
                    <div className="p-4">
                      {photo.title && (
                        <h3 className="text-sm font-semibold text-slate-900 line-clamp-2">
                          {photo.title}
                        </h3>
                      )}
                      {photo.year && (
                        <p className="text-xs text-slate-600 mt-1">{photo.year}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center mt-16">
              <Link href="/gallery">
                <Button className="h-12 px-8 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-lg">
                  <span className="text-lg">View Full Gallery</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Dialog */}
      {featuredGalleryPhotos.length > 0 && (
        <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
          <DialogContent className="w-[800px] h-[500px] p-0 bg-black/95 border-none">
            <div className="relative w-full h-full flex items-center justify-center">
              {/* Close Button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4 z-50 text-white hover:bg-white/20 rounded-full"
                onClick={() => setLightboxOpen(false)}
              >
                <X className="w-6 h-6" />
              </Button>

              {/* Previous Button */}
              {featuredGalleryPhotos.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-4 z-50 text-white hover:bg-white/20 rounded-full w-12 h-12"
                  onClick={(e) => {
                    e.stopPropagation();
                    previousPhoto();
                  }}
                >
                  <ChevronLeft className="w-8 h-8" />
                </Button>
              )}

              {/* Photo */}
              {currentPhoto && (
                <div className="w-full h-full flex items-center justify-center p-4">
                  <img
                    src={currentPhoto.image}
                    alt={currentPhoto.title || 'Exhibition photo'}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              )}

              {/* Next Button */}
              {featuredGalleryPhotos.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-4 z-50 text-white hover:bg-white/20 rounded-full w-12 h-12"
                  onClick={(e) => {
                    e.stopPropagation();
                    nextPhoto();
                  }}
                >
                  <ChevronRight className="w-8 h-8" />
                </Button>
              )}

              {/* Photo Info */}
              {currentPhoto && (currentPhoto.title || currentPhoto.exhibitionName || currentPhoto.location || currentPhoto.year) && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-8">
                  {currentPhoto.title && (
                    <h3 className="text-2xl font-semibold text-white mb-2">{currentPhoto.title}</h3>
                  )}
                  <div className="flex flex-wrap gap-4 text-sm text-white/80">
                    {currentPhoto.exhibitionName && <span>{currentPhoto.exhibitionName}</span>}
                    {currentPhoto.location && <span>{currentPhoto.location}</span>}
                    {currentPhoto.year && <span>{currentPhoto.year}</span>}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Footer */}
      <footer className="bg-black text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h3 className="font-playfair text-xl font-semibold mb-4">Ani Muradyan</h3>
              <p className="text-gray-300 text-sm">
                Abstract Realism Artist from Armenia, creating works that bring hope and emotion into people's lives.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Quick Links</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/" className="text-gray-300 hover:text-white transition-colors duration-300">Home</Link></li>
                <li><Link href="/artworks" className="text-gray-300 hover:text-white transition-colors duration-300">Artworks</Link></li>
                <li><Link href="/about" className="text-gray-300 hover:text-white transition-colors duration-300">About</Link></li>
                <li><Link href="/exhibitions" className="text-gray-300 hover:text-white transition-colors duration-300">Exhibitions</Link></li>
                <li><Link href="/contact" className="text-gray-300 hover:text-white transition-colors duration-300">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Connect</h4>
              <div className="flex space-x-4">
                <a 
                  href="https://www.instagram.com/animuradyan.art/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-300 hover:text-white transition-colors duration-300"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </a>
                <a 
                  href="https://www.saatchiart.com/account/profile/1980379" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-300 hover:text-white transition-colors duration-300"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                </a>
                <a 
                  href="mailto:animuradyan.artist@gmail.com"
                  className="text-gray-300 hover:text-white transition-colors duration-300"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-700 mt-8 pt-8 flex justify-between items-center">
            <p className="text-gray-300 text-sm">&copy; 2024 Ani Muradyan. All rights reserved.</p>
            <Link href="/admin" className="text-gray-500 hover:text-gray-300 text-xs">Admin</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
