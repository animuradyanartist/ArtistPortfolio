import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { X, Camera, Move, ZoomIn, ZoomOut, RotateCw } from "lucide-react";

interface ARPreviewProps {
  artwork: {
    id: number;
    title: string;
    images: string[];
  };
  selectedSize?: {
    width: number;
    height: number;
    material: string;
  };
}

export default function ARPreview({ artwork, selectedSize }: ARPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(true);
  
  // AR controls
  const [artworkScale, setArtworkScale] = useState([50]);
  const [artworkPosition, setArtworkPosition] = useState({ x: 50, y: 50 });
  const [artworkRotation, setArtworkRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>();
  const artworkRef = useRef<HTMLImageElement>(null);

  // Initialize camera and AR
  const initializeAR = async () => {
    try {
      setError(null);
      
      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment', // Use rear camera on mobile
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        
        videoRef.current.onloadedmetadata = () => {
          setIsInitialized(true);
          startARLoop();
        };
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Unable to access camera. Please ensure camera permissions are granted.');
    }
  };

  // AR rendering loop
  const startARLoop = () => {
    if (!canvasRef.current || !videoRef.current) return;
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    const render = () => {
      if (!video || !canvas || !ctx) return;
      
      // Set canvas size to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw video frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Draw artwork overlay
      drawArtworkOverlay(ctx, canvas.width, canvas.height);
      
      animationRef.current = requestAnimationFrame(render);
    };
    
    render();
  };

  // Draw artwork overlay on canvas
  const drawArtworkOverlay = (ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number) => {
    if (!artworkRef.current || !artworkRef.current.complete) return;
    
    const scale = artworkScale[0] / 100;
    const aspectRatio = artworkRef.current.naturalWidth / artworkRef.current.naturalHeight;
    
    // Calculate artwork size based on selected print size or default
    let artworkWidth = 200 * scale;
    let artworkHeight = artworkWidth / aspectRatio;
    
    // If we have a selected size, use it for more accurate scaling
    if (selectedSize) {
      const cmToPx = 3.78; // Approximate cm to px conversion
      artworkWidth = selectedSize.width * cmToPx * scale;
      artworkHeight = selectedSize.height * cmToPx * scale;
    }
    
    // Calculate position
    const x = (artworkPosition.x / 100) * canvasWidth - artworkWidth / 2;
    const y = (artworkPosition.y / 100) * canvasHeight - artworkHeight / 2;
    
    // Save context for transformations
    ctx.save();
    
    // Apply transformations
    ctx.translate(x + artworkWidth / 2, y + artworkHeight / 2);
    ctx.rotate((artworkRotation * Math.PI) / 180);
    
    // Draw artwork with shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 5;
    ctx.shadowOffsetY = 5;
    
    ctx.drawImage(
      artworkRef.current,
      -artworkWidth / 2,
      -artworkHeight / 2,
      artworkWidth,
      artworkHeight
    );
    
    // Restore context
    ctx.restore();
  };

  // Handle mouse/touch events for dragging
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    setIsDragging(true);
    setDragOffset({
      x: x - artworkPosition.x,
      y: y - artworkPosition.y
    });
    
    setShowInstructions(false);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    setArtworkPosition({
      x: Math.max(0, Math.min(100, x - dragOffset.x)),
      y: Math.max(0, Math.min(100, y - dragOffset.y))
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  // Cleanup function
  const cleanup = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    setIsInitialized(false);
    setError(null);
  };

  // Handle dialog close
  const handleClose = () => {
    cleanup();
    setIsOpen(false);
    setShowInstructions(true);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, []);

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-lg shadow-lg transform transition-all duration-200 hover:scale-105"
      >
        <Camera className="w-5 h-5 mr-2" />
        View on My Wall
      </Button>

      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-full max-h-full w-screen h-screen p-0 bg-black">
          <div className="relative w-full h-full">
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-20 bg-black/50 backdrop-blur-sm p-4">
              <div className="flex items-center justify-between text-white">
                <DialogTitle className="text-lg font-semibold">
                  AR Preview: {artwork.title}
                </DialogTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                  className="text-white hover:bg-white/20"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Camera view */}
            <div className="w-full h-full relative">
              {!isInitialized && !error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black">
                  <div className="text-center text-white">
                    <Camera className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg mb-4">Starting AR Preview...</p>
                    <Button
                      onClick={initializeAR}
                      className="bg-white text-black hover:bg-gray-100"
                    >
                      Allow Camera Access
                    </Button>
                  </div>
                </div>
              )}

              {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black">
                  <div className="text-center text-white max-w-md mx-auto p-6">
                    <Camera className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg mb-4">Camera Access Required</p>
                    <p className="text-sm mb-4 opacity-80">{error}</p>
                    <Button
                      onClick={initializeAR}
                      className="bg-white text-black hover:bg-gray-100"
                    >
                      Try Again
                    </Button>
                  </div>
                </div>
              )}

              {/* Video element (hidden) */}
              <video
                ref={videoRef}
                className="hidden"
                playsInline
                muted
              />

              {/* Canvas for AR rendering */}
              <canvas
                ref={canvasRef}
                className="w-full h-full object-contain"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                style={{ touchAction: 'none' }}
              />

              {/* Hidden artwork image for rendering */}
              <img
                ref={artworkRef}
                src={artwork.images[0]}
                alt={artwork.title}
                className="hidden"
                crossOrigin="anonymous"
              />
            </div>

            {/* Instructions overlay */}
            {showInstructions && isInitialized && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                <Card className="max-w-sm mx-4">
                  <CardContent className="p-6 text-center">
                    <Move className="w-12 h-12 mx-auto mb-4 text-blue-600" />
                    <h3 className="text-lg font-semibold mb-2">How to Use AR Preview</h3>
                    <ul className="text-sm text-gray-600 space-y-1 mb-4">
                      <li>• Drag to move the artwork</li>
                      <li>• Use controls to resize and rotate</li>
                      <li>• Point camera at a wall for best results</li>
                    </ul>
                    <Button
                      onClick={() => setShowInstructions(false)}
                      className="w-full"
                    >
                      Got It
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Control panel */}
            {isInitialized && (
              <div className="absolute bottom-0 left-0 right-0 z-20 bg-black/50 backdrop-blur-sm p-4">
                <div className="space-y-4">
                  {/* Size control */}
                  <div className="flex items-center space-x-4 text-white">
                    <ZoomOut className="w-5 h-5" />
                    <div className="flex-1">
                      <Slider
                        value={artworkScale}
                        onValueChange={setArtworkScale}
                        min={20}
                        max={200}
                        step={5}
                        className="w-full"
                      />
                    </div>
                    <ZoomIn className="w-5 h-5" />
                    <span className="text-sm min-w-[3rem]">{artworkScale[0]}%</span>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center justify-center space-x-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setArtworkRotation(r => r + 90)}
                      className="bg-white/20 border-white/30 text-white hover:bg-white/30"
                    >
                      <RotateCw className="w-4 h-4 mr-2" />
                      Rotate
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setArtworkPosition({ x: 50, y: 50 });
                        setArtworkScale([50]);
                        setArtworkRotation(0);
                      }}
                      className="bg-white/20 border-white/30 text-white hover:bg-white/30"
                    >
                      Reset
                    </Button>
                  </div>

                  {/* Size info */}
                  {selectedSize && (
                    <div className="text-center text-white/80 text-sm">
                      Showing: {selectedSize.width} × {selectedSize.height} cm ({selectedSize.material})
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}