import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { Artwork } from "@shared/schema";

export default function PrintsPage() {
  const [, setLocation] = useLocation();
  
  // Price calculator state
  const [width, setWidth] = useState<number>(0);
  const [height, setHeight] = useState<number>(0);
  const [material, setMaterial] = useState<string>("paper");

  // Fetch all artworks
  const { data: artworks = [], isLoading } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks"]
  });

  // Filter artworks available for prints (using available artworks as print candidates)
  const printAvailableArtworks = useMemo(() => {
    return artworks.filter(artwork => artwork.availability === 'available');
  }, [artworks]);

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

        <div className="grid lg:grid-cols-10 gap-8">
          {/* Left Column - Artwork Grid (70%) */}
          <div className="lg:col-span-7">
            <h2 className="font-playfair text-2xl font-semibold text-deep-blue mb-6">
              Available Artworks
            </h2>
            
            {printAvailableArtworks.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-soft-gray text-lg">No artworks available for prints at the moment.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                {printAvailableArtworks.map((artwork, index) => (
                  <div
                    key={artwork.id}
                    className="animate-in fade-in-0 slide-in-from-bottom-8 duration-700 ease-out"
                    style={{ 
                      animationDelay: `${index * 100}ms`,
                      animationFillMode: 'both'
                    }}
                  >
                    <Card 
                      className="overflow-hidden hover:shadow-xl transition-all duration-500 group transform hover:scale-105"
                    >
                      <div className="relative aspect-[3/4] overflow-hidden">
                        <div className="absolute inset-0 transform transition-transform duration-700 ease-out group-hover:scale-110">
                          <img 
                            src={artwork.images[0]} 
                            alt={artwork.title}
                            className="w-full h-full object-cover transition-all duration-500 group-hover:brightness-110"
                          />
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500">
                          <div className="absolute bottom-4 left-4 right-4 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500 delay-100">
                            <div className="bg-white/95 backdrop-blur-sm px-3 py-2 rounded text-sm font-medium text-charcoal shadow-lg">
                              Available for Print
                            </div>
                          </div>
                        </div>
                      </div>
                      <CardContent className="p-4 group-hover:bg-gray-50/50 transition-colors duration-300">
                        <div className="transform transition-transform duration-300 group-hover:translate-y-[-2px]">
                          <h3 className="font-medium text-charcoal text-sm mb-1 transition-colors duration-300 group-hover:text-deep-blue">
                            {artwork.title}
                          </h3>
                          <p className="text-soft-gray text-xs transition-colors duration-300 group-hover:text-charcoal/80">
                            {artwork.dimensions}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column - Price Calculator (30%) */}
          <div className="lg:col-span-3">
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle className="font-playfair text-xl text-deep-blue">
                  Price Calculator
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Width Input */}
                <div className="space-y-2">
                  <Label htmlFor="width" className="text-sm font-medium text-charcoal">
                    Width (cm)
                  </Label>
                  <Input
                    id="width"
                    type="number"
                    placeholder="30"
                    value={width || ''}
                    onChange={(e) => setWidth(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                {/* Height Input */}
                <div className="space-y-2">
                  <Label htmlFor="height" className="text-sm font-medium text-charcoal">
                    Height (cm)
                  </Label>
                  <Input
                    id="height"
                    type="number"
                    placeholder="40"
                    value={height || ''}
                    onChange={(e) => setHeight(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                {/* Material Selection */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-charcoal">
                    Material
                  </Label>
                  <Select value={material} onValueChange={setMaterial}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paper">Paper</SelectItem>
                      <SelectItem value="canvas">Canvas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Price Calculation Results */}
                <div className="pt-4 border-t border-gray-200">
                  {calculatedPrice ? (
                    <div className="space-y-3 text-center">
                      <div className="text-sm text-soft-gray">
                        Area: {calculatedPrice.area.toLocaleString()} cm²
                      </div>
                      <div className="text-lg font-semibold text-deep-blue">
                        Final Price: €{calculatedPrice.finalPrice.toFixed(2)}
                      </div>
                      <div className="text-xs text-soft-gray mt-2">
                        Contact me for ordering and shipping details
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-soft-gray text-sm">
                      Enter dimensions to calculate price
                    </div>
                  )}
                </div>

                {/* Contact Information */}
                {calculatedPrice && (
                  <div className="bg-soft-white/50 border border-muted-pink/30 rounded-lg p-4 mt-4">
                    <h4 className="font-semibold text-deep-blue mb-2 text-sm">
                      Ready to order?
                    </h4>
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
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}