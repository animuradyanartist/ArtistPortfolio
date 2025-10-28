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
import { updateCanonicalUrl } from "@/lib/seo";

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

  // Set canonical URL for SEO
  useEffect(() => {
    if (print) {
      updateCanonicalUrl(`/prints/${printId}`);
    }
  }, [print, printId]);

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => setLocation("/prints")}
          className="mb-8 hover:bg-slate-100 rounded-xl transition-all duration-300 animate-fadeIn"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Prints
        </Button>

        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-3 rounded-full text-sm font-medium text-blue-700 mb-6 animate-fadeIn">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            Premium Art Print
          </div>
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-transparent mb-4 animate-slideUp">
            {print.title}
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed animate-slideUp animation-delay-200">
            Museum-quality reproduction available in multiple sizes and materials
          </p>
        </div>

        <div className="grid lg:grid-cols-12 gap-8">
          {/* Left Column - Images (50%) */}
          <div className="lg:col-span-6 animate-slideLeft">
            <div className="space-y-6">
              {/* Main Image */}
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-3xl blur opacity-20 group-hover:opacity-30 transition-opacity duration-500"></div>
                <img 
                  src={print.images[currentImageIndex]} 
                  alt={`${print.title} by Ani Muradyan – Armenian abstract realism art print`}
                  className="relative w-full rounded-3xl shadow-2xl object-cover aspect-[3/4] max-h-[600px] border border-slate-200/50 transform group-hover:scale-105 transition-transform duration-700"
                />
                
                {print.images.length > 1 && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={prevImage}
                      className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-white/90 backdrop-blur-sm hover:bg-white shadow-xl rounded-full w-12 h-12 transition-all duration-300 hover:scale-110"
                    >
                      <ChevronLeft className="h-5 w-5 text-slate-700" />
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={nextImage}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-white/90 backdrop-blur-sm hover:bg-white shadow-xl rounded-full w-12 h-12 transition-all duration-300 hover:scale-110"
                    >
                      <ChevronRight className="h-5 w-5 text-slate-700" />
                    </Button>
                    
                    <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm font-medium">
                      {currentImageIndex + 1} / {print.images.length}
                    </div>
                  </>
                )}
              </div>

              {/* Thumbnails */}
              {print.images.length > 1 && (
                <div className="grid grid-cols-6 gap-3">
                  {print.images.map((image, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentImageIndex(index)}
                      className={`relative rounded-2xl overflow-hidden transition-all duration-300 ${
                        index === currentImageIndex 
                          ? 'ring-2 ring-blue-500 ring-offset-2 scale-105' 
                          : 'hover:opacity-80 hover:scale-105'
                      }`}
                    >
                      <img 
                        src={image} 
                        alt={`${print.title} by Ani Muradyan – Armenian abstract realism art print (view ${index + 1})`}
                        className="w-full h-16 object-cover"
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
          <div className="lg:col-span-6 animate-slideRight">
            <div className="space-y-8">
              {/* Material Selection */}
              {availableMaterials.length > 0 && (
                <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/50 p-8 hover:shadow-3xl transition-shadow duration-500">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V9a4 4 0 00-4-4z" />
                      </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900">Choose Material</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {availableMaterials.map((material) => (
                      <button
                        key={material}
                        onClick={() => setSelectedMaterial(material as "paper" | "canvas")}
                        className={`p-6 rounded-2xl border-2 transition-all duration-300 transform hover:scale-105 ${
                          selectedMaterial === material
                            ? 'border-blue-500 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-lg'
                            : 'border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="text-center">
                          <div className="font-semibold text-lg capitalize">{material}</div>
                          <div className="text-sm opacity-80 mt-1">
                            {material === 'canvas' ? 'Premium texture' : 'Smooth finish'}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Available Sizes - same sizes for all materials, only prices change */}
              {allSizes.length > 0 && (
                <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/50 p-8 hover:shadow-3xl transition-shadow duration-500">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4a1 1 0 011-1h4m10 0h4a1 1 0 011 1v4m0 10v4a1 1 0 01-1 1h-4m-10 0H4a1 1 0 01-1-1v-4" />
                      </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900">
                      Available Sizes - {selectedMaterial.charAt(0).toUpperCase() + selectedMaterial.slice(1)}
                    </h3>
                  </div>
                  <div className="space-y-3">
                    {allSizes.map((size: any, index: number) => (
                      <div key={index} 
                           className="group flex justify-between items-center p-6 border border-slate-200 rounded-2xl hover:bg-gradient-to-r hover:from-slate-50 hover:to-slate-100 cursor-pointer transition-all duration-300 transform hover:scale-105 hover:shadow-lg"
                           onClick={() => setSelectedSize({width: size.width, height: size.height, material: selectedMaterial})}>
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                          </div>
                          <div>
                            <div className="font-semibold text-lg text-slate-900">
                              {size.width} × {size.height} cm
                            </div>
                            <div className="text-sm text-slate-500 capitalize">
                              {selectedMaterial} • Premium quality
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-blue-600">
                            €{calculatePrice(size.width, size.height, selectedMaterial).toFixed(2)}
                          </div>
                          <div className="text-sm text-slate-500">
                            {(size.width * size.height / 100).toFixed(1)} cm² area
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
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