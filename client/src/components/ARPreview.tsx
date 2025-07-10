import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Camera, Move, ZoomIn, ZoomOut, RotateCw, Ruler, CreditCard } from "lucide-react";

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
  availableSizes?: string; // JSON string of available sizes
}

export default function ARPreview({ artwork, selectedSize, availableSizes }: ARPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(true);
  
  // AR controls
  const [artworkScale, setArtworkScale] = useState([100]);
  const [artworkPosition, setArtworkPosition] = useState({ x: 50, y: 50 });
  const [artworkRotation, setArtworkRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // Size selection in AR
  const [currentARSize, setCurrentARSize] = useState(selectedSize);
  const [showSizeSelector, setShowSizeSelector] = useState(false);
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [realWorldScale, setRealWorldScale] = useState(1); // pixels per cm
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>();
  const artworkRef = useRef<HTMLImageElement>(null);
  
  // Parse available sizes
  const parsedSizes = availableSizes ? (() => {
    try {
      return JSON.parse(availableSizes);
    } catch {
      return [];
    }
  })() : [];
  
  // Default sizes if none provided
  const defaultSizes = [
    { width: 30, height: 40, material: "paper" },
    { width: 40, height: 60, material: "paper" },
    { width: 50, height: 70, material: "paper" },
    { width: 60, height: 80, material: "paper" },
    { width: 30, height: 40, material: "canvas" },
    { width: 40, height: 60, material: "canvas" },
    { width: 50, height: 70, material: "canvas" },
    { width: 60, height: 80, material: "canvas" },
  ];
  
  const allSizes = parsedSizes.length > 0 ? parsedSizes : defaultSizes;

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

  // Draw artwork overlay on canvas with realistic rendering
  const drawArtworkOverlay = (ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number) => {
    if (!artworkRef.current || !artworkRef.current.complete) return;
    
    const currentSize = currentARSize || selectedSize;
    if (!currentSize) return;
    
    // Calculate real-world size in pixels
    // Using device pixel ratio and estimated screen DPI for better accuracy
    const devicePixelRatio = window.devicePixelRatio || 1;
    const estimatedDPI = 96 * devicePixelRatio; // Approximate screen DPI
    const cmToPx = (estimatedDPI / 2.54) * realWorldScale; // Convert cm to pixels
    
    const scale = artworkScale[0] / 100;
    let artworkWidth = currentSize.width * cmToPx * scale;
    let artworkHeight = currentSize.height * cmToPx * scale;
    
    // Calculate position
    const x = (artworkPosition.x / 100) * canvasWidth - artworkWidth / 2;
    const y = (artworkPosition.y / 100) * canvasHeight - artworkHeight / 2;
    
    // Save context for transformations
    ctx.save();
    
    // Apply transformations
    ctx.translate(x + artworkWidth / 2, y + artworkHeight / 2);
    ctx.rotate((artworkRotation * Math.PI) / 180);
    
    // Create realistic rendering effects
    
    // 1. Draw shadow first (behind the artwork)
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 6;
    
    // 2. Draw a subtle frame/mat border for paper prints
    if (currentSize.material === 'paper') {
      const borderWidth = 8;
      ctx.fillStyle = '#f8f8f8';
      ctx.fillRect(
        -artworkWidth / 2 - borderWidth,
        -artworkHeight / 2 - borderWidth,
        artworkWidth + borderWidth * 2,
        artworkHeight + borderWidth * 2
      );
      
      // Add subtle border shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 2;
    }
    
    // 3. Draw the artwork
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 4;
    
    ctx.drawImage(
      artworkRef.current,
      -artworkWidth / 2,
      -artworkHeight / 2,
      artworkWidth,
      artworkHeight
    );
    
    // 4. Add subtle glare effect for canvas prints
    if (currentSize.material === 'canvas') {
      const gradient = ctx.createLinearGradient(
        -artworkWidth / 2, -artworkHeight / 2,
        artworkWidth / 2, artworkHeight / 2
      );
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
      gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.02)');
      gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.02)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0.08)');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(
        -artworkWidth / 2,
        -artworkHeight / 2,
        artworkWidth,
        artworkHeight
      );
    }
    
    // 5. Add size indicator when in calibration mode
    if (calibrationMode) {
      ctx.restore();
      ctx.save();
      
      // Draw size dimensions
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 2;
      ctx.font = '14px Arial';
      ctx.fillStyle = '#ff6b6b';
      
      // Horizontal dimension line
      ctx.beginPath();
      ctx.moveTo(x, y + artworkHeight + 20);
      ctx.lineTo(x + artworkWidth, y + artworkHeight + 20);
      ctx.stroke();
      
      // Vertical dimension line
      ctx.beginPath();
      ctx.moveTo(x + artworkWidth + 20, y);
      ctx.lineTo(x + artworkWidth + 20, y + artworkHeight);
      ctx.stroke();
      
      // Size text
      ctx.fillText(`${currentSize.width}cm`, x + artworkWidth/2 - 20, y + artworkHeight + 35);
      ctx.fillText(`${currentSize.height}cm`, x + artworkWidth + 35, y + artworkHeight/2);
    }
    
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
    setShowSizeSelector(false);
    setCalibrationMode(false);
  };

  // Handle size change in AR
  const handleSizeChange = (sizeString: string) => {
    const size = allSizes.find(s => `${s.width}x${s.height}-${s.material}` === sizeString);
    if (size) {
      setCurrentARSize(size);
      setShowSizeSelector(false);
    }
  };

  // Calibration with reference object
  const handleCalibration = (referenceType: 'credit-card' | 'a4') => {
    // Credit card: 8.5 x 5.4 cm
    // A4 paper: 21 x 29.7 cm
    const referenceSize = referenceType === 'credit-card' ? 8.5 : 21;
    
    // For now, set a reasonable default - in real implementation,
    // user would position reference object and we'd calculate scale
    const estimatedScale = referenceType === 'credit-card' ? 0.8 : 1.2;
    setRealWorldScale(estimatedScale);
    setCalibrationMode(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, []);

  // Update current AR size when selected size changes
  useEffect(() => {
    if (selectedSize) {
      setCurrentARSize(selectedSize);
    }
  }, [selectedSize]);

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-lg shadow-lg transform transition-all duration-200 hover:scale-105"
      >
        <Camera className="w-5 h-5 mr-2" />
        Preview on Your Wall
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
                    <Camera className="w-12 h-12 mx-auto mb-4 text-blue-600" />
                    <h3 className="text-lg font-semibold mb-2">AR Preview Instructions</h3>
                    <ul className="text-sm text-gray-600 space-y-1 mb-4">
                      <li>• Drag the artwork to move it</li>
                      <li>• Use the size selector to change dimensions</li>
                      <li>• Scale and rotate with the controls</li>
                      <li>• Point camera at a wall for best results</li>
                    </ul>
                    <Button
                      onClick={() => setShowInstructions(false)}
                      className="w-full"
                    >
                      Start Preview
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Size selector overlay */}
            {showSizeSelector && isInitialized && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                <Card className="max-w-md mx-4">
                  <CardContent className="p-6">
                    <h3 className="text-lg font-semibold mb-4">Select Print Size</h3>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {allSizes.map((size, index) => (
                        <Button
                          key={index}
                          variant={currentARSize?.width === size.width && currentARSize?.height === size.height && currentARSize?.material === size.material ? "default" : "outline"}
                          className="p-3 h-auto text-left"
                          onClick={() => handleSizeChange(`${size.width}x${size.height}-${size.material}`)}
                        >
                          <div>
                            <div className="font-medium">{size.width} × {size.height} cm</div>
                            <div className="text-xs text-gray-500 capitalize">{size.material}</div>
                          </div>
                        </Button>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setShowSizeSelector(false)}
                      className="w-full"
                    >
                      Close
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Calibration overlay */}
            {calibrationMode && isInitialized && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                <Card className="max-w-md mx-4">
                  <CardContent className="p-6">
                    <h3 className="text-lg font-semibold mb-4">Calibrate Size</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Hold a reference object against the wall to calibrate the size:
                    </p>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <Button
                        variant="outline"
                        onClick={() => handleCalibration('credit-card')}
                        className="p-4 h-auto text-center"
                      >
                        <div>
                          <CreditCard className="w-8 h-8 mx-auto mb-2" />
                          <div className="text-sm font-medium">Credit Card</div>
                          <div className="text-xs text-gray-500">8.5 × 5.4 cm</div>
                        </div>
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleCalibration('a4')}
                        className="p-4 h-auto text-center"
                      >
                        <div>
                          <Ruler className="w-8 h-8 mx-auto mb-2" />
                          <div className="text-sm font-medium">A4 Paper</div>
                          <div className="text-xs text-gray-500">21 × 29.7 cm</div>
                        </div>
                      </Button>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setCalibrationMode(false)}
                      className="w-full"
                    >
                      Skip Calibration
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Control panel */}
            {isInitialized && (
              <div className="absolute bottom-0 left-0 right-0 z-20 bg-black/50 backdrop-blur-sm p-4">
                <div className="space-y-4">
                  {/* Current size info */}
                  {currentARSize && (
                    <div className="text-center">
                      <Badge className="bg-blue-600 text-white">
                        {currentARSize.width} × {currentARSize.height} cm ({currentARSize.material})
                      </Badge>
                    </div>
                  )}

                  {/* Size control */}
                  <div className="flex items-center space-x-4 text-white">
                    <ZoomOut className="w-5 h-5" />
                    <div className="flex-1">
                      <Slider
                        value={artworkScale}
                        onValueChange={setArtworkScale}
                        min={50}
                        max={150}
                        step={5}
                        className="w-full"
                      />
                    </div>
                    <ZoomIn className="w-5 h-5" />
                    <span className="text-sm min-w-[3rem]">{artworkScale[0]}%</span>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center justify-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSizeSelector(true)}
                      className="bg-white/20 border-white/30 text-white hover:bg-white/30"
                    >
                      <Ruler className="w-4 h-4 mr-2" />
                      Size
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCalibrationMode(true)}
                      className="bg-white/20 border-white/30 text-white hover:bg-white/30"
                    >
                      <CreditCard className="w-4 h-4 mr-2" />
                      Calibrate
                    </Button>
                    
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
                        setArtworkScale([100]);
                        setArtworkRotation(0);
                      }}
                      className="bg-white/20 border-white/30 text-white hover:bg-white/30"
                    >
                      Reset
                    </Button>
                  </div>

                  {/* Usage tip */}
                  <div className="text-center text-white/70 text-xs">
                    Drag artwork to move • Use controls to adjust size and rotation
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}