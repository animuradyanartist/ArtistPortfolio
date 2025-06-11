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
    <div className="min-h-screen py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="font-playfair text-4xl md:text-5xl font-semibold text-deep-blue mb-4">
            Artworks
          </h1>
          <p className="text-soft-gray text-lg max-w-2xl mx-auto">
            Explore my complete collection of abstract realism paintings, each piece telling its own story.
          </p>
        </div>

        {/* Filters */}
        <Card className="mb-12">
          <CardContent className="p-6">
            <div className="max-w-sm">
              <label className="block text-sm font-medium text-charcoal mb-2">Availability</label>
              <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Gallery Grid */}
        {filteredArtworks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-soft-gray text-lg">No artworks match your current filters.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-8">
            {filteredArtworks.map((artwork) => (
              <ArtworkCard
                key={artwork.id}
                artwork={artwork}
                onViewDetails={handleViewDetails}
              />
            ))}
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