import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertHomepageSettingsSchema, insertArtistBioSchema, insertExhibitionSchema } from "@shared/schema";
import type { Artwork, Exhibition, HomepageSettings, ArtistBio } from "@shared/schema";
import { Plus, Edit, Trash, Eye, EyeOff, Upload, ChevronUp, ChevronDown } from "lucide-react";

export default function AdminPage() {
  const [, setLocation] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState<'homepage' | 'artworks' | 'exhibitions' | 'artist'>('homepage');
  const [showPassword, setShowPassword] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const authenticated = localStorage.getItem('admin-authenticated') === 'true';
    setIsAuthenticated(authenticated);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'artist123') {
      setIsAuthenticated(true);
      localStorage.setItem('admin-authenticated', 'true');
      toast({
        title: "Login successful",
        description: "Welcome to the admin panel",
      });
    } else {
      toast({
        title: "Invalid password",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('admin-authenticated');
    setPassword("");
  };

  // Optimized queries with better caching
  const { data: artworks = [], isLoading: artworksLoading } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks"],
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: exhibitions = [], isLoading: exhibitionsLoading } = useQuery<Exhibition[]>({
    queryKey: ["/api/exhibitions"],
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const { data: homepageSettings, isLoading: homepageLoading } = useQuery<HomepageSettings>({
    queryKey: ["/api/homepage-settings"],
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const { data: artistBio, isLoading: artistBioLoading } = useQuery<ArtistBio>({
    queryKey: ["/api/artist-bio"],
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  // Form configurations
  const homepageForm = useForm({
    resolver: zodResolver(insertHomepageSettingsSchema),
    defaultValues: homepageSettings || {
      heroQuote: "",
      heroImage: "",
      featuredArtworkIds: []
    },
  });

  const artistForm = useForm({
    resolver: zodResolver(insertArtistBioSchema),
    defaultValues: artistBio || {
      title: "",
      description: "",
      image: "",
      statement: "",
      education: "",
      awards: ""
    },
  });

  const exhibitionForm = useForm({
    resolver: zodResolver(insertExhibitionSchema),
    defaultValues: {
      title: "",
      type: "solo",
      venue: "",
      location: "",
      year: new Date().getFullYear(),
      startDate: "",
      endDate: "",
      description: "",
      image: "",
    },
  });

  // Update forms when data loads
  useEffect(() => {
    if (homepageSettings) {
      homepageForm.reset(homepageSettings);
    }
  }, [homepageSettings, homepageForm]);

  useEffect(() => {
    if (artistBio) {
      artistForm.reset(artistBio);
    }
  }, [artistBio, artistForm]);

  // Optimized mutations
  const updateHomepageMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("PUT", "/api/homepage-settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/homepage-settings"] });
      toast({ title: "Homepage updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update homepage", variant: "destructive" });
    },
  });

  const updateArtistBioMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("PUT", "/api/artist-bio", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artist-bio"] });
      toast({ title: "Artist bio updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update artist bio", variant: "destructive" });
    },
  });

  // File upload mutation
  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('image', file);
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Failed to upload image');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Image uploaded successfully",
        description: `Image path: ${data.imagePath}` 
      });
    },
    onError: () => {
      toast({ 
        title: "Failed to upload image", 
        variant: "destructive" 
      });
    },
  });

  // Artwork reordering mutation
  const reorderArtworkMutation = useMutation({
    mutationFn: async ({ id, direction }: { id: number; direction: 'up' | 'down' }) => {
      return apiRequest("POST", `/api/artworks/${id}/reorder`, { direction });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
      toast({ title: "Artwork order updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update artwork order", variant: "destructive" });
    },
  });

  // Helper functions for file uploads
  const handleImageUpload = (file: File, callback: (imagePath: string) => void) => {
    uploadImageMutation.mutate(file, {
      onSuccess: (data) => {
        callback(data.imagePath);
      }
    });
  };

  const handleReorderArtwork = (artworkId: number, direction: 'up' | 'down') => {
    reorderArtworkMutation.mutate({ id: artworkId, direction });
  };

  const deleteArtworkMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/artworks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
      toast({ title: "Artwork deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete artwork", variant: "destructive" });
    },
  });

  const deleteExhibitionMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/exhibitions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exhibitions"] });
      toast({ title: "Exhibition deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete exhibition", variant: "destructive" });
    },
  });

  const createExhibitionMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", "/api/exhibitions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exhibitions"] });
      exhibitionForm.reset();
      toast({ title: "Exhibition created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create exhibition", variant: "destructive" });
    },
  });

  // Form handlers
  const handleHomepageSubmit = (data: any) => {
    updateHomepageMutation.mutate(data);
  };

  const handleArtistSubmit = (data: any) => {
    updateArtistBioMutation.mutate(data);
  };

  const handleExhibitionSubmit = (data: any) => {
    createExhibitionMutation.mutate(data);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center font-playfair text-2xl text-deep-blue">
              Admin Login
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <Button type="submit" className="w-full bg-deep-blue hover:bg-deep-blue/90">
                Login
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="font-playfair text-3xl font-semibold text-deep-blue">
            Admin Panel
          </h1>
          <Button onClick={handleLogout} variant="outline">
            Logout
          </Button>
        </div>

        {/* Optimized Tabs */}
        <div className="flex space-x-1 bg-white p-1 rounded-lg shadow-sm mb-8">
          {(['homepage', 'artworks', 'exhibitions', 'artist'] as const).map((tab) => (
            <Button
              key={tab}
              variant={activeTab === tab ? 'default' : 'ghost'}
              onClick={() => setActiveTab(tab)}
              className={`capitalize ${
                activeTab === tab 
                  ? 'bg-deep-blue text-white hover:bg-deep-blue/90' 
                  : 'text-charcoal hover:bg-gray-100'
              }`}
            >
              {tab === 'artist' ? 'About Artist' : tab}
            </Button>
          ))}
        </div>

        {/* Homepage Tab */}
        {activeTab === 'homepage' && (
          <Card>
            <CardHeader>
              <CardTitle className="font-playfair text-xl text-deep-blue">
                Homepage Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              {homepageLoading ? (
                <div className="animate-pulse space-y-4">
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-10 bg-gray-200 rounded"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-10 bg-gray-200 rounded"></div>
                </div>
              ) : (
                <Form {...homepageForm}>
                  <form onSubmit={homepageForm.handleSubmit(handleHomepageSubmit)} className="space-y-6">
                    <FormField
                      control={homepageForm.control}
                      name="heroQuote"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Hero Quote</FormLabel>
                          <FormControl>
                            <Textarea {...field} rows={2} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={homepageForm.control}
                      name="heroImage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Hero Background Image</FormLabel>
                          <div className="space-y-2">
                            <FormControl>
                              <Input {...field} placeholder="https://example.com/image.jpg or /uploads/filename.jpg" />
                            </FormControl>
                            <div className="flex items-center space-x-2">
                              <Input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handleImageUpload(file, (imagePath) => {
                                      field.onChange(imagePath);
                                    });
                                  }
                                }}
                                className="hidden"
                                id="hero-image-upload"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => document.getElementById('hero-image-upload')?.click()}
                                disabled={uploadImageMutation.isPending}
                              >
                                <Upload className="w-4 h-4 mr-2" />
                                {uploadImageMutation.isPending ? 'Uploading...' : 'Upload Image'}
                              </Button>
                            </div>
                            {field.value && (
                              <div className="mt-2">
                                <img 
                                  src={field.value} 
                                  alt="Hero background preview" 
                                  className="w-32 h-20 object-cover rounded border"
                                />
                              </div>
                            )}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <Button 
                      type="submit" 
                      disabled={updateHomepageMutation.isPending}
                      className="bg-deep-blue hover:bg-deep-blue/90"
                    >
                      {updateHomepageMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>
        )}

        {/* Artworks Tab - Optimized */}
        {activeTab === 'artworks' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="font-playfair text-2xl text-deep-blue">Artworks</h2>
              <Button
                onClick={() => setLocation("/admin/create-artwork")}
                className="bg-deep-blue hover:bg-deep-blue/90"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add New Artwork
              </Button>
            </div>
            
            {artworksLoading ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse">
                    <div className="bg-gray-200 h-48 rounded-lg"></div>
                    <div className="mt-2 h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="mt-1 h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {artworks.map((artwork) => (
                  <Card key={artwork.id} className="overflow-hidden">
                    <div className="aspect-video bg-gray-100">
                      {artwork.images?.[0] && (
                        <img 
                          src={artwork.images[0]} 
                          alt={artwork.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            console.error('Image failed to load:', artwork.images[0]);
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-lg mb-1">{artwork.title}</h3>
                      <p className="text-sm text-soft-gray mb-2">{artwork.year} • ${artwork.price.toLocaleString()}</p>
                      <p className="text-xs text-charcoal mb-3 line-clamp-2">{artwork.description}</p>
                      <div className="flex justify-between items-center">
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              console.log('Edit button clicked for artwork:', artwork.id);
                              setLocation(`/admin/edit-artwork/${artwork.id}`);
                            }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteArtworkMutation.mutate(artwork.id)}
                            disabled={deleteArtworkMutation.isPending}
                          >
                            <Trash className="w-4 h-4" />
                          </Button>
                        </div>
                        
                        {/* Reordering Controls */}
                        <div className="flex space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReorderArtwork(artwork.id, 'up')}
                            disabled={reorderArtworkMutation.isPending}
                            title="Move Up"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReorderArtwork(artwork.id, 'down')}
                            disabled={reorderArtworkMutation.isPending}
                            title="Move Down"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Exhibitions Tab */}
        {activeTab === 'exhibitions' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-playfair text-xl text-deep-blue">
                  Add New Exhibition
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...exhibitionForm}>
                  <form onSubmit={exhibitionForm.handleSubmit(handleExhibitionSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={exhibitionForm.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Title</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={exhibitionForm.control}
                        name="year"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Year</FormLabel>
                            <FormControl>
                              <Input {...field} type="number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={exhibitionForm.control}
                        name="venue"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Venue</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={exhibitionForm.control}
                        name="location"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Location</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={exhibitionForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea {...field} rows={3} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <Button 
                      type="submit" 
                      disabled={createExhibitionMutation.isPending}
                      className="bg-deep-blue hover:bg-deep-blue/90"
                    >
                      {createExhibitionMutation.isPending ? "Creating..." : "Create Exhibition"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            {/* Exhibitions List */}
            {exhibitionsLoading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className="animate-pulse bg-white p-4 rounded-lg">
                    <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {exhibitions.map((exhibition) => (
                  <Card key={exhibition.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold">{exhibition.title}</h3>
                          <p className="text-sm text-soft-gray">
                            {exhibition.venue}, {exhibition.location} • {exhibition.year}
                          </p>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteExhibitionMutation.mutate(exhibition.id)}
                          disabled={deleteExhibitionMutation.isPending}
                        >
                          <Trash className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Artist Bio Tab */}
        {activeTab === 'artist' && (
          <Card>
            <CardHeader>
              <CardTitle className="font-playfair text-xl text-deep-blue">
                About Artist
              </CardTitle>
            </CardHeader>
            <CardContent>
              {artistBioLoading ? (
                <div className="animate-pulse space-y-4">
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-10 bg-gray-200 rounded"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-20 bg-gray-200 rounded"></div>
                </div>
              ) : (
                <Form {...artistForm}>
                  <form onSubmit={artistForm.handleSubmit(handleArtistSubmit)} className="space-y-6">
                    <FormField
                      control={artistForm.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Title</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="About Ani Muradyan" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={artistForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea {...field} rows={4} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={artistForm.control}
                      name="image"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Artist Photo URL</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="https://example.com/artist-photo.jpg" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={artistForm.control}
                      name="statement"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Artist Statement</FormLabel>
                          <FormControl>
                            <Textarea {...field} rows={3} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={artistForm.control}
                      name="education"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Education</FormLabel>
                          <FormControl>
                            <Textarea {...field} rows={2} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={artistForm.control}
                      name="awards"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Awards & Recognition</FormLabel>
                          <FormControl>
                            <Textarea {...field} rows={2} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <Button 
                      type="submit" 
                      disabled={updateArtistBioMutation.isPending}
                      className="bg-deep-blue hover:bg-deep-blue/90"
                    >
                      {updateArtistBioMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}