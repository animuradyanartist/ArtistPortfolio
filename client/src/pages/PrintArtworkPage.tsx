import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import PreviewOnWall from "@/components/PreviewOnWall";
import ARPreview from "@/components/ARPreview";
import type { Print } from "@shared/schema";

export default function PrintArtworkPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const printId = parseInt(params.id as string);
  
  // Material selection state - Canvas selected by default
  const [selectedMaterial, setSelectedMaterial] = useState<"paper" | "canvas">("canvas");
  
  // Custom size form state
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customWidth, setCustomWidth] = useState<number>(0);
  const [customHeight, setCustomHeight] = useState<number>(0);
  const [customMaterial, setCustomMaterial] = useState<string>("paper");
  const [customPrice, setCustomPrice] = useState<number | null>(null);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);
  
  // Image carousel state
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  // AR Preview state
  const [selectedSize, setSelectedSize] = useState<{width: number, height: number, material: string} | null>(null);

  // Fetch print data
  const { data: print, isLoading, error } = useQuery<Print>({
    queryKey: [`/api/prints/${printId}`],
    enabled: !!printId && !isNaN(printId)
  });



  // Parse print sizes from JSON
  const printSizes = useMemo(() => {
    if (!print?.availableSizes) return [];
    try {
      return JSON.parse(print.availableSizes);
    } catch {
      return [];
    }
  }, [print?.availableSizes]);

  // Get all unique sizes (regardless of material) - sizes don't change, only prices do
  const allSizes = useMemo(() => {
    const sizeMap = new Map();
    printSizes.forEach((size: any) => {
      const key = `${size.width}x${size.height}`;
      if (!sizeMap.has(key)) {
        sizeMap.set(key, { width: size.width, height: size.height });
      }
    });
    return Array.from(sizeMap.values());
  }, [printSizes]);

  // Always provide both materials - paper and canvas
  const availableMaterials = ["canvas", "paper"];

  // Canvas is always selected by default (no need for useEffect since materials are hardcoded)

  // Easy-to-edit price calculation function
  const calculatePrice = (width: number, height: number, material: string) => {
    const area = width * height;
    
    // Price rates - edit these values to change pricing
    const rates = { 
      paper: 0.013,   // €0.013 per cm²
      canvas: 0.015   // €0.015 per cm²
    };
    
    return area * (rates[material as keyof typeof rates] || rates.canvas);
  };

  // Handle custom size calculation
  const handleCustomCalculation = () => {
    if (customWidth < 20 || customWidth > 120 || customHeight < 20 || customHeight > 120) {
      setCustomPrice(null);
      return;
    }
    
    const price = calculatePrice(customWidth, customHeight, customMaterial);
    setCustomPrice(price);
  };

  // Debounced calculation handler
  const handleDebouncedCalculation = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    const timer = setTimeout(() => {
      handleCustomCalculation();
    }, 500);
    
    setDebounceTimer(timer);
  };

  // Auto-recalculate price when material changes
  useEffect(() => {
    if (customWidth > 0 && customHeight > 0 && showCustomForm) {
      handleCustomCalculation();
    }
  }, [customMaterial]);

  // Sync custom material with selected material
  useEffect(() => {
    setCustomMaterial(selectedMaterial);
  }, [selectedMaterial]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [debounceTimer]);

  // Image navigation
  const nextImage = () => {
    if (!print) return;
    setCurrentImageIndex((prev) => 
      prev === print.images.length - 1 ? 0 : prev + 1
    );
  };

  const prevImage = () => {
    if (!print) return;
    setCurrentImageIndex((prev) => 
      prev === 0 ? print.images.length - 1 : prev - 1
    );
  };

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

  if (error || !print) {
    return (
      <div className="min-h-screen py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-charcoal mb-4">Print Edition Not Found</h1>
            <Button onClick={() => setLocation("/prints")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Prints
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Check if print is active
  if (print.status !== 'active') {
    return (
      <div className="min-h-screen py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-charcoal mb-4">Print Edition Not Available</h1>
            <p className="text-soft-gray mb-6">This print edition is not currently available.</p>
            <Button onClick={() => setLocation("/prints")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Prints
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-20 bg-soft-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => setLocation("/prints")}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Prints
        </Button>

        <div className="grid lg:grid-cols-12 gap-8">
          {/* Left Column - Images (50%) */}
          <div className="lg:col-span-6">
            <div className="space-y-6">
              {/* Main Image */}
              <div className="relative">
                <img 
                  src={print.images[currentImageIndex]} 
                  alt={`${print.title} - Image ${currentImageIndex + 1}`}
                  className="w-full rounded-lg shadow-lg object-cover aspect-[3/4] max-h-[600px]"
                />
                
                {print.images.length > 1 && (
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
                    
                    <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-xs">
                      {currentImageIndex + 1} / {print.images.length}
                    </div>
                  </>
                )}
              </div>

              {/* Thumbnails */}
              {print.images.length > 1 && (
                <div className="grid grid-cols-6 gap-2">
                  {print.images.map((image, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentImageIndex(index)}
                      className={`relative rounded overflow-hidden transition-all ${
                        index === currentImageIndex 
                          ? 'ring-2 ring-deep-blue ring-offset-2' 
                          : 'hover:opacity-80'
                      }`}
                    >
                      <img 
                        src={image} 
                        alt={`${print.title} thumbnail ${index + 1}`}
                        className="w-full h-12 object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* Print Info */}
              <div className="space-y-4">
                <div>
                  <h1 className="font-playfair text-3xl font-semibold text-deep-blue mb-2">
                    {print.title}
                  </h1>
                  <p className="text-soft-gray text-lg">
                    Print Edition • Preferred Material: {print.preferredMaterial}
                  </p>
                </div>
                
                {print.description && (
                  <div>
                    <h3 className="font-semibold text-charcoal mb-2">About this print edition</h3>
                    <p className="text-soft-gray leading-relaxed">
                      {print.description}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Print Options (50%) */}
          <div className="lg:col-span-6">
            <div className="space-y-6">
              {/* Material Selection */}
              {availableMaterials.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="font-playfair text-xl text-deep-blue">
                      Choose Material
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                      {availableMaterials.map((material) => (
                        <button
                          key={material}
                          onClick={() => setSelectedMaterial(material as "paper" | "canvas")}
                          className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                            selectedMaterial === material
                              ? 'border-deep-blue bg-blue-50 text-deep-blue'
                              : 'border-gray-200 hover:border-gray-300 text-charcoal'
                          }`}
                        >
                          <div className="text-center">
                            <div className="font-semibold capitalize mb-1">{material}</div>
                            <div className="text-sm text-soft-gray">
                              {material === 'paper' ? '€0.013/cm²' : '€0.015/cm²'}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Available Sizes - same sizes for all materials, only prices change */}
              {allSizes.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="font-playfair text-xl text-deep-blue">
                      Available Print Sizes - {selectedMaterial.charAt(0).toUpperCase() + selectedMaterial.slice(1)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {allSizes.map((size: any, index: number) => (
                      <div key={index} className="flex justify-between items-center p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                           onClick={() => setSelectedSize({width: size.width, height: size.height, material: selectedMaterial})}>
                        <div>
                          <div className="font-medium text-charcoal">
                            {size.width} × {size.height} cm
                          </div>
                          <div className="text-sm text-soft-gray capitalize">
                            {selectedMaterial}
                          </div>
                        </div>
                        <div className="text-lg font-semibold text-deep-blue">
                          €{calculatePrice(size.width, size.height, selectedMaterial).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Custom Size Calculator */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-playfair text-xl text-deep-blue">
                    Custom Size
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!showCustomForm ? (
                    <Button 
                      onClick={() => setShowCustomForm(true)}
                      className="w-full bg-deep-blue hover:bg-deep-blue/90"
                    >
                      Calculate Custom Size
                    </Button>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="custom-width" className="text-sm font-medium">
                            Width (cm)
                          </Label>
                          <Input
                            id="custom-width"
                            type="number"
                            min="20"
                            max="120"
                            placeholder="20-120"
                            value={customWidth || ''}
                            onChange={(e) => {
                              setCustomWidth(Number(e.target.value));
                              handleDebouncedCalculation();
                            }}
                            onBlur={handleCustomCalculation}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="custom-height" className="text-sm font-medium">
                            Height (cm)
                          </Label>
                          <Input
                            id="custom-height"
                            type="number"
                            min="20"
                            max="120"
                            placeholder="20-120"
                            value={customHeight || ''}
                            onChange={(e) => {
                              setCustomHeight(Number(e.target.value));
                              handleDebouncedCalculation();
                            }}
                            onBlur={handleCustomCalculation}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Material</Label>
                        <div className="p-3 bg-gray-50 rounded-lg border">
                          <div className="font-medium text-charcoal capitalize">
                            {selectedMaterial}
                          </div>
                          <div className="text-sm text-soft-gray">
                            {selectedMaterial === 'paper' ? '€0.013/cm²' : '€0.015/cm²'}
                          </div>
                        </div>
                      </div>

                      <Button 
                        onClick={handleCustomCalculation}
                        className="w-full bg-deep-blue hover:bg-deep-blue/90"
                      >
                        Calculate Price
                      </Button>

                      {/* Validation warnings */}
                      {(customWidth > 0 && (customWidth < 20 || customWidth > 120)) && (
                        <div className="text-red-600 text-sm">
                          Width must be between 20-120 cm
                        </div>
                      )}
                      {(customHeight > 0 && (customHeight < 20 || customHeight > 120)) && (
                        <div className="text-red-600 text-sm">
                          Height must be between 20-120 cm
                        </div>
                      )}

                      {/* Price Result */}
                      {customPrice !== null && (
                        <div className="text-center p-4 bg-green-50 border border-green-200 rounded-lg">
                          <div className="text-sm text-soft-gray mb-1">
                            Area: {(customWidth * customHeight).toLocaleString()} cm²
                          </div>
                          <div className="text-xl font-bold text-deep-blue">
                            Custom Price: €{customPrice.toFixed(2)}
                          </div>
                          <Button
                            onClick={() => {
                              setSelectedSize({width: customWidth, height: customHeight, material: customMaterial});
                            }}
                            className="w-full mt-3 bg-deep-blue hover:bg-deep-blue/90"
                          >
                            Select This Size for AR Preview
                          </Button>
                        </div>
                      )}

                      <Button 
                        variant="outline"
                        onClick={() => {
                          setShowCustomForm(false);
                          setCustomPrice(null);
                          setCustomWidth(0);
                          setCustomHeight(0);
                          setCustomMaterial("paper");
                          if (debounceTimer) {
                            clearTimeout(debounceTimer);
                          }
                        }}
                        className="w-full"
                      >
                        Close Calculator
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* AR Preview */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-playfair text-lg text-deep-blue">
                    AR Preview
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-soft-gray text-sm">
                    See this artwork on your own wall using your device's camera.
                  </p>
                  
                  {selectedSize && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="text-sm font-medium text-blue-900">
                        Selected Size: {selectedSize.width} × {selectedSize.height} cm ({selectedSize.material})
                      </div>
                      <div className="text-xs text-blue-700 mt-1">
                        AR preview will show this size
                      </div>
                    </div>
                  )}
                  
                  <ARPreview 
                    artwork={{
                      id: print.id,
                      title: print.title,
                      images: print.images
                    }}
                    selectedSize={selectedSize}
                    availableSizes={print.availableSizes}
                  />
                  
                  {!selectedSize && (
                    <p className="text-xs text-soft-gray">
                      Select a size above to see accurate sizing in AR preview
                    </p>
                  )}
                </CardContent>
              </Card>



              {/* Contact Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-playfair text-lg text-deep-blue">
                    Ready to Order?
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-soft-gray text-sm mb-3">
                    Contact me with your preferred size and material:
                  </p>
                  <div className="space-y-2 text-sm">
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
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}