import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { GalleryPhoto } from "@shared/schema";
import { updateCanonicalUrl } from "@/lib/seo";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export default function GalleryPage() {
  useEffect(() => {
    document.title = "Exhibition Gallery | Ani Muradyan – Contemporary Artist";
    updateCanonicalUrl('/gallery');
  }, []);

  const { data: galleryPhotos = [], isLoading } = useQuery<GalleryPhoto[]>({
    queryKey: ["/api/gallery-photos"],
  });

  const sortedPhotos = [...galleryPhotos].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  const openLightbox = (index: number) => {
    setCurrentPhotoIndex(index);
    setLightboxOpen(true);
  };

  const nextPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev + 1) % sortedPhotos.length);
  };

  const previousPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev - 1 + sortedPhotos.length) % sortedPhotos.length);
  };

  const currentPhoto = sortedPhotos[currentPhotoIndex];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-3 rounded-full text-sm font-medium text-blue-700 mb-8 animate-fadeIn">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            Exhibition Gallery
          </div>
          <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-transparent mb-6 animate-slideUp">
            Gallery
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed animate-slideUp animation-delay-200">
            A visual journey through exhibitions and special moments
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="w-full h-96 bg-gradient-to-br from-slate-200 to-slate-300 rounded-3xl"></div>
              </div>
            ))}
          </div>
        ) : sortedPhotos.length === 0 ? (
          <div className="text-center py-20">
            <div className="inline-flex items-center gap-3 bg-white px-8 py-6 rounded-3xl shadow-xl border border-slate-200/50">
              <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-lg text-slate-600">Gallery photos coming soon</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {sortedPhotos.map((photo, index) => (
              <div 
                key={photo.id} 
                className="group relative animate-fadeIn cursor-pointer"
                style={{ animationDelay: `${index * 100}ms` }}
                onClick={() => openLightbox(index)}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-3xl blur opacity-0 group-hover:opacity-20 transition-opacity duration-500"></div>
                <div className="relative bg-white rounded-3xl shadow-xl border border-slate-200/50 overflow-hidden hover:shadow-2xl transition-all duration-500 transform group-hover:scale-105">
                  <div className="aspect-[4/3] overflow-hidden">
                    <img
                      src={photo.image}
                      alt={`${photo.title || 'Exhibition photo'} by Ani Muradyan – contemporary abstract realism exhibition photo`}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      loading="lazy"
                      data-testid={`img-gallery-${photo.id}`}
                    />
                  </div>
                  <div className="p-6">
                    {photo.title && (
                      <h2 className="text-xl font-semibold text-slate-900 mb-2">
                        {photo.title}
                      </h2>
                    )}
                    {(photo.exhibitionName || photo.location || photo.year) && (
                      <div className="space-y-1 text-sm text-slate-600">
                        {photo.exhibitionName && (
                          <p className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                            <span>{photo.exhibitionName}</span>
                          </p>
                        )}
                        {photo.location && (
                          <p className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span>{photo.location}</span>
                          </p>
                        )}
                        {photo.year && (
                          <p className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span>{photo.year}</span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox Dialog */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-7xl w-full h-[90vh] p-0 bg-black/95 border-none">
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
            {sortedPhotos.length > 1 && (
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
            {sortedPhotos.length > 1 && (
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
    </div>
  );
}
