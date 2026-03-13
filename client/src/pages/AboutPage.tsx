import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link } from "wouter";
import type { ArtistBio, Exhibition } from "@shared/schema";
import { updateCanonicalUrl, updateMetaDescription } from "@/lib/seo";

export default function AboutPage() {
  // Set page title and canonical URL for SEO
  useEffect(() => {
    document.title = "About Ani Muradyan | Contemporary Armenian Artist Biography";
    updateCanonicalUrl('/about');
    updateMetaDescription('Learn about Ani Muradyan, a contemporary Armenian artist known for abstract realism oil paintings. Biography, artist statement, education, and exhibition history.');
  }, []);
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-3 rounded-full text-sm font-medium text-blue-700 mb-8 animate-fadeIn">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            About Ani Muradyan
          </div>
          <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-transparent mb-6 animate-slideUp">
            Ani Muradyan
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed animate-slideUp animation-delay-200">
            Abstract Realism Artist from Armenia, creating works that bring hope and emotion into people's lives.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-20 items-start">
          {/* Artist Portrait */}
          <div className="space-y-8 animate-slideLeft">
            {bioLoading ? (
              <div className="animate-pulse">
                <div className="w-full max-w-lg mx-auto h-96 bg-gradient-to-br from-slate-200 to-slate-300 rounded-3xl"></div>
              </div>
            ) : (
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-3xl blur opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>
                <img 
                  src={artistBio?.image || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&h=800"} 
                  alt="Portrait of Ani Muradyan – Armenian contemporary abstract realism artist"
                  title="Ani Muradyan – Contemporary Abstract Realism Artist from Armenia"
                  className="relative w-full max-w-lg mx-auto rounded-3xl shadow-2xl aspect-[3/4] object-cover border border-slate-200/50 transform group-hover:scale-105 transition-transform duration-700"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.src = "https://images.unsplash.com/photo-1544005313-94ddf0286df2?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&h=800";
                  }}
                />
              </div>
            )}
          </div>

          {/* Biography and CV */}
          <div className="space-y-12 animate-slideRight">
            <div className="bg-white rounded-3xl p-8 shadow-xl border border-slate-200/50 hover:shadow-2xl transition-shadow duration-500">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h2 className="text-3xl font-bold text-slate-900">
                  {artistBio?.title || "Biography"}
                </h2>
              </div>
              
              {bioLoading ? (
                <div className="animate-pulse space-y-4">
                  <div className="h-4 bg-gradient-to-r from-slate-200 to-slate-300 rounded w-full"></div>
                  <div className="h-4 bg-gradient-to-r from-slate-200 to-slate-300 rounded w-5/6"></div>
                  <div className="h-4 bg-gradient-to-r from-slate-200 to-slate-300 rounded w-4/5"></div>
                  <div className="h-4 bg-gradient-to-r from-slate-200 to-slate-300 rounded w-full"></div>
                </div>
              ) : (
                <div className="prose prose-lg max-w-none text-slate-600 leading-relaxed space-y-6">
                  {artistBio?.description && (
                    <div className="whitespace-pre-wrap text-lg leading-relaxed">{artistBio.description}</div>
                  )}
                  
                  {artistBio?.statement && (
                    <div className="mt-12">
                      <h3 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
                        <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-md flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        Artist Statement
                      </h3>
                      <div className="whitespace-pre-wrap text-slate-600">{artistBio.statement}</div>
                    </div>
                  )}
                  
                  {artistBio?.education && (
                    <div className="mt-12">
                      <h3 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
                        <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-md flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                          </svg>
                        </div>
                        Education
                      </h3>
                      <div className="whitespace-pre-wrap text-slate-600">{artistBio.education}</div>
                    </div>
                  )}
                  
                  {artistBio?.awards && (
                    <div className="mt-12">
                      <h3 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
                        <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-md flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                          </svg>
                        </div>
                        Awards & Recognition
                      </h3>
                      <div className="whitespace-pre-wrap text-slate-600">{artistBio.awards}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* CV Timeline - Exhibitions Only */}
            <div className="bg-white rounded-3xl p-8 shadow-xl border border-slate-200/50 hover:shadow-2xl transition-shadow duration-500">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h2 className="text-3xl font-bold text-slate-900">Exhibition History</h2>
              </div>
              
              {exhibitionsLoading ? (
                <div className="animate-pulse space-y-6">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="border-l-4 border-gradient-to-b from-slate-200 to-slate-300 pl-6 pb-6">
                      <div className="h-6 bg-gradient-to-r from-slate-200 to-slate-300 rounded w-3/4 mb-2"></div>
                      <div className="h-4 bg-gradient-to-r from-slate-200 to-slate-300 rounded w-1/2 mb-1"></div>
                      <div className="h-3 bg-gradient-to-r from-slate-200 to-slate-300 rounded w-full"></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-6">
                  {(exhibitions.length > 0 ? exhibitions : fallbackExhibitions).map((exhibition, index) => (
                    <div key={'id' in exhibition ? exhibition.id : index} className="relative pl-8 pb-6 group">
                      <div className="absolute left-0 top-0 w-1 h-full bg-gradient-to-b from-blue-500 to-indigo-500 rounded-full"></div>
                      <div className="absolute left-[-4px] top-2 w-2 h-2 bg-blue-500 rounded-full group-hover:scale-150 transition-transform duration-300"></div>
                      
                      <div className="bg-gradient-to-r from-slate-50 to-white p-6 rounded-2xl border border-slate-200/50 hover:shadow-lg transition-all duration-300 transform hover:scale-105">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3">
                          <h3 className="font-semibold text-xl text-slate-900">{exhibition.title}</h3>
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                            {exhibition.year}
                          </span>
                        </div>
                        <p className="text-blue-600 font-medium mb-2">
                          {exhibition.venue}
                          {'location' in exhibition && exhibition.location && `, ${exhibition.location}`}
                        </p>
                        {exhibition.description && (
                          <p className="text-slate-600 text-sm leading-relaxed">{exhibition.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-3xl p-8 shadow-xl border border-slate-200/50">
              <h3 className="text-xl font-bold text-slate-900 mb-4">Explore More</h3>
              <div className="space-y-3">
                <p className="text-slate-600">
                  <Link href="/artworks" className="text-blue-600 hover:text-blue-700 font-medium hover:underline">Browse the complete collection of original artworks</Link> available for purchase.
                </p>
                <p className="text-slate-600">
                  <Link href="/gallery" className="text-blue-600 hover:text-blue-700 font-medium hover:underline">View the exhibition gallery</Link> for behind-the-scenes moments and exhibition photos.
                </p>
                <p className="text-slate-600">
                  <Link href="/prints" className="text-blue-600 hover:text-blue-700 font-medium hover:underline">Shop museum-quality art prints</Link> on premium paper and canvas.
                </p>
                <p className="text-slate-600">
                  <Link href="/contact" className="text-blue-600 hover:text-blue-700 font-medium hover:underline">Get in touch</Link> for commissions, inquiries, or collaborations.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Internal contextual links for SEO */}
        <div className="mt-16 text-center">
          <p className="text-slate-600 text-lg">
            <Link href="/gallery" className="text-blue-600 hover:underline font-medium">
              View the gallery of abstract realism paintings
            </Link>{" "}
            or{" "}
            <Link href="/contact" className="text-blue-600 hover:underline font-medium">
              get in touch
            </Link>{" "}
            to enquire about original works.
          </p>
        </div>
      </div>
    </div>
  );
}
