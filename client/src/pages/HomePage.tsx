import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { ExternalLink } from "lucide-react";
import type { Artwork, HomepageSettings } from "@shared/schema";
import backgroundImage from "@assets/1bg_1750936488071.png";

export default function HomePage() {
  const { data: homepageSettings } = useQuery<HomepageSettings>({
    queryKey: ["/api/homepage-settings"]
  });

  const { data: artworks = [] } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks"]
  });

  const { data: latestArtwork } = useQuery<Artwork>({
    queryKey: ["/api/artworks/1"]
  });

  const featuredArtworks = artworks.filter(artwork => artwork.featured).slice(0, 3);

  const handleBuyNow = (saatchiUrl?: string) => {
    if (saatchiUrl) {
      window.open(saatchiUrl, '_blank');
    }
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="relative h-screen">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url('${homepageSettings?.heroImage || backgroundImage}')`
          }}
        />
        <div className="absolute inset-0 bg-black bg-opacity-40" />
        <div className="relative h-full flex items-center justify-center text-center text-white">
          <div className="max-w-4xl px-4 fade-in">
            <h1 className="font-playfair text-5xl md:text-7xl font-bold mb-6">
              Ani Muradyan
            </h1>
            <p className="text-xl md:text-2xl mb-8 font-light">
              Abstract Realism Artist from Armenia
            </p>
            <blockquote className="font-playfair text-2xl md:text-3xl italic mb-8">
              "{homepageSettings?.heroQuote || 'Art must bring hope into people\'s lives.'}"
            </blockquote>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/artworks">
                <Button className="bg-muted-pink text-deep-blue hover:bg-muted-pink/90 px-8 py-3 text-lg">
                  View Artworks
                </Button>
              </Link>
              <Link href="/about">
                <Button 
                  className="bg-white text-black hover:bg-gray-100 px-8 py-3 text-lg"
                >
                  About the Artist
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* New Artwork Section */}
      {latestArtwork && (
        <div className="py-20 bg-warm-beige">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="font-playfair text-4xl md:text-5xl font-semibold text-deep-blue mb-4">
                Latest Creation
              </h2>
              <p className="text-soft-gray text-lg max-w-2xl mx-auto">
                Discover my most recent work, where emotion meets abstract expression in perfect harmony.
              </p>
            </div>
            <div className="max-w-4xl mx-auto">
              <Card className="bg-white shadow-lg overflow-hidden gallery-item">
                <img 
                  src={latestArtwork.images[0]} 
                  alt={latestArtwork.title}
                  className="w-full h-96 object-cover"
                />
                <CardContent className="p-8">
                  <h3 className="font-playfair text-2xl font-semibold mb-3">
                    {latestArtwork.title}
                  </h3>
                  <p className="text-soft-gray mb-4">
                    {latestArtwork.medium}, {latestArtwork.dimensions} - {latestArtwork.description}
                  </p>
                  <div className="flex justify-between items-center">
                    <span className="text-deep-blue font-semibold text-xl">
                      ${latestArtwork.price.toLocaleString()}
                    </span>
                    {latestArtwork.availability === 'available' ? (
                      <Button 
                        onClick={() => handleBuyNow(latestArtwork.saatchiUrl)}
                        className="bg-deep-blue hover:bg-deep-blue/90 text-white"
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        View Details
                      </Button>
                    ) : (
                      <Badge variant="destructive">Sold</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* Featured Works Section */}
      <div className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-playfair text-4xl md:text-5xl font-semibold text-deep-blue mb-4">
              Featured Works
            </h2>
            <p className="text-soft-gray text-lg max-w-2xl mx-auto">
              A curated selection of pieces that represent the essence of my artistic journey.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {featuredArtworks.map((artwork) => (
              <Card key={artwork.id} className="bg-white shadow-lg overflow-hidden gallery-item">
                <img 
                  src={artwork.images[0]} 
                  alt={artwork.title}
                  className="w-full h-64 object-cover"
                />
                <CardContent className="p-6">
                  <h3 className="font-playfair text-xl font-semibold mb-2">
                    {artwork.title}
                  </h3>
                  <p className="text-soft-gray text-sm mb-3">
                    {artwork.medium}, {artwork.dimensions}
                  </p>
                  <div className="flex justify-between items-center">
                    <span className="text-deep-blue font-semibold">
                      ${artwork.price.toLocaleString()}
                    </span>
                    <Badge 
                      variant={artwork.availability === 'available' ? 'default' : 'destructive'}
                      className={artwork.availability === 'available' 
                        ? 'bg-green-100 text-green-800 hover:bg-green-100' 
                        : 'bg-red-100 text-red-800 hover:bg-red-100'
                      }
                    >
                      {artwork.availability === 'available' ? 'Available' : 'Sold'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="text-center mt-12">
            <Link href="/artworks">
              <Button className="bg-deep-blue hover:bg-deep-blue/90 text-white px-8 py-3 text-lg">
                View All Artworks
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-black text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h3 className="font-playfair text-xl font-semibold mb-4">Ani Muradyan</h3>
              <p className="text-gray-300 text-sm">
                Abstract Realism Artist from Armenia, creating works that bring hope and emotion into people's lives.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Quick Links</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/" className="text-gray-300 hover:text-white transition-colors duration-300">Home</Link></li>
                <li><Link href="/artworks" className="text-gray-300 hover:text-white transition-colors duration-300">Artworks</Link></li>
                <li><Link href="/about" className="text-gray-300 hover:text-white transition-colors duration-300">About</Link></li>
                <li><Link href="/exhibitions" className="text-gray-300 hover:text-white transition-colors duration-300">Exhibitions</Link></li>
                <li><Link href="/contact" className="text-gray-300 hover:text-white transition-colors duration-300">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Connect</h4>
              <div className="flex space-x-4">
                <a 
                  href="https://instagram.com/animuradyan.artist" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-300 hover:text-white transition-colors duration-300"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </a>
                <a 
                  href="https://saatchiart.com/animuradyan" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-300 hover:text-white transition-colors duration-300"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                </a>
                <a 
                  href="mailto:animuradyan.artist@gmail.com"
                  className="text-gray-300 hover:text-white transition-colors duration-300"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-700 mt-8 pt-8 flex justify-between items-center">
            <p className="text-gray-300 text-sm">&copy; 2024 Ani Muradyan. All rights reserved.</p>
            <Link href="/admin" className="text-gray-500 hover:text-gray-300 text-xs">Admin</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
