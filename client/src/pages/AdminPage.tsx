import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertArtworkSchema, insertExhibitionSchema, insertHomepageSettingsSchema } from "@shared/schema";
import type { Artwork, Exhibition, HomepageSettings } from "@shared/schema";
import { Plus, Edit, Trash, Eye, EyeOff, Upload, X } from "lucide-react";

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState<'homepage' | 'artworks' | 'exhibitions'>('homepage');
  const [artworkDialogOpen, setArtworkDialogOpen] = useState(false);
  const [exhibitionDialogOpen, setExhibitionDialogOpen] = useState(false);
  const [editingArtwork, setEditingArtwork] = useState<Artwork | null>(null);
  const [editingExhibition, setEditingExhibition] = useState<Exhibition | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [uploadingImages, setUploadingImages] = useState<boolean[]>([false, false, false]);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Helper function to convert file to base64
  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // Handle image upload
  const handleImageUpload = async (file: File, imageIndex: number) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      toast({
        title: "File too large",
        description: "Please select an image smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    setUploadingImages(prev => {
      const newState = [...prev];
      newState[imageIndex] = true;
      return newState;
    });

    try {
      const base64 = await convertFileToBase64(file);
      const currentImages = artworkForm.getValues('images') || [];
      const newImages = [...currentImages];
      newImages[imageIndex] = base64;
      artworkForm.setValue('images', newImages.filter(img => img !== ''));
      
      toast({
        title: "Image uploaded successfully",
        description: "The image has been added to your artwork",
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Failed to upload image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploadingImages(prev => {
        const newState = [...prev];
        newState[imageIndex] = false;
        return newState;
      });
    }
  };

  // Check if user is already authenticated
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

  // Queries
  const { data: artworks = [] } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks"],
    enabled: isAuthenticated,
  });

  const { data: exhibitions = [] } = useQuery<Exhibition[]>({
    queryKey: ["/api/exhibitions"],
    enabled: isAuthenticated,
  });

  const { data: homepageSettings } = useQuery<HomepageSettings>({
    queryKey: ["/api/homepage-settings"],
    enabled: isAuthenticated,
  });

  // Homepage form
  const homepageForm = useForm({
    resolver: zodResolver(insertHomepageSettingsSchema),
    defaultValues: homepageSettings || {
      heroQuote: "Art must bring hope into people's lives.",
      heroImage: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&h=1080",
      featuredArtworkIds: ["1", "2", "3"]
    },
  });

  // Update form when homepage settings load
  useEffect(() => {
    if (homepageSettings) {
      homepageForm.reset(homepageSettings);
    }
  }, [homepageSettings, homepageForm]);

  // Artwork form
  const artworkForm = useForm({
    resolver: zodResolver(insertArtworkSchema),
    defaultValues: {
      title: "",
      description: "",
      medium: "",
      dimensions: "",
      year: new Date().getFullYear(),
      price: 0,
      images: [""],
      type: "oil",
      size: "medium",
      availability: "available",
      saatchiUrl: "https://saatchiart.com",
      featured: false,
    },
  });

  // Exhibition form
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

  // Mutations
  const updateHomepageMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PUT", "/api/homepage-settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/homepage-settings"] });
      toast({
        title: "Homepage updated successfully",
      });
    },
  });

  const createArtworkMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/artworks", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
      setArtworkDialogOpen(false);
      artworkForm.reset();
      toast({
        title: "Artwork created successfully",
      });
    },
  });

  const updateArtworkMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest("PUT", `/api/artworks/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
      setArtworkDialogOpen(false);
      setEditingArtwork(null);
      artworkForm.reset();
      toast({
        title: "Artwork updated successfully",
      });
    },
  });

  const deleteArtworkMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/artworks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
      toast({
        title: "Artwork deleted successfully",
      });
    },
  });

  const createExhibitionMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/exhibitions", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exhibitions"] });
      setExhibitionDialogOpen(false);
      exhibitionForm.reset();
      toast({
        title: "Exhibition created successfully",
      });
    },
  });

  const updateExhibitionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest("PUT", `/api/exhibitions/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exhibitions"] });
      setExhibitionDialogOpen(false);
      setEditingExhibition(null);
      exhibitionForm.reset();
      toast({
        title: "Exhibition updated successfully",
      });
    },
  });

  const deleteExhibitionMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/exhibitions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exhibitions"] });
      toast({
        title: "Exhibition deleted successfully",
      });
    },
  });

  // Form handlers
  const handleHomepageSubmit = (data: any) => {
    updateHomepageMutation.mutate(data);
  };

  const handleArtworkSubmit = (data: any) => {
    if (editingArtwork) {
      updateArtworkMutation.mutate({ id: editingArtwork.id, data });
    } else {
      createArtworkMutation.mutate(data);
    }
  };

  const handleExhibitionSubmit = (data: any) => {
    if (editingExhibition) {
      updateExhibitionMutation.mutate({ id: editingExhibition.id, data });
    } else {
      createExhibitionMutation.mutate(data);
    }
  };

  const openArtworkDialog = (artwork?: Artwork) => {
    if (artwork) {
      setEditingArtwork(artwork);
      artworkForm.reset({
        ...artwork,
        saatchiUrl: artwork.saatchiUrl || "",
        featured: artwork.featured || false
      });
    } else {
      setEditingArtwork(null);
      artworkForm.reset({
        title: "",
        description: "",
        medium: "",
        dimensions: "",
        year: new Date().getFullYear(),
        price: 0,
        images: [""],
        type: "oil",
        size: "medium",
        availability: "available",
        saatchiUrl: "",
        featured: false,
      });
    }
    setArtworkDialogOpen(true);
  };

  const openExhibitionDialog = (exhibition?: Exhibition) => {
    if (exhibition) {
      setEditingExhibition(exhibition);
      exhibitionForm.reset({
        ...exhibition,
        description: exhibition.description || "",
        startDate: exhibition.startDate || "",
        endDate: exhibition.endDate || "",
        image: exhibition.image || ""
      });
    } else {
      setEditingExhibition(null);
      exhibitionForm.reset({
        title: "",
        type: "solo",
        venue: "",
        location: "",
        year: new Date().getFullYear(),
        startDate: "",
        endDate: "",
        description: "",
        image: "",
      });
    }
    setExhibitionDialogOpen(true);
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

        {/* Tabs */}
        <div className="flex space-x-1 bg-white p-1 rounded-lg shadow-sm mb-8">
          {(['homepage', 'artworks', 'exhibitions'] as const).map((tab) => (
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
              {tab}
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
                        <FormLabel>Hero Background Image URL</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="https://example.com/image.jpg" />
                        </FormControl>
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
            </CardContent>
          </Card>
        )}

        {/* Artworks Tab */}
        {activeTab === 'artworks' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="font-playfair text-2xl text-deep-blue">Artworks</h2>
              <Button onClick={() => openArtworkDialog()} className="bg-deep-blue hover:bg-deep-blue/90">
                <Plus className="w-4 h-4 mr-2" />
                Add Artwork
              </Button>
            </div>
            
            <div className="grid gap-4">
              {artworks.map((artwork) => (
                <Card key={artwork.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <img 
                          src={artwork.images[0]} 
                          alt={artwork.title}
                          className="w-16 h-16 object-cover rounded"
                        />
                        <div>
                          <h3 className="font-semibold">{artwork.title}</h3>
                          <p className="text-sm text-soft-gray">
                            {artwork.medium} • ${artwork.price.toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openArtworkDialog(artwork)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteArtworkMutation.mutate(artwork.id)}
                        >
                          <Trash className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Exhibitions Tab */}
        {activeTab === 'exhibitions' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="font-playfair text-2xl text-deep-blue">Exhibitions</h2>
              <Button onClick={() => openExhibitionDialog()} className="bg-deep-blue hover:bg-deep-blue/90">
                <Plus className="w-4 h-4 mr-2" />
                Add Exhibition
              </Button>
            </div>
            
            <div className="grid gap-4">
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
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openExhibitionDialog(exhibition)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteExhibitionMutation.mutate(exhibition.id)}
                        >
                          <Trash className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Artwork Dialog */}
        <Dialog open={artworkDialogOpen} onOpenChange={setArtworkDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-playfair text-xl text-deep-blue">
                {editingArtwork ? 'Edit Artwork' : 'Add New Artwork'}
              </DialogTitle>
            </DialogHeader>
            <Form {...artworkForm}>
              <form onSubmit={artworkForm.handleSubmit(handleArtworkSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={artworkForm.control}
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
                    control={artworkForm.control}
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
                
                <FormField
                  control={artworkForm.control}
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
                
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={artworkForm.control}
                    name="medium"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Medium</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Oil on canvas" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={artworkForm.control}
                    name="dimensions"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dimensions</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="24&quot; × 30&quot;" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={artworkForm.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price ($)</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            type="number" 
                            placeholder="2500"
                            onChange={(e) => field.onChange(Number(e.target.value))}
                            value={field.value || ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={artworkForm.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="oil">Oil</SelectItem>
                            <SelectItem value="acrylic">Acrylic</SelectItem>
                            <SelectItem value="mixed">Mixed Media</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={artworkForm.control}
                    name="size"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Size</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="small">Small</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="large">Large</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={artworkForm.control}
                    name="availability"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Availability</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="available">Available</SelectItem>
                            <SelectItem value="sold">Sold</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={artworkForm.control}
                  name="saatchiUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Saatchi Art URL (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="https://saatchiart.com/..." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="space-y-6">
                  <FormLabel className="text-lg font-semibold">Artwork Images</FormLabel>
                  
                  {/* Main Image */}
                  <FormField
                    control={artworkForm.control}
                    name="images"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Main Image *</FormLabel>
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <Input 
                              value={field.value?.[0] || ''} 
                              onChange={(e) => {
                                const newImages = [...(field.value || [''])];
                                newImages[0] = e.target.value;
                                field.onChange(newImages);
                              }}
                              placeholder="https://example.com/image1.jpg"
                              className="flex-1"
                            />
                            <div className="relative">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handleImageUpload(file, 0);
                                  }
                                }}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                disabled={uploadingImages[0]}
                              />
                              <Button 
                                type="button" 
                                variant="outline" 
                                disabled={uploadingImages[0]}
                                className="w-[120px]"
                              >
                                {uploadingImages[0] ? (
                                  <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    <span>Uploading...</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <Upload className="w-4 h-4" />
                                    <span>Upload</span>
                                  </div>
                                )}
                              </Button>
                            </div>
                          </div>
                          {field.value?.[0] && (
                            <div className="relative">
                              <img 
                                src={field.value[0]} 
                                alt="Preview" 
                                className="w-24 h-24 object-cover rounded border"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                className="absolute -top-2 -right-2 w-6 h-6 rounded-full p-0"
                                onClick={() => {
                                  const newImages = [...(field.value || [])];
                                  newImages[0] = '';
                                  field.onChange(newImages.filter(img => img !== ''));
                                }}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Additional Image 1 */}
                  <FormField
                    control={artworkForm.control}
                    name="images"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Additional Image (optional)</FormLabel>
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <Input 
                              value={field.value?.[1] || ''} 
                              onChange={(e) => {
                                const newImages = [...(field.value || ['', ''])];
                                newImages[1] = e.target.value;
                                field.onChange(newImages.filter(img => img !== ''));
                              }}
                              placeholder="https://example.com/image2.jpg"
                              className="flex-1"
                            />
                            <div className="relative">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handleImageUpload(file, 1);
                                  }
                                }}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                disabled={uploadingImages[1]}
                              />
                              <Button 
                                type="button" 
                                variant="outline" 
                                disabled={uploadingImages[1]}
                                className="w-[120px]"
                              >
                                {uploadingImages[1] ? (
                                  <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    <span>Uploading...</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <Upload className="w-4 h-4" />
                                    <span>Upload</span>
                                  </div>
                                )}
                              </Button>
                            </div>
                          </div>
                          {field.value?.[1] && (
                            <div className="relative">
                              <img 
                                src={field.value[1]} 
                                alt="Preview" 
                                className="w-24 h-24 object-cover rounded border"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                className="absolute -top-2 -right-2 w-6 h-6 rounded-full p-0"
                                onClick={() => {
                                  const newImages = [...(field.value || [])];
                                  newImages[1] = '';
                                  field.onChange(newImages.filter(img => img !== ''));
                                }}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Additional Image 2 */}
                  <FormField
                    control={artworkForm.control}
                    name="images"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Third Image (optional)</FormLabel>
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <Input 
                              value={field.value?.[2] || ''} 
                              onChange={(e) => {
                                const newImages = [...(field.value || ['', '', ''])];
                                newImages[2] = e.target.value;
                                field.onChange(newImages.filter(img => img !== ''));
                              }}
                              placeholder="https://example.com/image3.jpg"
                              className="flex-1"
                            />
                            <div className="relative">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handleImageUpload(file, 2);
                                  }
                                }}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                disabled={uploadingImages[2]}
                              />
                              <Button 
                                type="button" 
                                variant="outline" 
                                disabled={uploadingImages[2]}
                                className="w-[120px]"
                              >
                                {uploadingImages[2] ? (
                                  <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    <span>Uploading...</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <Upload className="w-4 h-4" />
                                    <span>Upload</span>
                                  </div>
                                )}
                              </Button>
                            </div>
                          </div>
                          {field.value?.[2] && (
                            <div className="relative">
                              <img 
                                src={field.value[2]} 
                                alt="Preview" 
                                className="w-24 h-24 object-cover rounded border"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                className="absolute -top-2 -right-2 w-6 h-6 rounded-full p-0"
                                onClick={() => {
                                  const newImages = [...(field.value || [])];
                                  newImages[2] = '';
                                  field.onChange(newImages.filter(img => img !== ''));
                                }}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="text-sm text-soft-gray">
                    <p>• You can either enter image URLs or upload files from your computer</p>
                    <p>• Supported formats: JPG, PNG, GIF, WebP</p>
                    <p>• Maximum file size: 5MB per image</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <FormField
                    control={artworkForm.control}
                    name="featured"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value || false}
                            onChange={field.onChange}
                            className="h-4 w-4 text-deep-blue"
                          />
                        </FormControl>
                        <FormLabel className="text-sm font-normal">
                          Featured artwork (show on homepage)
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setArtworkDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-deep-blue hover:bg-deep-blue/90">
                    {editingArtwork ? 'Update' : 'Create'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Exhibition Dialog */}
        <Dialog open={exhibitionDialogOpen} onOpenChange={setExhibitionDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-playfair text-xl text-deep-blue">
                {editingExhibition ? 'Edit Exhibition' : 'Add New Exhibition'}
              </DialogTitle>
            </DialogHeader>
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
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="solo">Solo</SelectItem>
                            <SelectItem value="group">Group</SelectItem>
                          </SelectContent>
                        </Select>
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
                
                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setExhibitionDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-deep-blue hover:bg-deep-blue/90">
                    {editingExhibition ? 'Update' : 'Create'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
