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
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [sizeFilter, setSizeFilter] = useState<string>("");
  const [priceFilter, setPriceFilter] = useState<string>("");
  const [availabilityFilter, setAvailabilityFilter] = useState<string>("");

  const { data: artworks = [], isLoading } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks"]
  });

  const filteredArtworks = useMemo(() => {
    return artworks.filter(artwork => {
      if (typeFilter && artwork.type !== typeFilter) return false;
      if (sizeFilter && artwork.size !== sizeFilter) return false;
      if (availabilityFilter && artwork.availability !== availabilityFilter) return false;
      
      if (priceFilter) {
        const price = artwork.price;
        switch (priceFilter) {
          case "1000-2000":
            if (price < 1000 || price > 2000) return false;
            break;
          case "2000-3000":
            if (price < 2000 || price > 3000) return false;
            break;
          case "3000+":
            if (price < 3000) return false;
            break;
        }
      }
      
      return true;
    });
  }, [artworks, typeFilter, sizeFilter, priceFilter, availabilityFilter]);

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
            <div className="grid md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-2">Type</label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Types</SelectItem>
                    <SelectItem value="oil">Oil Painting</SelectItem>
                    <SelectItem value="acrylic">Acrylic</SelectItem>
                    <SelectItem value="mixed">Mixed Media</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-charcoal mb-2">Size</label>
                <Select value={sizeFilter} onValueChange={setSizeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Sizes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Sizes</SelectItem>
                    <SelectItem value="small">Small (under 24")</SelectItem>
                    <SelectItem value="medium">Medium (24"-36")</SelectItem>
                    <SelectItem value="large">Large (over 36")</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-charcoal mb-2">Price Range</label>
                <Select value={priceFilter} onValueChange={setPriceFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Prices" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Prices</SelectItem>
                    <SelectItem value="1000-2000">$1,000 - $2,000</SelectItem>
                    <SelectItem value="2000-3000">$2,000 - $3,000</SelectItem>
                    <SelectItem value="3000+">$3,000+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-charcoal mb-2">Availability</label>
                <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All</SelectItem>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="sold">Sold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
