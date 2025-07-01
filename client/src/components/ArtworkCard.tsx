import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Images } from "lucide-react";
import type { Artwork } from "@shared/schema";

interface ArtworkCardProps {
  artwork: Artwork;
  onViewDetails: (artwork: Artwork) => void;
}

export default function ArtworkCard({ artwork, onViewDetails }: ArtworkCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <Card className="gallery-item bg-white overflow-hidden">
      <div 
        className="relative aspect-[3/4] cursor-pointer"
        onClick={() => onViewDetails(artwork)}
      >
        <img 
          src={artwork.images[0]} 
          alt={artwork.title}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setImageLoaded(true)}
        />
        {!imageLoaded && (
          <div className="absolute inset-0 bg-gray-200 animate-pulse" />
        )}
        
        {/* Multiple Images Indicator */}
        {artwork.images.length > 1 && (
          <div className="absolute top-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
            <Images className="w-3 h-3" />
            {artwork.images.length}
          </div>
        )}
        
        {/* View More Overlay */}
        <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-all duration-300 flex items-center justify-center">
          <div className="opacity-0 hover:opacity-100 transition-opacity duration-300 bg-white/90 px-3 py-1 rounded text-sm font-medium text-charcoal">
            View Details
          </div>
        </div>
      </div>
      
      <CardContent className="p-4">
        <h3 className="font-playfair text-lg font-semibold mb-1 text-charcoal">
          {artwork.title}
        </h3>
        <p className="text-soft-gray text-sm mb-2">
          {artwork.medium}, {artwork.dimensions}
        </p>
        <div className="flex justify-between items-center mb-3">
          <span className="text-deep-blue font-semibold text-lg">
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

      </CardContent>
    </Card>
  );
}
