import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Exhibition } from "@shared/schema";
import { updateCanonicalUrl, updateMetaDescription } from "@/lib/seo";

export default function ExhibitionsPage() {
  useEffect(() => {
    document.title = "Exhibitions by Ani Muradyan | Solo & Group Art Shows";
    updateCanonicalUrl('/exhibitions');
    updateMetaDescription('Explore solo and group exhibitions by Armenian contemporary artist Ani Muradyan. Abstract realism oil paintings exhibited internationally.');
  }, []);

  const [activeTab, setActiveTab] = useState<'solo' | 'group'>('solo');

  const { data: exhibitions = [], isLoading } = useQuery<Exhibition[]>({
    queryKey: ["/api/exhibitions"]
  });

  const soloExhibitions = exhibitions.filter(ex => ex.type === 'solo');
  const groupExhibitions = exhibitions.filter(ex => ex.type === 'group');

  const currentExhibitions = activeTab === 'solo' ? soloExhibitions : groupExhibitions;

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
            Exhibitions
          </h1>
          <p className="text-soft-gray text-lg max-w-2xl mx-auto">
            A comprehensive overview of solo and group exhibitions showcasing my artistic journey.
          </p>
        </div>

        <div className="flex justify-center mb-12">
          <div className="bg-white rounded-lg shadow-sm p-2">
            <Button
              variant={activeTab === 'solo' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('solo')}
              className={activeTab === 'solo' 
                ? 'bg-deep-blue text-white hover:bg-deep-blue/90' 
                : 'text-charcoal hover:bg-gray-100'
              }
            >
              Solo Exhibitions
            </Button>
            <Button
              variant={activeTab === 'group' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('group')}
              className={activeTab === 'group' 
                ? 'bg-deep-blue text-white hover:bg-deep-blue/90' 
                : 'text-charcoal hover:bg-gray-100'
              }
            >
              Group Exhibitions
            </Button>
          </div>
        </div>

        {currentExhibitions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-soft-gray text-lg">
              No {activeTab} exhibitions to display.
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-8">
            {currentExhibitions.map((exhibition) => (
              <Card key={exhibition.id} className="bg-white shadow-lg overflow-hidden">
                {exhibition.image && (
                  <img 
                    src={exhibition.image} 
                    alt={`${exhibition.title} – ${exhibition.type} exhibition by Armenian artist Ani Muradyan at ${exhibition.venue}, ${exhibition.location}`}
                    className="w-full h-48 object-cover"
                  />
                )}
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-playfair text-xl font-semibold text-deep-blue">
                      "{exhibition.title}"
                    </h3>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-soft-gray text-sm">{exhibition.year}</span>
                      <Badge 
                        variant={exhibition.type === 'solo' ? 'default' : 'secondary'}
                        className={exhibition.type === 'solo' 
                          ? 'bg-blue-100 text-blue-800 hover:bg-blue-100' 
                          : 'bg-green-100 text-green-800 hover:bg-green-100'
                        }
                      >
                        {exhibition.type === 'solo' ? 'Solo' : 'Group'}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-deep-blue font-medium mb-2">
                    {exhibition.venue}, {exhibition.location}
                  </p>
                  {exhibition.description && (
                    <p className="text-soft-gray text-sm mb-4">
                      {exhibition.description}
                    </p>
                  )}
                  <div className="text-sm text-charcoal space-y-1">
                    {exhibition.startDate && exhibition.endDate && (
                      <p><strong>Duration:</strong> {exhibition.startDate} - {exhibition.endDate}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}