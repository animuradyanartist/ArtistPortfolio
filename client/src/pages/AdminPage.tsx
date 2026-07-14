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
import { useAdmin } from "@/hooks/useAdmin";
import { apiRequest } from "@/lib/queryClient";
import { insertHomepageSettingsSchema, insertArtistBioSchema, insertExhibitionSchema, insertContactSettingsSchema, insertGalleryPhotoSchema } from "@shared/schema";
import type { Artwork, Print, Exhibition, HomepageSettings, ArtistBio, ContactSettings, GalleryPhoto, Collector, Message } from "@shared/schema";
import { Plus, Edit, Trash, Eye, EyeOff, Upload, ChevronUp, ChevronDown, RefreshCw } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

// Editable painting slots on the storytelling "/path" page. Each stores an
// artwork id; empty = the page auto-picks a fitting painting.
const PATH_IMAGE_SLOTS = [
  { key: "heroArtworkId", label: "Hero painting", hint: "Large painting in the intro" },
  { key: "chapterOneArtworkId", label: "Chapter One — main", hint: "The Weight Within · dark figure" },
  { key: "chapterOneDetailArtworkId", label: "Chapter One — detail", hint: "Small companion image" },
  { key: "chapterTwoArtworkId", label: "Chapter Two — main", hint: "Toward My Own Language · wide landscape" },
  { key: "chapterTwoDetailArtworkId", label: "Chapter Two — detail", hint: "Small companion image" },
  { key: "chapterThreeArtworkId", label: "Chapter Three — main", hint: "Returning Changed · current work" },
] as const;

