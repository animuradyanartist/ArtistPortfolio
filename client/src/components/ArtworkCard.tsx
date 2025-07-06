import { useState, useRef } from "react";
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
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // Calculate rotation values (gentle parallax)
    const rotateX = (y - centerY) / centerY * -5; // Max 5 degrees
    const rotateY = (x - centerX) / centerX * 5;   // Max 5 degrees
    
    cardRef.current.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(10px)`;
  };

  const handleMouseLeave = () => {
    if (!cardRef.current) return;
    cardRef.current.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
  };

  return (
    <Card 
      ref={cardRef}
      className="gallery-item bg-white overflow-hidden transition-all duration-500 ease-out hover:shadow-2xl hover:shadow-black/20 transform-gpu gentle-float pulse-glow"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ 
        transformStyle: 'preserve-3d',
        transition: 'transform 0.3s ease-out, box-shadow 0.3s ease-out'
      }}
    >
      <div 
        className="relative aspect-[3/4] cursor-pointer overflow-hidden group"
        onClick={() => onViewDetails(artwork)}
      >
        <div className="absolute inset-0 transform transition-transform duration-700 ease-out group-hover:scale-110 shimmer-effect">
          <img 
            src={artwork.images[0]} 
            alt={artwork.title}
            className={`w-full h-full object-cover transition-all duration-500 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            } group-hover:brightness-110 group-hover:contrast-105`}
            onLoad={() => setImageLoaded(true)}
          />
        </div>
        
        {!imageLoaded && (
          <div className="absolute inset-0 bg-gray-200 animate-pulse" />
        )}
        
        {/* Multiple Images Indicator */}
        {artwork.images.length > 1 && (
          <div className="absolute top-3 right-3 bg-black/70 text-white px-2 py-1 rounded text-xs flex items-center gap-1 transform transition-all duration-300 group-hover:bg-black/80 group-hover:scale-105">
            <Images className="w-3 h-3" />
            {artwork.images.length}
          </div>
        )}
        
        {/* Animated Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500">
          <div className="absolute bottom-4 left-4 right-4 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500 delay-100">
            <div className="bg-white/95 backdrop-blur-sm px-4 py-2 rounded-lg text-sm font-medium text-charcoal shadow-lg">
              View Details
            </div>
          </div>
        </div>
        
        {/* Subtle shimmer effect */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-out" />
        </div>
      </div>
      
      <CardContent className="p-4 group-hover:bg-gray-50/50 transition-colors duration-300">
        <div className="transform transition-transform duration-300 group-hover:translate-y-[-2px]">
          <h3 className="font-playfair text-lg font-semibold mb-1 text-charcoal transition-colors duration-300 group-hover:text-deep-blue">
            {artwork.title}
          </h3>
          <p className="text-soft-gray text-sm mb-2 transition-all duration-300 group-hover:text-charcoal/80">
            {artwork.medium}, {artwork.dimensions}
          </p>
          <div className="flex justify-between items-center mb-3">
            <span className="text-deep-blue font-semibold text-lg transition-all duration-300 group-hover:scale-105 group-hover:text-indigo-600">
              ${artwork.price.toLocaleString()}
            </span>
            <Badge 
              variant={artwork.availability === 'available' ? 'default' : 'destructive'}
              className={`transition-all duration-300 group-hover:scale-105 ${artwork.availability === 'available' 
                ? 'bg-green-100 text-green-800 hover:bg-green-100 group-hover:bg-green-200' 
                : 'bg-red-100 text-red-800 hover:bg-red-100 group-hover:bg-red-200'
              }`}
            >
              {artwork.availability === 'available' ? 'Available' : 'Sold'}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
