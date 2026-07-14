import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { GalleryPhoto } from "@shared/schema";
import { updateCanonicalUrl, updateMetaDescription } from "@/lib/seo";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Link } from "wouter";
import { Eyebrow } from "@/components/editorial";

export default function GalleryPage() {
  useEffect(() => {
    document.title = "Exhibition Gallery | Ani Muradyan – Contemporary Armenian Artist";
    updateCanonicalUrl("/gallery");
    updateMetaDescription(
      "Photo gallery from exhibitions by Armenian contemporary artist Ani Muradyan — behind-the-scenes moments from solo and group art shows."
    );
  }, []);

  const { data: galleryPhotos = [] } = useQuery<GalleryPhoto[]>({
    queryKey: ["/api/gallery-photos"],
  });

  const sortedPhotos = [...galleryPhotos].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  const openLightbox = (index: number) => {
    setCurrentPhotoIndex(index);
    setLightboxOpen(true);
  };
  const nextPhoto = () => setCurrentPhotoIndex((prev) => (prev + 1) % sortedPhotos.length);
  const previousPhoto = () =>
    setCurrentPhotoIndex((prev) => (prev - 1 + sortedPhotos.length) % sortedPhotos.length);

  const currentPhoto = sortedPhotos[currentPhotoIndex];
  const caption = (p?: GalleryPhoto) =>
    p ? [p.title, p.exhibitionName, p.location, p.year].filter(Boolean).join(" · ") : "";

  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      {/* ── Header ─────────────────────────────────────────── */}
      <section className="px-6 pt-20 md:pt-28 pb-8 text-center">
        <Eyebrow>Behind the Scenes</Eyebrow>
        <h1 className="font-playfair text-5xl md:text-6xl text-stone-900 mb-5">Gallery</h1>
        <p className="mx-auto max-w-xl text-sm md:text-base text-stone-600">
          Moments from exhibitions, art fairs, and the studio.
        </p>
      </section>

      {/* ── Masonry grid ───────────────────────────────────── */}
      <section className="px-6 py-10 md:py-16">
        <div className="mx-auto max-w-6xl">
          {sortedPhotos.length === 0 ? (
            <p className="py-20 text-center font-playfair italic text-2xl text-stone-500">
              Gallery photos coming soon.
            </p>
          ) : (
            <div className="columns-2 lg:columns-3 gap-4 md:gap-6 [column-fill:_balance]">
              {sortedPhotos.map((photo, index) => (
                <button
                  key={photo.id}
                  onClick={() => openLightbox(index)}
                  className="group mb-4 md:mb-6 block w-full break-inside-avoid overflow-hidden bg-stone-200"
                  aria-label={photo.title || `Exhibition photo ${index + 1}`}
                >
                  <img
                    src={photo.image}
                    alt={
                      photo.title
                        ? `${photo.title} – Ani Muradyan`
                        : `Exhibition photo – Ani Muradyan contemporary art`
                    }
                    className="w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="lazy"
                  />
                  {caption(photo) && (
                    <span className="block px-1 pt-2 pb-1 text-left font-playfair italic text-sm text-stone-600">
                      {caption(photo)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Closing note ───────────────────────────────────── */}
      {sortedPhotos.length > 0 && (
        <section className="px-6 pb-24 text-center">
          <p className="text-sm text-stone-500">
            Explore the{" "}
            <Link
              href="/artworks"
              className="border-b border-stone-400 hover:text-stone-900 hover:border-stone-800 transition-colors"
            >
              collection of original paintings
            </Link>
            .
          </p>
        </section>
      )}

      {/* ── Lightbox ───────────────────────────────────────── */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-5xl w-[95vw] p-0 bg-transparent border-none shadow-none">
          <DialogTitle className="sr-only">
            {currentPhoto?.title || "Gallery photo"}
          </DialogTitle>
          <div className="relative flex items-center justify-center">
            <button
              onClick={() => setLightboxOpen(false)}
              aria-label="Close"
              className="absolute -top-12 right-0 z-50 flex h-10 w-10 items-center justify-center text-white/80 hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>

            {sortedPhotos.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  previousPhoto();
                }}
                aria-label="Previous"
                className="absolute left-3 z-50 flex h-11 w-11 items-center justify-center bg-white/85 hover:bg-white text-stone-800 shadow-md"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            {currentPhoto && (
              <img
                src={currentPhoto.image}
                alt={currentPhoto.title || "Exhibition photo – Ani Muradyan"}
                className="max-h-[85vh] w-auto max-w-full object-contain"
              />
            )}

            {sortedPhotos.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  nextPhoto();
                }}
                aria-label="Next"
                className="absolute right-3 z-50 flex h-11 w-11 items-center justify-center bg-white/85 hover:bg-white text-stone-800 shadow-md"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}

            {caption(currentPhoto) && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-6 text-center">
                <p className="font-playfair italic text-white text-lg">{caption(currentPhoto)}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
