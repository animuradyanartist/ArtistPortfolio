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
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-500">
        <div className="text-center">
          <div className="w-12 h-12 bg-slate-200 rounded-lg flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="text-sm font-medium text-slate-600">{title}</div>
        </div>
      </div>
    );
  }
  
  return (
    <img 
      src={imageSrc} 
      alt={title}
      className="w-full h-full object-cover transition-all duration-500 group-hover:scale-105"
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2 rounded-full text-sm font-medium text-blue-700 mb-6">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            Art Print Collection
          </div>
          <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-transparent mb-6">
            Premium Art Prints
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
            Museum-quality prints of original artwork. Each piece is carefully reproduced on premium paper or canvas to preserve the artistic integrity.
          </p>
        </div>

        {/* Gallery Section */}
        <div className="mb-20">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-semibold text-slate-800">
              Available Works
            </h2>
            <div className="flex items-center gap-2 text-slate-500">
              <span className="text-sm">{activePrints.length} prints available</span>
              <div className="w-1 h-1 bg-slate-400 rounded-full"></div>
              <span className="text-sm">Multiple sizes</span>
            </div>
          </div>
          
          {activePrints.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-slate-500">No prints available at the moment.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {activePrints.map((print, index) => (
                <div
                  key={print.id}
                  className="group cursor-pointer"
                  onClick={() => setLocation(`/prints/${print.id}`)}
                  style={{ 
                    animationDelay: `${index * 50}ms`,
                    animationFillMode: 'both'
                  }}
                >
                  <div className="relative overflow-hidden rounded-2xl bg-white shadow-sm border border-slate-200/50 group-hover:shadow-2xl group-hover:shadow-slate-500/10 transition-all duration-300">
                    <div className="relative aspect-[4/5] overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent"></div>
                      <LazyThumbnail printId={print.id} title={print.title} />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300">
                        <div className="absolute bottom-4 left-4 right-4">
                          <div className="bg-white/95 backdrop-blur-sm px-3 py-2 rounded-lg text-sm font-medium text-slate-800 shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                            View Details
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="p-4">
                      <h3 className="font-medium text-slate-900 mb-1 group-hover:text-blue-600 transition-colors duration-200">
                        {print.title}
                      </h3>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-500">Multiple sizes</span>
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                          <div className="w-1.5 h-1.5 bg-slate-400 rounded-full"></div>
                          {print.preferredMaterial}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Price Calculator Section */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200/50 overflow-hidden">
            <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-8 py-6 border-b border-slate-200/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">Price Calculator</h3>
                  <p className="text-sm text-slate-600">Get an instant quote for your custom print size</p>
                </div>
              </div>
            </div>
            
            <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-slate-700">Width (cm)</Label>
                  <Input
                    type="number"
                    value={width || ""}
                    onChange={(e) => setWidth(Number(e.target.value))}
                    placeholder="30"
                    className="h-12 text-base border-slate-200 focus:border-blue-500 focus:ring-blue-500/20"
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-slate-700">Height (cm)</Label>
                  <Input
                    type="number"
                    value={height || ""}
                    onChange={(e) => setHeight(Number(e.target.value))}
                    placeholder="40"
                    className="h-12 text-base border-slate-200 focus:border-blue-500 focus:ring-blue-500/20"
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-slate-700">Material</Label>
                  <Select value={material} onValueChange={setMaterial}>
                    <SelectTrigger className="h-12 text-base border-slate-200 focus:border-blue-500 focus:ring-blue-500/20">
                      <SelectValue placeholder="Select material" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paper">Premium Paper</SelectItem>
                      <SelectItem value="canvas">Canvas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {calculatedPrice ? (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-200/50">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span className="text-sm font-medium text-blue-700">Instant Quote</span>
                    </div>
                    <div className="text-sm text-blue-600">
                      {calculatedPrice.area.toFixed(0)} cm²
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-blue-900 mb-4">
                    ${calculatedPrice.finalPrice.toFixed(2)}
                  </div>
                  <div className="bg-white/70 rounded-xl p-4 space-y-3">
                    <div className="text-sm font-medium text-slate-700 mb-2">Contact for Order</div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <a 
                        href="mailto:animuradyan.artist@gmail.com" 
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Email Artist
                      </a>
                      <a 
                        href="https://www.instagram.com/animuradyan.art/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors font-medium text-sm"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                        </svg>
                        Instagram
                      </a>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-slate-500">Enter dimensions above to calculate pricing</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}