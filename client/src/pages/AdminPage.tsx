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
import type { Artwork, Print, Exhibition, HomepageSettings, ArtistBio } from "@shared/schema";
import { Plus, Edit, Trash, Eye, EyeOff, Upload, ChevronUp, ChevronDown } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function AdminPage() {
  const [, setLocation] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState<'homepage' | 'artworks' | 'prints' | 'exhibitions' | 'artist'>('homepage');
  const [showPassword, setShowPassword] = useState(false);
  
  // Drag and drop state
  const [draggedArtwork, setDraggedArtwork] = useState<number | null>(null);
  const [dragOverArtwork, setDragOverArtwork] = useState<number | null>(null);

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

  // Drag and drop reordering mutation
  const dragReorderMutation = useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: number; targetId: number }) => {
      return apiRequest("POST", `/api/artworks/reorder-drag`, { sourceId, targetId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
      toast({ title: "Artwork position updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update artwork position", variant: "destructive" });
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

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, artworkId: number) => {
    setDraggedArtwork(artworkId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', ''); // Required for Firefox
  };

  const handleDragOver = (e: React.DragEvent, artworkId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverArtwork(artworkId);
  };

  const handleDragLeave = () => {
    setDragOverArtwork(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    if (draggedArtwork && draggedArtwork !== targetId) {
      dragReorderMutation.mutate({ sourceId: draggedArtwork, targetId });
    }
    setDraggedArtwork(null);
    setDragOverArtwork(null);
  };

  const handleDragEnd = () => {
    setDraggedArtwork(null);
    setDragOverArtwork(null);
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

  const deletePrintMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/prints/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prints"] });
      toast({ title: "Print deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete print", variant: "destructive" });
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2 rounded-full text-sm font-medium text-blue-700 mb-4">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              Admin Access
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-transparent mb-2">
              Admin Portal
            </h1>
            <p className="text-slate-600">Enter your credentials to access the admin dashboard</p>
          </div>
          
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200/50 overflow-hidden">
            <div className="p-8">
              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-3">
                  <label htmlFor="password" className="text-sm font-medium text-slate-700">Password</label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter admin password"
                      className="h-12 text-base border-slate-200 focus:border-blue-500 focus:ring-blue-500/20 pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium rounded-xl transition-all duration-200"
                >
                  Sign In
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-12">
          <div>
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2 rounded-full text-sm font-medium text-blue-700 mb-4">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              Admin Dashboard
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-transparent">
              Content Management
            </h1>
          </div>
          <Button 
            onClick={handleLogout} 
            variant="outline"
            className="h-10 px-6 border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </Button>
        </div>

        {/* Modern Tabs */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200/50 p-2 mb-8">
          <div className="flex space-x-1">
            {(['homepage', 'artworks', 'prints', 'exhibitions', 'artist'] as const).map((tab) => (
              <Button
                key={tab}
                variant="ghost"
                onClick={() => setActiveTab(tab)}
                className={`capitalize flex-1 h-10 rounded-xl transition-all duration-200 ${
                  activeTab === tab 
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {tab === 'artist' ? 'About Artist' : tab}
              </Button>
            ))}
          </div>
        </div>

        {/* Homepage Tab */}
        {activeTab === 'homepage' && (
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200/50 overflow-hidden">
            <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-8 py-6 border-b border-slate-200/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">Homepage Settings</h3>
                  <p className="text-sm text-slate-600">Configure your homepage appearance and content</p>
                </div>
              </div>
            </div>
            <div className="p-8">
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
                      className="h-10 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium rounded-xl transition-all duration-200"
                    >
                      {updateHomepageMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </form>
                </Form>
              )}
            </div>
          </div>
        )}

        {/* Artworks Tab - Optimized */}
        {activeTab === 'artworks' && (
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200/50 overflow-hidden">
            <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-8 py-6 border-b border-slate-200/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900">Artworks</h3>
                    <p className="text-sm text-slate-600">Manage your artwork collection</p>
                  </div>
                </div>
                <Button
                  onClick={() => setLocation("/admin/create-artwork")}
                  className="h-10 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium rounded-xl transition-all duration-200"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add New Artwork
                </Button>
              </div>
            </div>
            
            <div className="p-8">
            
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
                {artworks
                  .sort((a, b) => (a.position || 0) - (b.position || 0))
                  .map((artwork) => (
                  <Card 
                    key={artwork.id} 
                    className={`overflow-hidden transition-all duration-200 cursor-move ${
                      draggedArtwork === artwork.id ? 'opacity-50 scale-95' : ''
                    } ${
                      dragOverArtwork === artwork.id ? 'ring-2 ring-blue-500 shadow-lg scale-105' : ''
                    }`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, artwork.id)}
                    onDragOver={(e) => handleDragOver(e, artwork.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, artwork.id)}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="aspect-video bg-gray-100 relative">
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
                      {/* Drag indicator */}
                      <div className="absolute top-2 right-2 bg-black/50 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
                        </svg>
                        Drag
                      </div>
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
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={deleteArtworkMutation.isPending}
                              >
                                <Trash className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Artwork</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{artwork.title}"? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteArtworkMutation.mutate(artwork.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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
                              <Input 
                                {...field} 
                                type="number" 
                                onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                              />
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
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={deleteExhibitionMutation.isPending}
                            >
                              <Trash className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Exhibition</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{exhibition.title}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteExhibitionMutation.mutate(exhibition.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Prints Tab - Independent Print Management */}
        {activeTab === 'prints' && (
          <PrintsManagement />
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
                          <FormLabel>Artist Photo</FormLabel>
                          <div className="space-y-2">
                            <FormControl>
                              <Input {...field} placeholder="https://example.com/artist-photo.jpg or /uploads/filename.jpg" />
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
                                id="artist-image-upload"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => document.getElementById('artist-image-upload')?.click()}
                                disabled={uploadImageMutation.isPending}
                              >
                                <Upload className="w-4 h-4 mr-2" />
                                {uploadImageMutation.isPending ? 'Uploading...' : 'Upload Photo'}
                              </Button>
                            </div>
                            {field.value && (
                              <div className="mt-2">
                                <img 
                                  src={field.value} 
                                  alt="Artist photo preview" 
                                  className="w-32 h-32 object-cover rounded border"
                                />
                              </div>
                            )}
                          </div>
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

function PrintsManagement() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: prints = [], isLoading: printsLoading } = useQuery<Print[]>({
    queryKey: ["/api/prints"],
  });

  const deletePrintMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/prints/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prints"] });
      toast({ title: "Print deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete print", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="font-playfair text-2xl text-deep-blue">Print Editions Management</h2>
        <Button
          onClick={() => setLocation("/admin/create-print")}
          className="bg-deep-blue hover:bg-deep-blue/90"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add New Print Edition
        </Button>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="font-playfair text-lg text-deep-blue">
            About Print Editions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-soft-gray mb-4">
            Print editions are completely separate from original artworks. Each print edition has its own images, 
            pricing, sizes, and materials. You can optionally reference an original artwork, but prints have 
            independent management and data.
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold text-deep-blue mb-2">Independent Data</h3>
              <p className="text-xs text-soft-gray">
                Prints have their own images, descriptions, and pricing separate from original artworks.
              </p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <h3 className="font-semibold text-deep-blue mb-2">Custom Sizes</h3>
              <p className="text-xs text-soft-gray">
                Configure multiple size options with different materials and custom pricing per print edition.
              </p>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <h3 className="font-semibold text-deep-blue mb-2">Optional Reference</h3>
              <p className="text-xs text-soft-gray">
                Optionally link to an original artwork for reference, but prints remain independently managed.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {printsLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-gray-200 h-48 rounded-lg"></div>
              <div className="mt-2 h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="mt-1 h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : prints.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-soft-gray">
              <h3 className="font-semibold text-lg mb-2">No Print Editions Yet</h3>
              <p className="text-sm mb-4">
                Start by creating your first print edition. Each print edition is independent with its own images, 
                sizes, and pricing.
              </p>
              <Button
                onClick={() => setLocation("/admin/create-print")}
                className="bg-deep-blue hover:bg-deep-blue/90"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create First Print Edition
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {prints.map((print) => (
            <Card key={print.id} className="overflow-hidden">
              <div className="aspect-video bg-gray-100">
                {print.images?.[0] && (
                  <img 
                    src={print.images[0]} 
                    alt={print.title}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-charcoal text-sm truncate">
                    {print.title}
                  </h3>
                  <div className={`text-xs px-2 py-1 rounded-full font-medium ${
                    print.status === 'active' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {print.status === 'active' ? 'Active' : 'Discontinued'}
                  </div>
                </div>
                <p className="text-soft-gray text-xs mb-3">
                  {print.preferredMaterial} • {(() => {
                    try {
                      const sizes = JSON.parse(print.availableSizes);
                      return `${sizes.length} size${sizes.length !== 1 ? 's' : ''}`;
                    } catch {
                      return 'No sizes';
                    }
                  })()}
                </p>
                
                {print.description && (
                  <p className="text-xs text-soft-gray mb-3 line-clamp-2">
                    {print.description}
                  </p>
                )}
                
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLocation(`/admin/edit-print/${print.id}`)}
                    className="flex-1 text-xs"
                  >
                    <Edit className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="text-xs"
                        disabled={deletePrintMutation.isPending}
                      >
                        <Trash className="w-3 h-3" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Print Edition</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{print.title}"? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deletePrintMutation.mutate(print.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  
                  {print.featured && (
                    <div className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full font-medium">
                      Featured
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}