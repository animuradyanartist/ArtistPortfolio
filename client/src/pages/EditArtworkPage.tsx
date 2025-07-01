import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertArtworkSchema, type Artwork } from "@shared/schema";
import { Upload, X, ArrowLeft, Loader2 } from "lucide-react";

export default function EditArtworkPage() {
  const params = useParams();
  const artworkId = parseInt(params.id as string);
  const [, setLocation] = useLocation();
  
  console.log('EditArtworkPage rendered with params:', params);
  console.log('Artwork ID:', artworkId);
  const [uploadingImages, setUploadingImages] = useState<boolean[]>([false, false, false]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch existing artwork data
  const { data: artwork, isLoading, error } = useQuery<Artwork>({
    queryKey: ['/api/artworks', artworkId],
    enabled: !!artworkId && !isNaN(artworkId)
  });

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
      saatchiUrl: "",
      buyLink: "",
      featured: false,
    },
  });

  // Update form when artwork data is loaded
  useEffect(() => {
    if (artwork) {
      artworkForm.reset({
        title: artwork.title,
        description: artwork.description,
        medium: artwork.medium,
        dimensions: artwork.dimensions,
        year: artwork.year,
        price: artwork.price,
        images: artwork.images.length > 0 ? artwork.images : [""],
        type: artwork.type,
        size: artwork.size,
        availability: artwork.availability,
        saatchiUrl: artwork.saatchiUrl || "",
        buyLink: artwork.buyLink || "",
        featured: artwork.featured || false,
      });
    }
  }, [artwork, artworkForm]);

  const updateArtworkMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PUT", `/api/artworks/${artworkId}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Artwork updated successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/artworks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/artworks', artworkId] });
      setLocation("/admin");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update artwork",
        variant: "destructive",
      });
    },
  });

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleImageUpload = async (file: File, imageIndex: number) => {
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Error",
        description: "Please select a valid image file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "Image file size must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    try {
      setUploadingImages(prev => {
        const newState = [...prev];
        newState[imageIndex] = true;
        return newState;
      });

      const base64 = await convertFileToBase64(file);
      
      const currentImages = artworkForm.getValues("images") || [];
      const newImages = [...currentImages];
      
      // Ensure we have enough slots
      while (newImages.length <= imageIndex) {
        newImages.push("");
      }
      
      newImages[imageIndex] = base64;
      artworkForm.setValue("images", newImages);

      toast({
        title: "Success",
        description: "Image uploaded successfully!",
      });
    } catch (error) {
      console.error('Image upload error:', error);
      toast({
        title: "Error",
        description: "Failed to upload image",
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

  const removeImage = (imageIndex: number) => {
    const currentImages = artworkForm.getValues("images") || [];
    const newImages = [...currentImages];
    newImages[imageIndex] = "";
    artworkForm.setValue("images", newImages);
  };

  const handleSubmit = (data: any) => {
    // Filter out empty images
    const filteredImages = data.images.filter((img: string) => img.trim() !== "");
    
    if (filteredImages.length === 0) {
      toast({
        title: "Error",
        description: "At least one image is required",
        variant: "destructive",
      });
      return;
    }

    const submissionData = {
      ...data,
      images: filteredImages,
    };

    updateArtworkMutation.mutate(submissionData);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-soft-white flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading artwork...</span>
        </div>
      </div>
    );
  }

  if (error || !artwork) {
    return (
      <div className="min-h-screen bg-soft-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-charcoal mb-4">Artwork Not Found</h1>
          <Button onClick={() => setLocation("/admin")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Admin
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-soft-white py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation("/admin")}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Admin
          </Button>
          <h1 className="text-3xl font-playfair text-deep-blue mb-2">
            Edit Artwork
          </h1>
          <p className="text-charcoal">
            Update the details for "{artwork.title}"
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-playfair text-xl text-deep-blue">
              Artwork Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...artworkForm}>
              <form onSubmit={artworkForm.handleSubmit(handleSubmit)} className="space-y-6">
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
                          <Input 
                            {...field} 
                            type="number" 
                            onChange={(e) => field.onChange(Number(e.target.value))}
                            value={field.value || ''}
                          />
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
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="oil">Oil Painting</SelectItem>
                            <SelectItem value="watercolor">Watercolor</SelectItem>
                            <SelectItem value="acrylic">Acrylic</SelectItem>
                            <SelectItem value="mixed">Mixed Media</SelectItem>
                            <SelectItem value="digital">Digital Art</SelectItem>
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
                        <Select onValueChange={field.onChange} value={field.value}>
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
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="available">Available</SelectItem>
                            <SelectItem value="sold">Sold</SelectItem>
                            <SelectItem value="reserved">Reserved</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
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
                  
                  <FormField
                    control={artworkForm.control}
                    name="buyLink"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Buy Link (optional)</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="https://store.example.com/..." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={artworkForm.control}
                  name="featured"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>
                          Featured Artwork
                        </FormLabel>
                        <p className="text-sm text-muted-foreground">
                          Display this artwork prominently on the homepage
                        </p>
                      </div>
                    </FormItem>
                  )}
                />
                
                {/* Images Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-charcoal">Artwork Images</h3>
                  
                  {[0, 1, 2].map((imageIndex) => (
                    <FormField
                      key={imageIndex}
                      control={artworkForm.control}
                      name="images"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {imageIndex === 0 ? "Main Image" : `Additional Image ${imageIndex}`}
                            {imageIndex === 0 && " (required)"}
                          </FormLabel>
                          <div className="space-y-3">
                            <div className="flex gap-2">
                              <Input 
                                value={field.value?.[imageIndex] || ''}
                                onChange={(e) => {
                                  const newImages = [...(field.value || [])];
                                  while (newImages.length <= imageIndex) {
                                    newImages.push("");
                                  }
                                  newImages[imageIndex] = e.target.value;
                                  field.onChange(newImages);
                                }}
                                placeholder="Paste image URL or upload file below"
                                className="flex-1"
                              />
                              {field.value?.[imageIndex] && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => removeImage(imageIndex)}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-4">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handleImageUpload(file, imageIndex);
                                  }
                                }}
                                className="hidden"
                                id={`image-upload-${imageIndex}`}
                              />
                              <label htmlFor={`image-upload-${imageIndex}`}>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={uploadingImages[imageIndex]}
                                  asChild
                                >
                                  <span className="cursor-pointer">
                                    {uploadingImages[imageIndex] ? (
                                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    ) : (
                                      <Upload className="w-4 h-4 mr-2" />
                                    )}
                                    Upload Image
                                  </span>
                                </Button>
                              </label>
                            </div>
                            
                            {field.value?.[imageIndex] && (
                              <div className="w-32 h-32 border rounded-lg overflow-hidden bg-gray-50">
                                <img
                                  src={field.value[imageIndex]}
                                  alt={`Preview ${imageIndex + 1}`}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    console.error('Image preview failed:', field.value?.[imageIndex]);
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              </div>
                            )}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
                
                <div className="flex justify-end space-x-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setLocation("/admin")}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={updateArtworkMutation.isPending}
                    className="bg-deep-blue hover:bg-deep-blue/90"
                  >
                    {updateArtworkMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      "Update Artwork"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}