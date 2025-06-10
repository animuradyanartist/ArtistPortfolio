import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import type { Artwork } from "@shared/schema";

interface ArtworkCardProps {
  artwork: Artwork;
  onViewDetails: (artwork: Artwork) => void;
}

export default function ArtworkCard({ artwork, onViewDetails }: ArtworkCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleBuyNow = () => {
    if (artwork.saatchiUrl) {
      window.open(artwork.saatchiUrl, '_blank');
    }
  };

  return (
    <Card className="gallery-item bg-white overflow-hidden">
      <div 
        className="relative aspect-square cursor-pointer"
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
        
        {artwork.availability === 'available' ? (
          <Button 
            onClick={handleBuyNow}
            className="w-full bg-deep-blue hover:bg-deep-blue/90 text-white"
            size="sm"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Buy Now
          </Button>
        ) : (
          <Button 
            disabled 
            className="w-full bg-gray-400 text-white cursor-not-allowed"
            size="sm"
          >
            Sold
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
