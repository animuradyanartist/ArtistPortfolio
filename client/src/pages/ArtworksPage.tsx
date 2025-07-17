import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import ArtworkCard from "@/components/ArtworkCard";
import ArtworkModal from "@/components/ArtworkModal";
import type { Artwork } from "@shared/schema";

export default function ArtworksPage() {
  const [selectedArtwork, setSelectedArtwork] = useState<Artwork | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  
  // Filters
  const [availabilityFilter, setAvailabilityFilter] = useState<string>("");

  const { data: artworks = [], isLoading } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks"]
  });

  const filteredArtworks = useMemo(() => {
    return artworks.filter(artwork => {
      if (availabilityFilter && availabilityFilter !== "all" && artwork.availability !== availabilityFilter) return false;
      return true;
    });
  }, [artworks, availabilityFilter]);

  const handleViewDetails = (artwork: Artwork) => {
    setSelectedArtwork(artwork);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedArtwork(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-3 rounded-full text-sm font-medium text-blue-700 mb-6 animate-pulse">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              Loading collection...
            </div>
            <div className="animate-pulse">
              <div className="h-16 bg-gradient-to-r from-slate-200 to-slate-300 rounded-2xl w-80 mx-auto mb-6"></div>
              <div className="h-6 bg-slate-200 rounded-xl w-96 mx-auto"></div>
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="bg-white rounded-3xl shadow-2xl border border-slate-200/50 p-6 animate-pulse"
              >
                <div className="aspect-[3/4] bg-gradient-to-br from-slate-200 to-slate-300 rounded-2xl mb-4"></div>
                <div className="space-y-3">
                  <div className="h-6 bg-slate-200 rounded-xl w-3/4"></div>
                  <div className="h-4 bg-slate-200 rounded-lg w-1/2"></div>
                  <div className="h-4 bg-slate-200 rounded-lg w-2/3"></div>
                </div>
              </div>
            ))}
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
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-3 rounded-full text-sm font-medium text-blue-700 mb-6 animate-fadeIn">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            Original Artworks Collection
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-transparent mb-6 animate-slideUp">
            Artworks
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed animate-slideUp animation-delay-200">
            Explore my complete collection of abstract realism paintings, each piece telling its own unique story through color, texture, and emotion.
          </p>
        </div>

        {/* Modern Filters */}
        <div className="mb-16 animate-slideUp animation-delay-400">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/50 p-8 hover:shadow-3xl transition-shadow duration-500">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.707A1 1 0 013 7V4z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-slate-900">Filter Collection</h3>
            </div>
            <div className="max-w-md">
              <label className="block text-sm font-medium text-slate-700 mb-3">Filter by Availability</label>
              <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
                <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors">
                  <SelectValue placeholder="All artworks" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-slate-200">
                  <SelectItem value="all" className="rounded-lg">All artworks</SelectItem>
                  <SelectItem value="available" className="rounded-lg">Available for purchase</SelectItem>
                  <SelectItem value="sold" className="rounded-lg">Sold pieces</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Gallery Grid */}
        {filteredArtworks.length === 0 ? (
          <div className="text-center py-20">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 bg-gradient-to-r from-slate-200 to-slate-300 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">No artworks found</h3>
              <p className="text-slate-600">No artworks match your current filters. Try adjusting your selection.</p>
            </div>
          </div>
        ) : (
          <div className="animate-slideUp animation-delay-600">
            <div className="mb-8">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900">
                  {filteredArtworks.length} {filteredArtworks.length === 1 ? 'Artwork' : 'Artworks'}
                </h2>
                <div className="text-sm text-slate-500">
                  {availabilityFilter === 'available' && 'Available for purchase'}
                  {availabilityFilter === 'sold' && 'Sold pieces'}
                  {(availabilityFilter === 'all' || !availabilityFilter) && 'Complete collection'}
                </div>
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {filteredArtworks.map((artwork, index) => (
                <div
                  key={artwork.id}
                  className="group animate-fadeIn hover-lift"
                  style={{ 
                    animationDelay: `${index * 100}ms`,
                    animationFillMode: 'both'
                  }}
                >
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl blur opacity-0 group-hover:opacity-20 transition-opacity duration-500"></div>
                    <ArtworkCard
                      artwork={artwork}
                      onViewDetails={handleViewDetails}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Artwork Modal */}
        <ArtworkModal
          artwork={selectedArtwork}
          open={modalOpen}
          onClose={handleCloseModal}
        />
      </div>
    </div>
  );
}