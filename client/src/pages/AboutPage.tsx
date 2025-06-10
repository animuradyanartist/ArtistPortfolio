export default function AboutPage() {
  const exhibitions = [
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
            <img 
              src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&h=800" 
              alt="Ani Muradyan artist portrait" 
              className="w-full max-w-md mx-auto rounded-lg shadow-lg"
            />
            
            <img 
              src="https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&h=400" 
              alt="Ani Muradyan in her art studio" 
              className="w-full max-w-md mx-auto rounded-lg shadow-lg"
            />
          </div>

          {/* Biography and CV */}
          <div className="space-y-8">
            <div>
              <h2 className="font-playfair text-3xl font-semibold text-deep-blue mb-6">Biography</h2>
              <div className="prose prose-lg text-soft-gray leading-relaxed space-y-4">
                <p>
                  Ani Muradyan is a contemporary abstract realism artist born and raised in Armenia. Her work explores the intersection of emotion and form, creating paintings that speak to the universal human experience through abstracted representations of reality.
                </p>
                
                <p>
                  Drawing inspiration from her Armenian heritage and the dramatic landscapes of her homeland, Ani's paintings are characterized by their emotional depth, sophisticated color palettes, and masterful use of texture. Her technique combines traditional oil painting methods with contemporary abstract approaches, resulting in works that are both timeless and thoroughly modern.
                </p>
                
                <p>
                  After completing her formal education at the Yerevan Institute of Fine Arts, Ani spent several years developing her distinctive style, which she describes as "emotional realism." Her work has been featured in numerous solo and group exhibitions across Europe and North America, garnering recognition for its unique ability to convey complex emotions through abstract forms.
                </p>
                
                <p>
                  Currently based between Yerevan and international art centers, Ani continues to create works that challenge viewers to engage with art on a deeply personal level. Her philosophy that "art must bring hope into people's lives" permeates every piece she creates, making her work both aesthetically compelling and spiritually uplifting.
                </p>
              </div>
            </div>

            {/* CV Timeline - Exhibitions Only */}
            <div>
              <h2 className="font-playfair text-3xl font-semibold text-deep-blue mb-6">Exhibition History</h2>
              <div className="space-y-6">
                {exhibitions.map((exhibition, index) => (
                  <div key={index} className="border-l-4 border-muted-pink pl-6 pb-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2">
                      <h3 className="font-semibold text-lg">{exhibition.title}</h3>
                      <span className="text-soft-gray text-sm">{exhibition.year}</span>
                    </div>
                    <p className="text-deep-blue font-medium">{exhibition.venue}</p>
                    <p className="text-soft-gray text-sm mt-1">{exhibition.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
