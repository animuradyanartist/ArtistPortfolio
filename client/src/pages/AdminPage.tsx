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
import { Plus, Edit, Trash, Eye, EyeOff } from "lucide-react";

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState<'homepage' | 'artworks' | 'exhibitions'>('homepage');
  const [artworkDialogOpen, setArtworkDialogOpen] = useState(false);
  const [exhibitionDialogOpen, setExhibitionDialogOpen] = useState(false);
  const [editingArtwork, setEditingArtwork] = useState<Artwork | null>(null);
  const [editingExhibition, setEditingExhibition] = useState<Exhibition | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      artworkForm.reset(artwork);
    } else {
      setEditingArtwork(null);
      artworkForm.reset();
    }
    setArtworkDialogOpen(true);
  };

  const openExhibitionDialog = (exhibition?: Exhibition) => {
    if (exhibition) {
      setEditingExhibition(exhibition);
      exhibitionForm.reset(exhibition);
    } else {
      setEditingExhibition(null);
      exhibitionForm.reset();
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
            <p className="text-xs text-soft-gray text-center mt-4">
              Demo password: artist123
            </p>
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
                        <FormLabel>Price</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" />
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
