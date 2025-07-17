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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* Hero Section */}
      <div className="relative h-screen overflow-hidden">
        {/* Animated Background */}
        <div 
          className="absolute inset-0 bg-cover bg-center transform scale-105 animate-float"
          style={{
            backgroundImage: `url('${homepageSettings?.heroImage || backgroundImage}')`
          }}
        />
        
        {/* Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/70 via-slate-900/50 to-slate-900/70" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent" />
        
        {/* Animated Particles */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-2 h-2 bg-white/20 rounded-full animate-pulse"></div>
          <div className="absolute top-40 right-32 w-1 h-1 bg-blue-400/30 rounded-full animate-pulse animation-delay-200"></div>
          <div className="absolute bottom-32 left-40 w-1.5 h-1.5 bg-indigo-400/20 rounded-full animate-pulse animation-delay-400"></div>
          <div className="absolute bottom-20 right-20 w-2 h-2 bg-white/10 rounded-full animate-pulse animation-delay-600"></div>
        </div>
        
        <div className="relative h-screen flex items-center justify-center text-center text-white">
          <div className="w-full max-w-6xl px-4">
            <div className="flex flex-col items-center justify-center h-full">
              <div className="inline-flex items-center gap-3 bg-white/10 backdrop-blur-md px-8 py-4 rounded-full text-sm font-medium text-white mb-10 animate-fadeIn border border-white/20">
                <div className="w-3 h-3 bg-gradient-to-r from-blue-400 to-indigo-400 rounded-full animate-pulse"></div>
                <span className="text-base">Abstract Realism Artist from Armenia</span>
              </div>
              
              <h1 className="text-6xl md:text-8xl lg:text-9xl font-bold mb-8 bg-gradient-to-r from-white via-slate-100 to-white bg-clip-text text-transparent animate-slideUp text-center">
                Ani Muradyan
              </h1>
              
              <blockquote className="text-2xl md:text-4xl lg:text-5xl italic mb-16 text-slate-200 font-light leading-relaxed max-w-5xl text-center animate-slideUp animation-delay-200">
                "{homepageSettings?.heroQuote || 'Art must bring hope into people\'s lives.'}"
              </blockquote>
              
              <div className="flex flex-col sm:flex-row gap-6 items-center justify-center animate-slideUp animation-delay-400">
                <Link href="/prints">
                  <Button className="group h-16 px-10 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium rounded-2xl transition-all duration-500 transform hover:scale-105 shadow-2xl hover:shadow-blue-500/25">
                    <span className="text-lg group-hover:text-white transition-colors">View Prints</span>
                    <div className="ml-2 transform group-hover:translate-x-1 transition-transform">
                      <ExternalLink className="w-5 h-5" />
                    </div>
                  </Button>
                </Link>
                <Link href="/about">
                  <Button className="group h-16 px-10 bg-white/10 backdrop-blur-md text-white border border-white/30 hover:bg-white/20 hover:border-white/50 font-medium rounded-2xl transition-all duration-500 transform hover:scale-105 shadow-xl">
                    <span className="text-lg group-hover:text-white transition-colors">About the Artist</span>
                  </Button>
                </Link>
              </div>
            </div>
          </div>
          
          {/* Scroll Indicator */}
          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-fadeIn animation-delay-600">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center">
                <div className="w-1 h-3 bg-white/50 rounded-full animate-pulse mt-2"></div>
              </div>
              <span className="text-white/60 text-sm">Scroll to explore</span>
            </div>
          </div>
        </div>
      </div>

      {/* New Artwork Section */}
      {latestArtwork && (
        <div className="py-24 bg-gradient-to-br from-slate-50 to-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-20">
              <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-3 rounded-full text-sm font-medium text-blue-700 mb-6">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                Latest Creation
              </div>
              <h2 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-transparent mb-6">
                {latestArtwork.title}
              </h2>
              <p className="text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
                Discover my most recent work, where emotion meets abstract expression in perfect harmony.
              </p>
            </div>
            <div className="max-w-5xl mx-auto">
              <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/50 overflow-hidden">
                <div className="aspect-[4/3] bg-gradient-to-br from-slate-100 to-slate-200">
                  <img 
                    src={latestArtwork.images[0]} 
                    alt={latestArtwork.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-8">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-3xl font-bold text-slate-900 mb-2">
                        {latestArtwork.title}
                      </h3>
                      <p className="text-slate-600 text-lg">
                        {latestArtwork.medium}, {latestArtwork.dimensions}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-bold text-slate-900">
                        ${latestArtwork.price.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <p className="text-slate-600 mb-8 text-lg leading-relaxed">
                    {latestArtwork.description}
                  </p>
                  <div className="flex justify-center">
                    {latestArtwork.availability === 'available' ? (
                      <Button 
                        onClick={() => handleBuyNow(latestArtwork.saatchiUrl)}
                        className="h-12 px-8 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-lg"
                      >
                        <ExternalLink className="w-5 h-5 mr-2" />
                        View Details
                      </Button>
                    ) : (
                      <Badge variant="destructive" className="h-12 px-8 text-lg">Sold</Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Featured Works Section */}
      <div className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-3 rounded-full text-sm font-medium text-blue-700 mb-6">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              Featured Works
            </div>
            <h2 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-transparent mb-6">
              Curated Selection
            </h2>
            <p className="text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
              A curated selection of pieces that represent the essence of my artistic journey.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {featuredArtworks.map((artwork) => (
              <div key={artwork.id} className="bg-white rounded-3xl shadow-xl border border-slate-200/50 overflow-hidden hover:shadow-2xl transition-all duration-300 transform hover:scale-105">
                <div className="aspect-[4/3] bg-gradient-to-br from-slate-100 to-slate-200">
                  <img 
                    src={artwork.images[0]} 
                    alt={artwork.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-6">
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">
                    {artwork.title}
                  </h3>
                  <p className="text-slate-600 text-sm mb-4">
                    {artwork.medium}, {artwork.dimensions}
                  </p>
                  <div className="flex justify-between items-center">
                    <span className="text-2xl font-bold text-slate-900">
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
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-16">
            <Link href="/artworks">
              <Button className="h-12 px-8 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-lg">
                <span className="text-lg">View All Artworks</span>
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
