import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { Print } from "@shared/schema";

// Lazy loading image component
function LazyThumbnail({ printId, title }: { printId: number; title: string }) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  
  useEffect(() => {
    const loadThumbnail = async () => {
      try {
        const response = await fetch(`/api/prints/${printId}/thumbnail`);
        if (response.ok) {
          const data = await response.json();
          if (data.thumbnail && data.thumbnail !== 'thumbnail') {
            setImageSrc(data.thumbnail);
          } else {
            setImageError(true);
          }
        } else {
          setImageError(true);
        }
      } catch (error) {
        setImageError(true);
      }
    };
    
    loadThumbnail();
  }, [printId]);
  
  if (imageError || !imageSrc) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-600">
        <div className="text-center">
          <div className="text-4xl mb-2">🖼️</div>
          <div className="text-sm font-medium">{title}</div>
        </div>
      </div>
    );
  }
  
  return (
    <img 
      src={imageSrc} 
      alt={title}
      className="w-full h-full object-cover transition-all duration-500 group-hover:brightness-110"
      onError={() => setImageError(true)}
    />
  );
}

export default function PrintsPage() {
  const [, setLocation] = useLocation();
  
  // Price calculator state
  const [width, setWidth] = useState<number>(0);
  const [height, setHeight] = useState<number>(0);
  const [material, setMaterial] = useState<string>("paper");

  // Fetch all prints
  const { data: prints = [], isLoading, error } = useQuery<Print[]>({
    queryKey: ["/api/prints"],
    retry: 5,
    retryDelay: 500,
    staleTime: 30000 // Cache for 30 seconds
  });

  // Debug logging
  useEffect(() => {
    console.log('Prints query state:', { 
      isLoading, 
      error: error?.message, 
      printsCount: prints.length,
      activePrints: prints.filter(p => p.status === 'active').length
    });
  }, [prints, isLoading, error]);

  // Filter active prints
  const activePrints = useMemo(() => {
    console.log('All prints:', prints);
    const filtered = prints.filter(print => print.status === 'active');
    console.log('Active prints:', filtered);
    return filtered;
  }, [prints]);

  // Price calculation
  const calculatedPrice = useMemo(() => {
    if (width <= 0 || height <= 0) return null;
    
    const area = width * height;
    const rates = {
      paper: 0.013,
      canvas: 0.015
    };
    
    const rate = rates[material as keyof typeof rates] || rates.paper;
    const finalPrice = area * rate;
    
    return {
      area,
      finalPrice
    };
  }, [width, height, material]);

  if (isLoading) {
    return (
      <div className="min-h-screen py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-64 mx-auto mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-96 mx-auto"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-20 bg-soft-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Page Header */}
        <div className="text-center mb-16">
          <h1 className="font-playfair text-4xl md:text-5xl font-semibold text-deep-blue mb-4">
            Buy Art Prints
          </h1>
          <p className="text-soft-gray text-lg max-w-2xl mx-auto">
            High-quality prints of my artwork available on paper or canvas. Use the calculator to get an instant price quote.
          </p>
        </div>

        {/* Full Width Layout */}
        <div className="mb-16">
          <h2 className="font-playfair text-2xl font-semibold text-deep-blue mb-6 text-center">
            Available Print Editions ({activePrints.length})
          </h2>
          
          {activePrints.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-soft-gray text-lg">No print editions available at the moment.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {activePrints.map((print, index) => (
                  <div
                    key={print.id}
                    className="animate-in fade-in-0 slide-in-from-bottom-8 duration-700 ease-out"
                    style={{ 
                      animationDelay: `${index * 100}ms`,
                      animationFillMode: 'both'
                    }}
                  >
                    <Card 
                      className="overflow-hidden hover:shadow-lg transition-all duration-300 group transform hover:scale-102 cursor-pointer"
                      onClick={() => setLocation(`/prints/${print.id}`)}
                    >
                      <div className="relative aspect-[3/4] overflow-hidden">
                        <div className="absolute inset-0 transform transition-transform duration-700 ease-out group-hover:scale-110">
                          <LazyThumbnail printId={print.id} title={print.title} />
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500">
                          <div className="absolute bottom-4 left-4 right-4 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500 delay-100">
                            <div className="bg-white/95 backdrop-blur-sm px-3 py-2 rounded text-sm font-medium text-charcoal shadow-lg">
                              Print Edition
                            </div>
                          </div>
                        </div>
                      </div>
                      <CardContent className="p-3 group-hover:bg-gray-50/50 transition-colors duration-300">
                        <div className="transform transition-transform duration-300 group-hover:translate-y-[-1px]">
                          <div className="mb-1">
                            <h3 className="font-medium text-charcoal text-xs transition-colors duration-300 group-hover:text-deep-blue line-clamp-1">
                              {print.title}
                            </h3>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-soft-gray text-xs transition-colors duration-300 group-hover:text-charcoal/80">
                              Multiple sizes
                            </p>
                            <div className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
                              {print.preferredMaterial}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            )}
        </div>

        {/* Price Calculator - Full Width Card */}
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="font-playfair text-xl text-deep-blue text-center">
                Price Calculator
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="width">Width (cm)</Label>
                  <Input
                    id="width"
                    type="number"
                    value={width || ""}
                    onChange={(e) => setWidth(Number(e.target.value))}
                    placeholder="Enter width"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="height">Height (cm)</Label>
                  <Input
                    id="height"
                    type="number"
                    value={height || ""}
                    onChange={(e) => setHeight(Number(e.target.value))}
                    placeholder="Enter height"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="material">Material</Label>
                  <Select value={material} onValueChange={setMaterial}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select material" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paper">Paper</SelectItem>
                      <SelectItem value="canvas">Canvas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {calculatedPrice && (
                <div className="pt-4 border-t mt-4">
                  <div className="text-center space-y-2">
                    <p className="text-sm text-soft-gray">
                      Area: {calculatedPrice.area.toFixed(1)} cm²
                    </p>
                    <p className="text-lg font-semibold text-deep-blue">
                      Price: ${calculatedPrice.finalPrice.toFixed(2)}
                    </p>
                    <div className="text-xs text-soft-gray mt-2">
                      Contact me for ordering and shipping details
                    </div>
                    <div className="space-y-1 text-xs">
                      <div>
                        <a 
                          href="mailto:animuradyan.artist@gmail.com" 
                          className="text-deep-blue hover:underline"
                        >
                          animuradyan.artist@gmail.com
                        </a>
                      </div>
                      <div>
                        <a 
                          href="https://www.instagram.com/animuradyan.art/" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-deep-blue hover:underline"
                        >
                          @animuradyan.art
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}