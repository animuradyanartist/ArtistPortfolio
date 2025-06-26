import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, X, ChevronLeft, ChevronRight } from "lucide-react";
import type { Artwork } from "@shared/schema";

interface ArtworkModalProps {
  artwork: Artwork | null;
  open: boolean;
  onClose: () => void;
}

export default function ArtworkModal({ artwork, open, onClose }: ArtworkModalProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  // Reset to first image when modal opens
  useEffect(() => {
    if (open && artwork) {
      setCurrentImageIndex(0);
    }
  }, [open, artwork]);

  const handleBuyNow = () => {
    if (artwork?.buyLink) {
      window.open(artwork.buyLink, '_blank');
    } else if (artwork?.saatchiUrl) {
      window.open(artwork.saatchiUrl, '_blank');
    }
  };

  const nextImage = () => {
    if (!artwork) return;
    setCurrentImageIndex((prev) => 
      prev === artwork.images.length - 1 ? 0 : prev + 1
    );
  };

  const prevImage = () => {
    if (!artwork) return;
    setCurrentImageIndex((prev) => 
      prev === 0 ? artwork.images.length - 1 : prev - 1
    );
  };

  const selectImage = (index: number) => {
    setCurrentImageIndex(index);
  };

  if (!artwork) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full max-h-[90vh] overflow-y-auto p-0">
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="absolute top-4 right-4 z-10 bg-white/80 hover:bg-white"
          >
            <X className="h-4 w-4" />
          </Button>
          
          <div className="p-6">
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                {/* Main Image Display with Navigation */}
                <div className="relative">
                  <img 
                    src={artwork.images[currentImageIndex]} 
                    alt={`${artwork.title} - Image ${currentImageIndex + 1}`}
                    className="w-full rounded-lg shadow-lg object-cover aspect-[3/4]"
                  />
                  
                  {artwork.images.length > 1 && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={prevImage}
                        className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-white/80 hover:bg-white shadow-md"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={nextImage}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-white/80 hover:bg-white shadow-md"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      
                      {/* Image Counter */}
                      <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-xs">
                        {currentImageIndex + 1} / {artwork.images.length}
                      </div>
                    </>
                  )}
                </div>
                
                {/* Thumbnail Navigation */}
                {artwork.images.length > 1 && (
                  <div className="grid grid-cols-4 gap-2">
                    {artwork.images.map((image, index) => (
                      <button
                        key={index}
                        onClick={() => selectImage(index)}
                        className={`relative rounded overflow-hidden transition-all ${
                          index === currentImageIndex 
                            ? 'ring-2 ring-deep-blue ring-offset-2' 
                            : 'hover:opacity-80'
                        }`}
                      >
                        <img 
                          src={image} 
                          alt={`${artwork.title} thumbnail ${index + 1}`}
                          className="w-full h-16 object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="space-y-6">
                <div>
                  <h2 className="font-playfair text-3xl font-semibold text-deep-blue mb-2">
                    {artwork.title}
                  </h2>
                  <p className="text-soft-gray text-lg">
                    {artwork.year}
                  </p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-charcoal mb-2">Description</h3>
                  <p className="text-soft-gray leading-relaxed">
                    {artwork.description}
                  </p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-charcoal mb-2">Details</h3>
                  <ul className="text-soft-gray space-y-1">
                    <li><strong>Medium:</strong> {artwork.medium}</li>
                    <li><strong>Dimensions:</strong> {artwork.dimensions}</li>
                    <li><strong>Year:</strong> {artwork.year}</li>
                  </ul>
                </div>
                
                <div className="flex justify-between items-center pt-4 border-t">
                  <div className="flex items-center gap-4">
                    <span className="text-3xl font-bold text-deep-blue">
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
                  
                  {artwork.availability === 'available' ? (
                    <Button 
                      onClick={handleBuyNow}
                      className="bg-deep-blue hover:bg-deep-blue/90 text-white px-6 py-3"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Buy Now
                    </Button>
                  ) : (
                    <Button 
                      disabled 
                      className="bg-gray-400 text-white cursor-not-allowed px-6 py-3"
                    >
                      Sold
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
