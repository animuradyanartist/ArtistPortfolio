import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertPrintSchema, type Artwork } from "@shared/schema";
import { Upload, X, ArrowLeft, Loader2, Plus, Trash2, Calculator } from "lucide-react";

interface PrintSize {
  width: number;
  height: number;
  material: "paper" | "canvas";
  priceOverride?: number;
}

export default function CreatePrintPage() {
  const [, setLocation] = useLocation();
  const [uploadingImages, setUploadingImages] = useState<boolean[]>([false, false, false]);
  const [printSizes, setPrintSizes] = useState<PrintSize[]>([]);
  const [calcWidth, setCalcWidth] = useState(30);
  const [calcHeight, setCalcHeight] = useState(40);
  const [calcMaterial, setCalcMaterial] = useState<"paper" | "canvas">("paper");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch artworks for optional reference selection
  const { data: artworks = [] } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks"],
  });

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

  const printForm = useForm({
    resolver: zodResolver(insertPrintSchema),
    defaultValues: {
      title: "",
      description: "",
      images: [""],
      artworkId: undefined,
      availableSizes: "",
      preferredMaterial: "paper",
      status: "active",
      featured: false,
      position: 0,
    },
  });

  const createPrintMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("/api/prints", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Print edition created successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/prints"] });
      setLocation("/admin");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create print edition",
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
      
      const currentImages = printForm.getValues("images") || [];
      const newImages = [...currentImages];
      
      // Ensure we have enough slots
      while (newImages.length <= imageIndex) {
        newImages.push("");
      }
      
      newImages[imageIndex] = base64;
      printForm.setValue("images", newImages);

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
    const currentImages = printForm.getValues("images") || [];
    const newImages = [...currentImages];
    newImages[imageIndex] = "";
    printForm.setValue("images", newImages);
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

    if (printSizes.length === 0) {
      toast({
        title: "Error",
        description: "At least one print size is required",
        variant: "destructive",
      });
      return;
    }

    const submissionData = {
      ...data,
      images: filteredImages,
      availableSizes: JSON.stringify(printSizes),
    };

    createPrintMutation.mutate(submissionData);
  };

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
            Create Print Edition
          </h1>
          <p className="text-charcoal">
            Create a new print edition with independent images, sizes, and pricing
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-playfair text-xl text-deep-blue">
              Print Edition Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...printForm}>
              <form onSubmit={printForm.handleSubmit(handleSubmit)} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={printForm.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Print Title</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Limited Edition Print - Artwork Name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={printForm.control}
                    name="preferredMaterial"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preferred Material</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="paper">Paper</SelectItem>
                            <SelectItem value="canvas">Canvas</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={printForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} placeholder="Describe this print edition..." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={printForm.control}
                    name="artworkId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reference Artwork (Optional)</FormLabel>
                        <Select onValueChange={(value) => field.onChange(value ? parseInt(value) : undefined)} value={field.value?.toString() || ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select original artwork (optional)" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="">No reference artwork</SelectItem>
                            {artworks.map((artwork) => (
                              <SelectItem key={artwork.id} value={artwork.id.toString()}>
                                {artwork.title} ({artwork.year})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={printForm.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="discontinued">Discontinued</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={printForm.control}
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
                          Featured Print Edition
                        </FormLabel>
                        <p className="text-sm text-muted-foreground">
                          Display this print edition prominently
                        </p>
                      </div>
                    </FormItem>
                  )}
                />
                
                {/* Print Sizes Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-charcoal">Available Sizes</h3>
                    <Button type="button" onClick={addPrintSize} variant="outline" size="sm">
                      <Plus className="w-4 h-4 mr-1" />
                      Add Size
                    </Button>
                  </div>
                  
                  <div className="space-y-3">
                    {printSizes.map((size, index) => (
                      <div key={index} className="grid grid-cols-5 gap-3 items-end p-3 border rounded-lg bg-gray-50">
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
                  <h3 className="text-lg font-semibold text-charcoal">Print Images</h3>
                  
                  {[0, 1, 2].map((imageIndex) => (
                    <FormField
                      key={imageIndex}
                      control={printForm.control}
                      name="images"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {imageIndex === 0 ? "Main Print Image" : `Additional Print Image ${imageIndex}`}
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
                    disabled={createPrintMutation.isPending}
                    className="bg-deep-blue hover:bg-deep-blue/90"
                  >
                    {createPrintMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Creating...
                      </>
                    ) : (
                      "Create Print Edition"
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