import { useQuery } from "@tanstack/react-query";
import type { ArtistBio, Exhibition } from "@shared/schema";

export default function AboutPage() {
  // Fetch artist bio data from the API
  const { data: artistBio, isLoading: bioLoading } = useQuery<ArtistBio>({
    queryKey: ["/api/artist-bio"],
  });

  // Fetch exhibitions data from the API
  const { data: exhibitions = [], isLoading: exhibitionsLoading } = useQuery<Exhibition[]>({
    queryKey: ["/api/exhibitions"],
  });

  // Fallback exhibitions data if none in database
  const fallbackExhibitions = [
    {
      title: "Solo Exhibition: \"Whispers of the Soul\"",
      year: "2023",
      venue: "Galerie Moderne, Paris, France",
      description: "A comprehensive showcase of recent works exploring themes of hope and resilience."
    },
    {
      title: "Group Exhibition: \"Contemporary Voices\"",
      year: "2022",
      venue: "Museum of Contemporary Art, Yerevan, Armenia", 
      description: "Featured alongside 15 prominent Armenian contemporary artists."
    },
    {
      title: "Solo Exhibition: \"Abstract Emotions\"",
      year: "2021",
      venue: "Chelsea Art Gallery, New York, USA",
      description: "Debut international solo exhibition featuring 25 paintings."
    },
    {
      title: "Group Exhibition: \"Emerging Artists\"",
      year: "2020",
      venue: "National Gallery of Armenia, Yerevan",
      description: "Selected as one of 10 emerging artists to watch."
    },
    {
      title: "First Solo Exhibition: \"Beginning\"",
      year: "2019",
      venue: "Art Space Yerevan, Armenia",
      description: "First solo showing of 15 paintings, marking the beginning of professional career."
    }
  ];

  return (
    <div className="min-h-screen py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="font-playfair text-4xl md:text-5xl font-semibold text-deep-blue mb-4">
            About the Artist
          </h1>
        </div>

        <div className="grid lg:grid-cols-2 gap-16 items-start">
          {/* Artist Portrait */}
          <div className="space-y-8">
            {bioLoading ? (
              <div className="animate-pulse">
                <div className="w-full max-w-md mx-auto h-96 bg-gray-200 rounded-lg"></div>
              </div>
            ) : (
              <img 
                src={artistBio?.image || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&h=800"} 
                alt="Ani Muradyan artist portrait" 
                className="w-full max-w-md mx-auto rounded-lg shadow-lg aspect-[3/4] object-cover"
                onError={(e) => {
                  // Fallback to default image if uploaded image fails to load
                  e.currentTarget.src = "https://images.unsplash.com/photo-1544005313-94ddf0286df2?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&h=800";
                }}
              />
            )}
          </div>

          {/* Biography and CV */}
          <div className="space-y-8">
            <div>
              <h2 className="font-playfair text-3xl font-semibold text-deep-blue mb-6">
                {artistBio?.title || "Biography"}
              </h2>
              {bioLoading ? (
                <div className="animate-pulse space-y-4">
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                  <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                  <div className="h-4 bg-gray-200 rounded w-4/5"></div>
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                </div>
              ) : (
                <div className="prose prose-lg text-soft-gray leading-relaxed space-y-4">
                  {artistBio?.description && (
                    <div className="whitespace-pre-wrap">{artistBio.description}</div>
                  )}
                  
                  {artistBio?.statement && (
                    <div>
                      <h3 className="font-semibold text-deep-blue mt-8 mb-4">Artist Statement</h3>
                      <div className="whitespace-pre-wrap">{artistBio.statement}</div>
                    </div>
                  )}
                  
                  {artistBio?.education && (
                    <div>
                      <h3 className="font-semibold text-deep-blue mt-8 mb-4">Education</h3>
                      <div className="whitespace-pre-wrap">{artistBio.education}</div>
                    </div>
                  )}
                  
                  {artistBio?.awards && (
                    <div>
                      <h3 className="font-semibold text-deep-blue mt-8 mb-4">Awards & Recognition</h3>
                      <div className="whitespace-pre-wrap">{artistBio.awards}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* CV Timeline - Exhibitions Only */}
            <div>
              <h2 className="font-playfair text-3xl font-semibold text-deep-blue mb-6">Exhibition History</h2>
              {exhibitionsLoading ? (
                <div className="animate-pulse space-y-6">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="border-l-4 border-gray-200 pl-6 pb-6">
                      <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
                      <div className="h-4 bg-gray-200 rounded w-1/2 mb-1"></div>
                      <div className="h-3 bg-gray-200 rounded w-full"></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-6">
                  {(exhibitions.length > 0 ? exhibitions : fallbackExhibitions).map((exhibition, index) => (
                    <div key={'id' in exhibition ? exhibition.id : index} className="border-l-4 border-muted-pink pl-6 pb-6">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2">
                        <h3 className="font-semibold text-lg">{exhibition.title}</h3>
                        <span className="text-soft-gray text-sm">{exhibition.year}</span>
                      </div>
                      <p className="text-deep-blue font-medium">
                        {exhibition.venue}
                        {'location' in exhibition && exhibition.location && `, ${exhibition.location}`}
                      </p>
                      {exhibition.description && (
                        <p className="text-soft-gray text-sm mt-1">{exhibition.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