export default function AdminPage() {
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState<'homepage' | 'path' | 'artworks' | 'prints' | 'exhibitions' | 'gallery' | 'artist' | 'contact' | 'collectors' | 'messages'>('homepage');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  const { isAuthenticated, isLoading, login, logout } = useAdmin();
  
  // Drag and drop state
  const [draggedArtwork, setDraggedArtwork] = useState<number | null>(null);
  const [dragOverArtwork, setDragOverArtwork] = useState<number | null>(null);

  // "Where the work lives" homepage section — admin-managed list of {image, caption}
  const [roomItems, setRoomItems] = useState<{ image: string; caption: string }[]>([]);

  // Exhibition editing state
  const [editingExhibitionId, setEditingExhibitionId] = useState<number | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleAuthError = (error: Error, fallbackMessage: string) => {
    if (error.message.startsWith("401")) {
      logout();
      toast({ title: "Session expired. Please log in again.", variant: "destructive" });
    } else {
      toast({ title: fallbackMessage, variant: "destructive" });
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    
    try {
      const success = await login(password);
      if (success) {
        toast({
          title: "Login successful",
          description: "Welcome to the admin panel",
        });
        setPassword("");
      } else {
        toast({
          title: "Invalid password",
          description: "Please try again",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Login failed",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast({
        title: "Logged out successfully",
        description: "You have been logged out",
      });
    } catch (error) {
      toast({
        title: "Logout failed",
        description: "There was an error logging out",
        variant: "destructive",
      });
    }
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

  const { data: pathSettings } = useQuery<Record<string, string | null>>({
    queryKey: ["/api/path-settings"],
    enabled: isAuthenticated,
  });
  const [pathForm, setPathForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (pathSettings) {
      setPathForm(
        PATH_IMAGE_SLOTS.reduce((acc, s) => {
          acc[s.key] = (pathSettings[s.key] as string) || "";
          return acc;
        }, {} as Record<string, string>)
      );
    }
  }, [pathSettings]);

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

  const { data: contactSettings, isLoading: contactLoading } = useQuery<ContactSettings>({
    queryKey: ["/api/contact-settings"],
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const { data: collectors = [], isLoading: collectorsLoading } = useQuery<Collector[]>({
    queryKey: ["/api/collectors"],
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/messages"],
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });

  const { data: galleryPhotos = [], isLoading: galleryPhotosLoading } = useQuery<GalleryPhoto[]>({
    queryKey: ["/api/gallery-photos"],
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

  const editExhibitionForm = useForm({
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

  const contactForm = useForm({
    resolver: zodResolver(insertContactSettingsSchema),
    defaultValues: contactSettings || {
      instagramUrl: "",
      saatchiUrl: "",
      email: "",
      location: "",
      instagramHandle: ""
    },
  });

  const [galleryPhotoImage, setGalleryPhotoImage] = useState("");
  const galleryPhotoForm = useForm({
    resolver: zodResolver(insertGalleryPhotoSchema),
    defaultValues: {
      title: "",
      image: "",
      exhibitionName: "",
      location: "",
      year: undefined,
      featured: false,
      position: 0,
    },
  });

  // Update forms when data loads
  useEffect(() => {
    if (homepageSettings) {
      homepageForm.reset(homepageSettings);
      try {
        const parsed = JSON.parse((homepageSettings as any).roomItems || "[]");
        setRoomItems(
          Array.isArray(parsed)
            ? parsed
                .filter((x: any) => x && typeof x.image === "string")
                .map((x: any) => ({ image: x.image, caption: x.caption || "" }))
            : []
        );
      } catch {
        setRoomItems([]);
      }
    }
  }, [homepageSettings, homepageForm]);

  useEffect(() => {
    if (artistBio) {
      artistForm.reset(artistBio);
    }
  }, [artistBio, artistForm]);

  useEffect(() => {
    if (contactSettings) {
      contactForm.reset(contactSettings);
    }
  }, [contactSettings, contactForm]);

  useEffect(() => {
    if (editingExhibitionId !== null) {
      const ex = exhibitions.find((e) => e.id === editingExhibitionId);
      if (ex) {
        editExhibitionForm.reset({
          title: ex.title,
          type: ex.type,
          venue: ex.venue,
          location: ex.location,
          year: ex.year,
          startDate: ex.startDate || "",
          endDate: ex.endDate || "",
          description: ex.description || "",
          image: ex.image || "",
        });
      }
    }
  }, [editingExhibitionId, exhibitions]);

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

  const updatePathMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("PUT", "/api/path-settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/path-settings"] });
      toast({ title: "The Path updated", description: "Chapter paintings saved." });
    },
    onError: () => {
      toast({ title: "Failed to update The Path", variant: "destructive" });
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

  const updateContactMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("PUT", "/api/contact-settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contact-settings"] });
      toast({ title: "Contact settings updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update contact settings", variant: "destructive" });
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
    onSuccess: (_data, id) => {
      queryClient.setQueryData(["/api/artworks"], (old: any[]) =>
        Array.isArray(old) ? old.filter((a) => a.id !== id) : old
      );
      toast({ title: "Artwork deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
    },
    onError: (error: Error) => handleAuthError(error, "Failed to delete artwork"),
  });

  // Singulart sync — POSTs to /api/admin/sync-singulart and refetches /api/artworks.
  const syncSingulartMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/sync-singulart");
      return res.json() as Promise<{
        scrapedCount: number;
        inserted: number;
        updated: number;
        error: string | null;
      }>;
    },
    onSuccess: (result) => {
      if (result.error) {
        toast({
          title: "Singulart sync failed",
          description: result.error,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Singulart sync complete",
        description: `${result.scrapedCount} scraped • ${result.inserted} added • ${result.updated} updated`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/artworks"] });
    },
    onError: (error: Error) => handleAuthError(error, "Singulart sync failed"),
  });

  const deletePrintMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/prints/${id}`),
    onSuccess: (_data, id) => {
      queryClient.setQueryData(["/api/prints"], (old: any[]) =>
        Array.isArray(old) ? old.filter((p) => p.id !== id) : old
      );
      toast({ title: "Print deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/prints"] });
    },
    onError: (error: Error) => handleAuthError(error, "Failed to delete print"),
  });

  const deleteExhibitionMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/exhibitions/${id}`),
    onSuccess: (_data, id) => {
      queryClient.setQueryData(["/api/exhibitions"], (old: any[]) =>
        Array.isArray(old) ? old.filter((e) => e.id !== id) : old
      );
      toast({ title: "Exhibition deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/exhibitions"] });
    },
    onError: (error: Error) => handleAuthError(error, "Failed to delete exhibition"),
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

  const updateExhibitionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/exhibitions/${id}`, data),
    onSuccess: (_data, { id }) => {
      queryClient.setQueryData(["/api/exhibitions"], (old: any[]) =>
        Array.isArray(old)
          ? old.map((e) => (e.id === id ? { ...e, ..._data } : e))
          : old
      );
      queryClient.invalidateQueries({ queryKey: ["/api/exhibitions"] });
      setEditingExhibitionId(null);
      toast({ title: "Exhibition updated successfully" });
    },
    onError: (error: Error) => handleAuthError(error, "Failed to update exhibition"),
  });

  const createGalleryPhotoMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", "/api/gallery-photos", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gallery-photos"] });
      galleryPhotoForm.reset();
      setGalleryPhotoImage("");
      toast({ title: "Gallery photo added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add gallery photo", variant: "destructive" });
    },
  });

  const deleteGalleryPhotoMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/gallery-photos/${id}`),
    onSuccess: (_data, id) => {
      queryClient.setQueryData(["/api/gallery-photos"], (old: any[]) =>
        Array.isArray(old) ? old.filter((p) => p.id !== id) : old
      );
      toast({ title: "Gallery photo deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/gallery-photos"] });
    },
    onError: (error: Error) => handleAuthError(error, "Failed to delete gallery photo"),
  });

  const toggleGalleryPhotoFeaturedMutation = useMutation({
    mutationFn: async ({ id, featured }: { id: number; featured: boolean }) =>
      apiRequest("PATCH", `/api/gallery-photos/${id}`, { featured }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gallery-photos"] });
      toast({ title: "Gallery photo updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update gallery photo", variant: "destructive" });
    },
  });

  const reorderGalleryPhotoMutation = useMutation({
    mutationFn: async ({ id, direction }: { id: number; direction: 'up' | 'down' }) =>
      apiRequest("POST", `/api/gallery-photos/${id}/reorder`, { direction }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gallery-photos"] });
    },
    onError: () => {
      toast({ title: "Failed to reorder gallery photo", variant: "destructive" });
    },
  });

  // Form handlers
  const handleHomepageSubmit = (data: any) => {
    // Persist the "Where the work lives" list as a JSON string, dropping any
    // rows without an image.
    const cleanedRoom = roomItems.filter((r) => r.image?.trim());
    updateHomepageMutation.mutate({ ...data, roomItems: JSON.stringify(cleanedRoom) });
  };

  const handleArtistSubmit = (data: any) => {
    updateArtistBioMutation.mutate(data);
  };

  const handleContactSubmit = (data: any) => {
    updateContactMutation.mutate(data);
  };

  const handleExhibitionSubmit = (data: any) => {
    createExhibitionMutation.mutate(data);
  };

  const handleGalleryPhotoSubmit = (data: any) => {
    createGalleryPhotoMutation.mutate({
      ...data,
      image: galleryPhotoImage,
    });
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Resize if image is too large (max 1920px on longest side)
          const maxDimension = 1920;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = (height * maxDimension) / width;
              width = maxDimension;
            } else {
              width = (width * maxDimension) / height;
              height = maxDimension;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          
          ctx.drawImage(img, 0, 0, width, height);
          
          // Try compressing at different quality levels until under 2.5MB
          const targetSizeMB = 2.5; // Leave headroom under 5MB limit
          let quality = 0.8;
          let compressedBase64 = canvas.toDataURL('image/jpeg', quality);
          let sizeInMB = (compressedBase64.length * 3) / 4 / (1024 * 1024);
          
          // Iteratively reduce quality if needed
          while (sizeInMB > targetSizeMB && quality > 0.3) {
            quality -= 0.1;
            compressedBase64 = canvas.toDataURL('image/jpeg', quality);
            sizeInMB = (compressedBase64.length * 3) / 4 / (1024 * 1024);
          }
          
          // If still too large after aggressive compression, reject
          if (sizeInMB > targetSizeMB) {
            reject(new Error(`Image is too large (${sizeInMB.toFixed(2)}MB). Please use a smaller image.`));
            return;
          }
          
          resolve(compressedBase64);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const handleGalleryPhotoImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedImage = await compressImage(file);
        setGalleryPhotoImage(compressedImage);
        galleryPhotoForm.setValue('image', compressedImage);
      } catch (error) {
        console.error('Error compressing image:', error);
        toast({ title: "Failed to process image", variant: "destructive" });
      }
    }
  };

  const handleReorderGalleryPhoto = (id: number, direction: 'up' | 'down') => {
    reorderGalleryPhotoMutation.mutate({ id, direction });
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
                  disabled={isLoggingIn || isLoading}
                  className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium rounded-xl transition-all duration-200"
                >
                  {isLoggingIn || isLoading ? "Signing In..." : "Sign In"}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isDevEnv = import.meta.env.DEV;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {isDevEnv ? (
        <div className="w-full bg-amber-400 text-amber-900 text-center py-2 px-4 font-semibold text-sm tracking-wide shadow-sm">
          ⚠ TEST ENVIRONMENT — Changes here do NOT affect the live animuradyan.com website
        </div>
      ) : (
        <div className="w-full bg-emerald-600 text-white text-center py-1.5 px-4 text-xs font-medium tracking-wide">
          ● PRODUCTION — animuradyan.com
        </div>
      )}
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
            {(['homepage', 'path', 'artworks', 'prints', 'exhibitions', 'gallery', 'artist', 'contact', 'collectors', 'messages'] as const).map((tab) => (
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
                {tab === 'artist' ? 'About Artist' : tab === 'path' ? 'The Path' : tab}
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
                  <p className="text-sm text-slate-600">The homepage quote and the About-section portrait image</p>
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
                    {/* Hero video note — the homepage hero is a looping video */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 w-8 h-8 shrink-0 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900">Hero video</h4>
                          <p className="text-sm text-slate-600 mt-1">
                            The homepage hero is a looping video (<code className="text-xs bg-white px-1 py-0.5 rounded border">hero-loop.mp4</code>)
                            with the artist's name over it. To replace it, drop a new
                            <code className="text-xs bg-white px-1 py-0.5 rounded border">hero-loop.mp4</code> (and a
                            <code className="text-xs bg-white px-1 py-0.5 rounded border">hero-poster.jpg</code> still frame)
                            into <code className="text-xs bg-white px-1 py-0.5 rounded border">client/public/</code> and republish.
                            An in-admin video uploader can be added if you'd like to swap it here.
                          </p>
                        </div>
                      </div>
                    </div>

                    <FormField
                      control={homepageForm.control}
                      name="heroQuote"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Homepage Quote</FormLabel>
                          <p className="text-sm text-slate-500 -mt-1 mb-2">
                            Shown in the quote band in the middle of the homepage.
                          </p>
                          <FormControl>
                            <Textarea {...field} rows={2} placeholder="I paint the dialogue between inner life and the world outside." />
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
                          <FormLabel>About / Portrait Image</FormLabel>
                          <p className="text-sm text-slate-500 -mt-1 mb-2">
                            Used as the portrait in the “About Ani” section (and as a fallback elsewhere).
                            The hero itself uses the looping video above.
                          </p>
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
                                  alt="About / portrait preview"
                                  className="w-32 h-20 object-cover rounded border"
                                />
                              </div>
                            )}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* "Where the work lives" section images */}
                    <div className="border-t border-slate-200 pt-6">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-base font-semibold text-slate-900">
                          “Where the work lives” images
                        </h4>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setRoomItems((prev) => [...prev, { image: "", caption: "" }])
                          }
                        >
                          Add image
                        </Button>
                      </div>
                      <p className="text-sm text-slate-500 mb-4">
                        Photos shown in the “Where the work lives” section of the homepage — e.g. your
                        paintings hanging in a room. Upload an image and add an optional caption. Leave
                        this empty to show the default paintings instead.
                      </p>

                      {roomItems.length === 0 ? (
                        <p className="text-sm text-slate-400 italic">
                          No images yet — the homepage shows the default paintings.
                        </p>
                      ) : (
                        <div className="space-y-4">
                          {roomItems.map((item, i) => (
                            <div
                              key={i}
                              className="flex gap-4 items-start rounded-xl border border-slate-200 p-4"
                            >
                              <div className="w-28 h-20 shrink-0 rounded border bg-slate-100 overflow-hidden flex items-center justify-center">
                                {item.image ? (
                                  <img
                                    src={item.image}
                                    alt={`Room image ${i + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <span className="text-xs text-slate-400">No image</span>
                                )}
                              </div>
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    id={`room-image-upload-${i}`}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file)
                                        handleImageUpload(file, (path) =>
                                          setRoomItems((prev) =>
                                            prev.map((r, idx) =>
                                              idx === i ? { ...r, image: path } : r
                                            )
                                          )
                                        );
                                    }}
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      document
                                        .getElementById(`room-image-upload-${i}`)
                                        ?.click()
                                    }
                                    disabled={uploadImageMutation.isPending}
                                  >
                                    <Upload className="w-4 h-4 mr-2" />
                                    {item.image ? "Replace image" : "Upload image"}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700"
                                    onClick={() =>
                                      setRoomItems((prev) => prev.filter((_, idx) => idx !== i))
                                    }
                                  >
                                    Remove
                                  </Button>
                                </div>
                                <Input
                                  placeholder="Caption (optional)"
                                  value={item.caption}
                                  onChange={(e) =>
                                    setRoomItems((prev) =>
                                      prev.map((r, idx) =>
                                        idx === i ? { ...r, caption: e.target.value } : r
                                      )
                                    )
                                  }
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

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

        {/* The Path Tab */}
        {activeTab === 'path' && (
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200/50 overflow-hidden">
            <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-8 py-6 border-b border-slate-200/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">The Path — Chapter Paintings</h3>
                  <p className="text-sm text-slate-600">
                    Choose which painting leads each chapter of the story page
                  </p>
                </div>
              </div>
            </div>
            <div className="p-8">
              <p className="mb-6 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                Pick a painting for each slot below. Leave a slot on <strong>Auto</strong> to let the
                page choose a fitting painting on its own. The “Works from the Threshold” row at the
                bottom of the page shows your <em>available</em> paintings automatically. Changes
                save to the live site.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {PATH_IMAGE_SLOTS.map((slot) => {
                  const selected = artworks.find((a) => String(a.id) === pathForm[slot.key]);
                  return (
                    <div key={slot.key} className="border border-slate-200 rounded-2xl p-4">
                      <div className="flex items-start gap-4">
                        <div className="w-16 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
                          {selected?.images?.[0] ? (
                            <img src={selected.images[0]} alt={selected.title} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[10px] text-slate-400 text-center px-1">Auto</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 text-sm">{slot.label}</p>
                          <p className="text-xs text-slate-500 mb-2">{slot.hint}</p>
                          <select
                            value={pathForm[slot.key] ?? ""}
                            onChange={(e) =>
                              setPathForm((f) => ({ ...f, [slot.key]: e.target.value }))
                            }
                            className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                          >
                            <option value="">Auto (default)</option>
                            {artworks.map((a) => (
                              <option key={a.id} value={String(a.id)}>
                                {a.title}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 flex items-center gap-4">
                <Button
                  onClick={() => updatePathMutation.mutate(pathForm)}
                  disabled={updatePathMutation.isPending}
                  className="h-10 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium rounded-xl transition-all duration-200"
                >
                  {updatePathMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
                <a
                  href="/path"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  Preview The Path →
                </a>
              </div>
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
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => syncSingulartMutation.mutate()}
                    disabled={syncSingulartMutation.isPending}
                    variant="outline"
                    className="h-10 border-slate-300 text-slate-700 hover:bg-slate-50 font-medium rounded-xl transition-all duration-200"
                  >
                    <RefreshCw
                      className={`w-4 h-4 mr-2 ${syncSingulartMutation.isPending ? "animate-spin" : ""}`}
                    />
                    {syncSingulartMutation.isPending ? "Syncing…" : "Sync Singulart"}
                  </Button>
                  <Button
                    onClick={() => setLocation("/admin/create-artwork")}
                    className="h-10 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium rounded-xl transition-all duration-200"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add New Artwork
                  </Button>
                </div>
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
                      {editingExhibitionId === exhibition.id ? (
                        <Form {...editExhibitionForm}>
                          <form
                            onSubmit={editExhibitionForm.handleSubmit((data) =>
                              updateExhibitionMutation.mutate({ id: exhibition.id, data })
                            )}
                            className="space-y-4"
                          >
                            <div className="grid grid-cols-2 gap-4">
                              <FormField
                                control={editExhibitionForm.control}
                                name="title"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Title</FormLabel>
                                    <FormControl><Input {...field} /></FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={editExhibitionForm.control}
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
                                control={editExhibitionForm.control}
                                name="venue"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Venue</FormLabel>
                                    <FormControl><Input {...field} /></FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={editExhibitionForm.control}
                                name="location"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Location</FormLabel>
                                    <FormControl><Input {...field} /></FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <FormField
                                control={editExhibitionForm.control}
                                name="startDate"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Start Date (Optional)</FormLabel>
                                    <FormControl><Input {...field} value={field.value || ''} placeholder="e.g. March 2024" /></FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={editExhibitionForm.control}
                                name="endDate"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>End Date (Optional)</FormLabel>
                                    <FormControl><Input {...field} value={field.value || ''} placeholder="e.g. April 2024" /></FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <FormField
                              control={editExhibitionForm.control}
                              name="description"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Description</FormLabel>
                                  <FormControl>
                                    <Textarea {...field} value={field.value || ''} rows={3} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <div className="flex gap-2">
                              <Button
                                type="submit"
                                disabled={updateExhibitionMutation.isPending}
                                className="bg-deep-blue hover:bg-deep-blue/90"
                              >
                                {updateExhibitionMutation.isPending ? "Saving..." : "Save Changes"}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setEditingExhibitionId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </form>
                        </Form>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold">{exhibition.title}</h3>
                            <p className="text-sm text-soft-gray">
                              {exhibition.venue}, {exhibition.location} • {exhibition.year}
                            </p>
                            {exhibition.description && (
                              <p className="text-xs text-slate-500 mt-1 line-clamp-2">{exhibition.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingExhibitionId(exhibition.id)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
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
                        </div>
                      )}
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
                            <Textarea {...field} value={field.value || ''} rows={3} />
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
                            <Textarea {...field} value={field.value || ''} rows={2} />
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
                            <Textarea {...field} value={field.value || ''} rows={2} />
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

        {/* Gallery Photos Tab */}
        {activeTab === 'gallery' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-playfair text-xl text-deep-blue">
                  Add New Gallery Photo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...galleryPhotoForm}>
                  <form onSubmit={galleryPhotoForm.handleSubmit(handleGalleryPhotoSubmit)} className="space-y-4">
                    <FormField
                      control={galleryPhotoForm.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Title / Caption (Optional)</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ''} placeholder="Exhibition opening night, 2024" data-testid="input-gallery-title" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={galleryPhotoForm.control}
                        name="exhibitionName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Exhibition Name (Optional)</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ''} placeholder="Abstract Emotions 2024" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={galleryPhotoForm.control}
                        name="location"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Location (Optional)</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ''} placeholder="Rome, Italy" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={galleryPhotoForm.control}
                      name="year"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Year (Optional)</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="number"
                              value={field.value || ''}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                              placeholder={new Date().getFullYear().toString()}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-2">
                      <FormLabel>Photo</FormLabel>
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={handleGalleryPhotoImageUpload}
                        data-testid="input-gallery-image"
                      />
                      {galleryPhotoImage && (
                        <div className="mt-2">
                          <img 
                            src={galleryPhotoImage} 
                            alt="Gallery photo preview" 
                            className="w-48 h-48 object-cover rounded border"
                          />
                        </div>
                      )}
                    </div>

                    <Button 
                      type="submit" 
                      disabled={createGalleryPhotoMutation.isPending || !galleryPhotoImage}
                      className="bg-deep-blue hover:bg-deep-blue/90"
                      data-testid="button-add-gallery-photo"
                    >
                      {createGalleryPhotoMutation.isPending ? "Adding..." : "Add Gallery Photo"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            {/* Gallery Photos List */}
            {galleryPhotosLoading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className="animate-pulse bg-white p-4 rounded-lg">
                    <div className="h-32 bg-gray-200 rounded mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {galleryPhotos.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center text-slate-600">
                      No gallery photos yet. Add your first exhibition photo above!
                    </CardContent>
                  </Card>
                ) : (
                  galleryPhotos.map((photo) => (
                    <Card key={photo.id}>
                      <CardContent className="p-4">
                        <div className="flex gap-4">
                          <img 
                            src={photo.image} 
                            alt={photo.title || 'Gallery photo'}
                            className="w-32 h-32 object-cover rounded"
                          />
                          <div className="flex-1">
                            <div className="flex items-start justify-between">
                              <div>
                                <h3 className="font-semibold text-lg">{photo.title || `Photo #${photo.id}`}</h3>
                                <div className="text-sm text-slate-600 space-y-1">
                                  {photo.exhibitionName && <p>Exhibition: {photo.exhibitionName}</p>}
                                  {photo.location && <p>Location: {photo.location}</p>}
                                  {photo.year && <p>Year: {photo.year}</p>}
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                  {photo.featured && (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                      Featured
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => toggleGalleryPhotoFeaturedMutation.mutate({
                                    id: photo.id,
                                    featured: !photo.featured
                                  })}
                                  disabled={toggleGalleryPhotoFeaturedMutation.isPending}
                                >
                                  {photo.featured ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </Button>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleReorderGalleryPhoto(photo.id, 'up')}
                                    disabled={reorderGalleryPhotoMutation.isPending}
                                    title="Move Up"
                                  >
                                    <ChevronUp className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleReorderGalleryPhoto(photo.id, 'down')}
                                    disabled={reorderGalleryPhotoMutation.isPending}
                                    title="Move Down"
                                  >
                                    <ChevronDown className="w-4 h-4" />
                                  </Button>
                                </div>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      disabled={deleteGalleryPhotoMutation.isPending}
                                    >
                                      <Trash className="w-4 h-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Gallery Photo</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete "{photo.title || `Photo #${photo.id}`}"? This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deleteGalleryPhotoMutation.mutate(photo.id)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Contact Settings Tab */}
        {activeTab === 'contact' && (
          <Card>
            <CardHeader>
              <CardTitle className="font-playfair text-xl text-deep-blue">
                Contact Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contactLoading ? (
                <div className="animate-pulse space-y-4">
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-10 bg-gray-200 rounded"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-10 bg-gray-200 rounded"></div>
                </div>
              ) : (
                <Form {...contactForm}>
                  <form onSubmit={contactForm.handleSubmit(handleContactSubmit)} className="space-y-6">
                    <FormField
                      control={contactForm.control}
                      name="instagramUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Instagram URL</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="https://www.instagram.com/animoria.art/" data-testid="input-instagram-url" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={contactForm.control}
                      name="instagramHandle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Instagram Handle</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="@animoria.art" data-testid="input-instagram-handle" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={contactForm.control}
                      name="saatchiUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Saatchi Art URL</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="https://www.saatchiart.com/account/profile/1980379" data-testid="input-saatchi-url" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={contactForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address</FormLabel>
                          <FormControl>
                            <Input {...field} type="email" placeholder="animuradyan.artist@gmail.com" data-testid="input-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={contactForm.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Location</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Yerevan, Armenia" data-testid="input-location" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <Button 
                      type="submit" 
                      disabled={updateContactMutation.isPending}
                      className="bg-deep-blue hover:bg-deep-blue/90"
                      data-testid="button-save-contact-settings"
                    >
                      {updateContactMutation.isPending ? "Saving..." : "Save Contact Settings"}
                    </Button>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>
        )}

        {/* Collectors Tab */}
        {activeTab === 'collectors' && (
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200/50 overflow-hidden">
            <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-8 py-6 border-b border-slate-200/50">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">Collector List</h3>
                  <p className="text-sm text-slate-600">
                    People who joined from the homepage “Join the Collector List” form.
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700">
                  {collectors.length} {collectors.length === 1 ? "email" : "emails"}
                </span>
              </div>
            </div>
            <div className="p-8">
              {collectorsLoading ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : collectors.length === 0 ? (
                <p className="text-sm text-slate-400 italic">
                  No signups yet. Emails from the homepage “Join the Collector List” form will appear here.
                </p>
              ) : (
                <>
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-medium">Email</th>
                          <th className="px-4 py-3 font-medium">Joined</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {collectors.map((c) => (
                          <tr key={c.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-slate-800">
                              <a href={`mailto:${c.email}`} className="hover:underline">
                                {c.email}
                              </a>
                            </td>
                            <td className="px-4 py-3 text-slate-500">
                              {new Date(c.createdAt).toLocaleDateString(undefined, {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-6">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard?.writeText(collectors.map((c) => c.email).join("\n"));
                        toast({
                          title: "Emails copied",
                          description: `${collectors.length} email${collectors.length === 1 ? "" : "s"} copied to clipboard`,
                        });
                      }}
                    >
                      Copy all emails
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Messages Tab */}
        {activeTab === 'messages' && (
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200/50 overflow-hidden">
            <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-8 py-6 border-b border-slate-200/50">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">Messages</h3>
                  <p className="text-sm text-slate-600">Messages left through the Contact page.</p>
                </div>
                <span className="shrink-0 rounded-full bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700">
                  {messages.length} {messages.length === 1 ? "message" : "messages"}
                </span>
              </div>
            </div>
            <div className="p-8">
              {messagesLoading ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : messages.length === 0 ? (
                <p className="text-sm text-slate-400 italic">
                  No messages yet. Messages from the Contact page will appear here.
                </p>
              ) : (
                <div className="space-y-4">
                  {messages.map((m) => (
                    <div key={m.id} className="rounded-xl border border-slate-200 p-5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="font-medium text-slate-900">{m.name}</span>
                          <a href={`mailto:${m.email}`} className="text-sm text-blue-700 hover:underline">
                            {m.email}
                          </a>
                        </div>
                        <span className="text-xs text-slate-400">
                          {new Date(m.createdAt).toLocaleString(undefined, {
                            year: "numeric", month: "short", day: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                      </div>
                      {m.subject && <p className="text-sm font-medium text-slate-700 mb-1">{m.subject}</p>}
                      <p className="text-sm text-slate-600 whitespace-pre-wrap">{m.message}</p>
                      <div className="mt-3">
                        <a
                          href={`mailto:${m.email}?subject=${encodeURIComponent("Re: " + (m.subject || "Your message"))}`}
                          className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2"
                        >
                          Reply by email
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PrintsManagement() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { logout } = useAdmin();

  const handleAuthError = (error: Error, fallbackMessage: string) => {
    if (error.message.startsWith("401")) {
      logout();
      toast({ title: "Session expired. Please log in again.", variant: "destructive" });
    } else {
      toast({ title: fallbackMessage, variant: "destructive" });
    }
  };
  
  const { data: prints = [], isLoading: printsLoading } = useQuery<Print[]>({
    queryKey: ["/api/prints"],
  });

  const deletePrintMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/prints/${id}`),
    onSuccess: (_data, id) => {
      queryClient.setQueryData(["/api/prints"], (old: any[]) =>
        Array.isArray(old) ? old.filter((p) => p.id !== id) : old
      );
      toast({ title: "Print deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/prints"] });
    },
    onError: (error: Error) => handleAuthError(error, "Failed to delete print"),
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