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
import { Upload, X, ArrowLeft, Loader2, Plus, Trash2, Calculator } from "lucide-react";

interface PrintSize {
  width: number;
  height: number;
  material: "paper" | "canvas";
  priceOverride?: number;
}

export default function EditArtworkPage() {
  const params = useParams();
  const artworkId = parseInt(params.id as string);
  const [, setLocation] = useLocation();
  

  const [uploadingImages, setUploadingImages] = useState<boolean[]>([false, false, false]);
  const [printSizes, setPrintSizes] = useState<PrintSize[]>([]);
  const [availableForPrint, setAvailableForPrint] = useState(false);
  const [calcWidth, setCalcWidth] = useState(30);
  const [calcHeight, setCalcHeight] = useState(40);
  const [calcMaterial, setCalcMaterial] = useState<"paper" | "canvas">("paper");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Print size management functions
  const addPrintSize = () => {
    setPrintSizes([...printSizes, { width: 30, height: 40, material: "paper" }]);
  };

  const removePrintSize = (index: number) => {
    setPrintSizes(printSizes.filter((_, i) => i !== index));
  };

  const updatePrintSize = (index: number, field: keyof PrintSize, value: any) => {
    const updated = [...printSizes];
    updated[index] = { ...updated[index], [field]: value };
    setPrintSizes(updated);
  };

  const calculatePrice = (width: number, height: number, material: "paper" | "canvas") => {
    const rate = material === "canvas" ? 0.015 : 0.013;
    return (width * height * rate).toFixed(2);
  };

  // Fetch existing artwork data (raw=1 returns the stored base64 originals
  // instead of the lightweight /img URLs the public site uses)
  const { data: artwork, isLoading, error } = useQuery<Artwork>({
    queryKey: [`/api/artworks/${artworkId}?raw=1`],
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
      seoSlug: "",
      featured: false,
      availableForPrint: false,
      preferredPrintMaterial: "paper",
    },
  });

  // Update form and print data when artwork data is loaded
  useEffect(() => {
    if (artwork) {
      console.log('Loading artwork data:', artwork);
      console.log('Artwork images:', artwork.images);

      const formData = {
        title: artwork.title || "",
        description: artwork.description || "",
        medium: artwork.medium || "",
        dimensions: artwork.dimensions || "",
        year: artwork.year || new Date().getFullYear(),
        price: artwork.price || 0,
        images: artwork.images && artwork.images.length > 0 ? artwork.images : ["", "", ""],
        type: artwork.type || "oil",
        size: artwork.size || "medium",
        availability: artwork.availability || "available",
        saatchiUrl: artwork.saatchiUrl || "",
        buyLink: artwork.buyLink || "",
        seoSlug: artwork.seoSlug || "",
        featured: artwork.featured || false,
        availableForPrint: artwork.availableForPrint || false,
        preferredPrintMaterial: artwork.preferredPrintMaterial || "paper",
      };
      
      console.log('Form data being set:', formData);
      console.log('Form images array:', formData.images);
      
      // Set print data
      setAvailableForPrint(artwork.availableForPrint || false);
      if (artwork.printSizes) {
        try {
          const parsedSizes = JSON.parse(artwork.printSizes);
          setPrintSizes(parsedSizes);
        } catch (error) {
          console.error('Error parsing print sizes:', error);
          setPrintSizes([]);
        }
      } else {
        setPrintSizes([]);
      }
      

      artworkForm.reset(formData);
    }
  }, [artwork, artworkForm]);

  const updateArtworkMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("PUT", `/api/artworks/${artworkId}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Artwork updated successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/artworks'] });
      queryClient.invalidateQueries({ queryKey: [`/api/artworks/${artworkId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/artworks/${artworkId}?raw=1`] });
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
      availableForPrint,
      printSizes: availableForPrint ? JSON.stringify(printSizes) : null,
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
                  name="seoSlug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SEO Page URL (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="abstract-portrait-oil-painting" />
                      </FormControl>
                      <p className="text-xs text-gray-500 mt-1">
                        Creates a dedicated SEO page at <span className="font-mono">animuradyan.com/{field.value || 'your-slug-here'}</span>. 
                        Use keyword-rich, hyphenated lowercase words (e.g. <span className="font-mono">abstract-female-portrait</span>).
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
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
                
                {/* Print Options Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-charcoal">Print Options</h3>
                  
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={availableForPrint}
                      onChange={(e) => setAvailableForPrint(e.target.checked)}
                      className="rounded"
                    />
                    <label className="text-sm font-normal">
                      Available as Print?
                    </label>
                  </div>
                  
                  {availableForPrint && (
                    <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">Print Sizes</h4>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addPrintSize}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Size
                        </Button>
                      </div>
                      
                      {printSizes.map((size, index) => (
                        <div key={index} className="grid grid-cols-5 gap-3 p-3 border rounded bg-white">
                          <div>
                            <label className="text-xs font-medium text-gray-500">Width (cm)</label>
                            <Input
                              type="number"
                              min="20"
                              max="120"
                              value={size.width}
                              onChange={(e) => updatePrintSize(index, 'width', Number(e.target.value))}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-500">Height (cm)</label>
                            <Input
                              type="number"
                              min="20"
                              max="120"
                              value={size.height}
                              onChange={(e) => updatePrintSize(index, 'height', Number(e.target.value))}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-500">Material</label>
                            <Select
                              value={size.material}
                              onValueChange={(value) => updatePrintSize(index, 'material', value)}
                            >
                              <SelectTrigger className="mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="paper">Paper</SelectItem>
                                <SelectItem value="canvas">Canvas</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-500">Price Override (€)</label>
                            <Input
                              type="number"
                              step="0.01"
                              value={size.priceOverride || ''}
                              onChange={(e) => updatePrintSize(index, 'priceOverride', e.target.value ? Number(e.target.value) : undefined)}
                              placeholder={`€${calculatePrice(size.width, size.height, size.material)}`}
                              className="mt-1"
                            />
                          </div>
                          <div className="flex items-end">
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => removePrintSize(index)}
                              className="w-full"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      
                      {printSizes.length === 0 && (
                        <p className="text-sm text-gray-500 text-center py-4">
                          No print sizes added yet. Click "Add Size" to create your first print option.
                        </p>
                      )}
                    </div>
                  )}
                  
                  {/* Mini Calculator */}
                  <div className="space-y-3 p-4 border rounded-lg bg-blue-50">
                    <h4 className="font-medium flex items-center">
                      <Calculator className="w-4 h-4 mr-2" />
                      Price Calculator
                    </h4>
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-500">Width (cm)</label>
                        <Input
                          type="number"
                          min="20"
                          max="120"
                          value={calcWidth}
                          onChange={(e) => setCalcWidth(Number(e.target.value))}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500">Height (cm)</label>
                        <Input
                          type="number"
                          min="20"
                          max="120"
                          value={calcHeight}
                          onChange={(e) => setCalcHeight(Number(e.target.value))}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500">Material</label>
                        <Select value={calcMaterial} onValueChange={(value: "paper" | "canvas") => setCalcMaterial(value)}>
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="paper">Paper</SelectItem>
                            <SelectItem value="canvas">Canvas</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500">Calculated Price</label>
                        <div className="mt-1 px-3 py-2 bg-white border rounded-md font-medium">
                          €{calculatePrice(calcWidth, calcHeight, calcMaterial)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
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
                            
                            {(() => {
                              const imageValue = field.value?.[imageIndex];
                              console.log(`Image ${imageIndex} value:`, imageValue);
                              console.log(`Field value array:`, field.value);
                              return imageValue && imageValue.trim() !== "" ? (
                                <div className="w-32 h-32 border rounded-lg overflow-hidden bg-gray-50">
                                  <img
                                    src={imageValue}
                                    alt={`Preview ${imageIndex + 1}`}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      console.error('Image preview failed:', imageValue);
                                      e.currentTarget.style.display = 'none';
                                    }}
                                    onLoad={() => {
                                      console.log(`Image ${imageIndex} loaded successfully:`, imageValue);
                                    }}
                                  />
                                </div>
                              ) : null;
                            })()}
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