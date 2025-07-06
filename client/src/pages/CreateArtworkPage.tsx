import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertArtworkSchema } from "@shared/schema";
import { Upload, X, ArrowLeft, Plus, Trash2, Calculator } from "lucide-react";

interface PrintSize {
  width: number;
  height: number;
  material: "paper" | "canvas";
  priceOverride?: number;
}

export default function CreateArtworkPage() {
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
      availableForPrint: false,
      preferredPrintMaterial: "paper",
    },
  });

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      // Create a canvas to compress the image if it's too large
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions (max 1920x1080 for web optimization)
        const maxWidth = 1920;
        const maxHeight = 1080;
        let { width, height } = img;
        
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw and compress
        ctx?.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(compressedDataUrl);
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      
      // Fallback to FileReader for very small files or if canvas fails
      const reader = new FileReader();
      reader.onload = () => {
        if (file.size < 100000) { // If less than 100KB, use original
          resolve(reader.result as string);
        } else {
          img.src = reader.result as string;
        }
      };
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (file: File, imageIndex: number) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select an image smaller than 10MB",
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
      
      // Validate base64 string
      if (!base64 || !base64.startsWith('data:image/')) {
        throw new Error('Invalid image format');
      }

      const currentImages = artworkForm.getValues('images') || [];
      const newImages = [...currentImages];
      
      // Ensure we have enough slots
      while (newImages.length <= imageIndex) {
        newImages.push('');
      }
      
      newImages[imageIndex] = base64;
      
      // Only keep non-empty images
      const filteredImages = newImages.filter(img => img && img.trim() !== '');
      artworkForm.setValue('images', filteredImages);
      
      toast({
        title: "Image uploaded successfully",
        description: `Image ${imageIndex + 1} has been added to your artwork`,
      });
    } catch (error) {
      console.error('Image upload error:', error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload image. Please try again.",
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

  const createArtworkMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/artworks", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
      toast({
        title: "Artwork created successfully",
        description: "Your artwork has been added to the collection",
      });
      setLocation("/admin");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create artwork",
        description: error.message || "An error occurred while creating the artwork",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: any) => {
    // Add print size data to the submission
    const submissionData = {
      ...data,
      availableForPrint,
      printSizes: availableForPrint ? JSON.stringify(printSizes) : null,
    };
    createArtworkMutation.mutate(submissionData);
  };

  return (
    <div className="min-h-screen py-20 bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Button
            variant="outline"
            onClick={() => setLocation("/admin")}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Admin
          </Button>
          <h1 className="font-playfair text-3xl font-semibold text-deep-blue">
            Create New Artwork
          </h1>
          <p className="text-soft-gray mt-2">
            Add a new piece to your collection
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
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="oil">Oil Painting</SelectItem>
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
                                  const newImages = [...(field.value || ['', '', ''])];
                                  newImages[imageIndex] = e.target.value;
                                  field.onChange(newImages.filter(img => img !== ''));
                                }}
                                placeholder={`https://example.com/image${imageIndex + 1}.jpg`}
                                className="flex-1"
                              />
                              <div className="relative">
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      handleImageUpload(file, imageIndex);
                                    }
                                  }}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  disabled={uploadingImages[imageIndex]}
                                />
                                <Button 
                                  type="button" 
                                  variant="outline" 
                                  disabled={uploadingImages[imageIndex]}
                                  className="w-[120px]"
                                >
                                  {uploadingImages[imageIndex] ? (
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
                            {field.value?.[imageIndex] && (
                              <div className="relative">
                                <img 
                                  src={field.value[imageIndex]} 
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
                                    newImages[imageIndex] = '';
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
                  ))}
                  
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
                
                <div className="flex justify-end space-x-2 pt-6">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setLocation("/admin")}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    className="bg-deep-blue hover:bg-deep-blue/90"
                    disabled={createArtworkMutation.isPending}
                  >
                    {createArtworkMutation.isPending ? "Creating..." : "Create Artwork"}
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