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
    <div className="group relative">
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-3xl blur opacity-0 group-hover:opacity-20 transition-opacity duration-500"></div>
      <Card 
        ref={cardRef}
        className="relative bg-white rounded-3xl shadow-2xl border border-slate-200/50 overflow-hidden transition-all duration-500 hover:shadow-3xl transform-gpu hover:scale-105"
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
          <div className="absolute inset-0 transform transition-transform duration-700 ease-out group-hover:scale-110">
            <img 
              src={artwork.images[0]} 
              alt={`Abstract portrait oil painting by Armenian contemporary artist Ani Muradyan – ${artwork.title}`}
              title={`Abstract realism portrait painting – ${artwork.title} – Ani Muradyan`}
              className={`w-full h-full object-cover transition-all duration-500 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              } group-hover:brightness-110 group-hover:contrast-105`}
              onLoad={() => setImageLoaded(true)}
              loading="lazy"
            />
          </div>
          
          {!imageLoaded && (
            <div className="absolute inset-0 bg-gradient-to-br from-slate-200 to-slate-300 animate-pulse" />
          )}
          
          {/* Multiple Images Indicator */}
          {artwork.images.length > 1 && (
            <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-sm text-white px-3 py-2 rounded-full text-xs flex items-center gap-2 transform transition-all duration-300 group-hover:bg-black/80 group-hover:scale-105">
              <Images className="w-4 h-4" />
              <span className="font-medium">{artwork.images.length}</span>
            </div>
          )}
          
          {/* Modern Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500">
            <div className="absolute bottom-6 left-6 right-6 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500 delay-100">
              <div className="bg-white/95 backdrop-blur-md px-6 py-3 rounded-2xl text-sm font-medium text-slate-900 shadow-xl border border-white/20">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  View Details
                </div>
              </div>
            </div>
          </div>
          
          {/* Subtle shimmer effect */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-out" />
          </div>
        </div>
        
        <CardContent className="p-6 group-hover:bg-slate-50/50 transition-colors duration-300">
          <div className="transform transition-transform duration-300 group-hover:translate-y-[-2px]">
            <h3 className="text-xl font-bold mb-2 text-slate-900 transition-colors duration-300 group-hover:text-blue-600">
              {artwork.title}
            </h3>
            <p className="text-slate-600 text-sm mb-4 transition-all duration-300 group-hover:text-slate-700">
              {artwork.medium} • {artwork.dimensions}
            </p>
            <div className="flex justify-between items-center">
              <span className="text-2xl font-bold text-slate-900 transition-all duration-300 group-hover:scale-105 group-hover:text-blue-600">
                ${artwork.price.toLocaleString()}
              </span>
              <Badge 
                variant={artwork.availability === 'available' ? 'default' : 'destructive'}
                className={`transition-all duration-300 group-hover:scale-105 rounded-full px-3 py-1 text-xs font-medium ${artwork.availability === 'available' 
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
    </div>
  );
}
