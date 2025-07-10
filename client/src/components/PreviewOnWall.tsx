import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Eye, Maximize2 } from "lucide-react";

// Room backgrounds are now inline SVG

interface PreviewOnWallProps {
  artwork: {
    id: number;
    title: string;
    images: string[];
    printSizes?: string;
  };
  onSizeSelect?: (width: number, height: number, material: string) => void;
}

interface RoomBackground {
  id: string;
  name: string;
  svg: string;
  wallArea: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

const modernInteriorSvg = `
<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg">
  <!-- Light wood floor -->
  <defs>
    <pattern id="woodFloor" patternUnits="userSpaceOnUse" width="60" height="8">
      <rect width="60" height="8" fill="#F5E6D3"/>
      <rect x="0" y="0" width="60" height="2" fill="#E8D5C0"/>
      <rect x="0" y="6" width="60" height="2" fill="#E8D5C0"/>
    </pattern>
    <linearGradient id="wallGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#FEFEFE;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#F8F8F8;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Floor -->
  <rect x="0" y="300" width="800" height="200" fill="url(#woodFloor)"/>
  
  <!-- Main wall -->
  <rect x="0" y="0" width="800" height="300" fill="url(#wallGradient)"/>
  
  <!-- Wall panel shadows -->
  <rect x="50" y="180" width="120" height="80" fill="#F0F0F0" opacity="0.3"/>
  <rect x="180" y="180" width="120" height="80" fill="#F0F0F0" opacity="0.3"/>
  <rect x="310" y="180" width="120" height="80" fill="#F0F0F0" opacity="0.3"/>
  
  <!-- Floating console/shelf -->
  <rect x="50" y="260" width="380" height="20" fill="#FFFFFF" stroke="#E0E0E0" stroke-width="1"/>
  <rect x="50" y="278" width="380" height="8" fill="#F0F0F0"/>
  
  <!-- Left wooden built-in shelf -->
  <rect x="20" y="80" width="60" height="180" fill="#DFC49A"/>
  <rect x="25" y="90" width="50" height="15" fill="#F8F8F8"/>
  <rect x="25" y="115" width="50" height="15" fill="#F8F8F8"/>
  <rect x="25" y="140" width="50" height="15" fill="#F8F8F8"/>
  <rect x="25" y="165" width="50" height="15" fill="#F8F8F8"/>
  <rect x="25" y="190" width="50" height="15" fill="#F8F8F8"/>
  
  <!-- Modern gray chair -->
  <ellipse cx="580" cy="320" rx="35" ry="15" fill="#8A8A8A"/>
  <rect x="555" y="250" width="50" height="70" rx="25" fill="#9A9A9A"/>
  <rect x="548" y="245" width="64" height="40" rx="32" fill="#8A8A8A"/>
  <rect x="575" y="285" width="10" height="35" fill="#7A7A7A"/>
  
  <!-- Plant -->
  <ellipse cx="650" cy="320" rx="15" ry="8" fill="#8A8A8A"/>
  <rect x="645" y="290" width="10" height="30" fill="#2D5016"/>
  <ellipse cx="650" cy="275" rx="20" ry="25" fill="#4A7C29"/>
  <ellipse cx="645" cy="270" rx="15" ry="20" fill="#5C8A35"/>
  <ellipse cx="655" cy="270" rx="15" ry="20" fill="#5C8A35"/>
  
  <!-- Window frame -->
  <rect x="720" y="40" width="80" height="180" fill="#FFFFFF" stroke="#D0D0D0" stroke-width="2"/>
  <rect x="720" y="40" width="80" height="90" fill="#E8F4FD" opacity="0.6"/>
  <rect x="720" y="130" width="80" height="90" fill="#E8F4FD" opacity="0.6"/>
  <line x1="760" y1="40" x2="760" y2="220" stroke="#D0D0D0" stroke-width="1"/>
  <line x1="720" y1="130" x2="800" y2="130" stroke="#D0D0D0" stroke-width="1"/>
  
  <!-- Ceiling lights -->
  <circle cx="200" cy="30" r="8" fill="#FFFFFF" stroke="#E0E0E0"/>
  <circle cx="400" cy="30" r="8" fill="#FFFFFF" stroke="#E0E0E0"/>
  
  <!-- Wall decoration area (where artwork will be placed) -->
  <rect x="200" y="120" width="200" height="120" fill="transparent" stroke="#000000" stroke-width="1" stroke-dasharray="2,2" opacity="0.2"/>
</svg>`;

const roomBackgrounds: RoomBackground[] = [
  {
    id: "modern-interior",
    name: "Modern Interior",
    svg: `data:image/svg+xml;base64,${btoa(modernInteriorSvg)}`,
    wallArea: { x: 200, y: 120, width: 200, height: 120 }
  }
];

export default function PreviewOnWall({ artwork, onSizeSelect }: PreviewOnWallProps) {
  const [selectedRoom, setSelectedRoom] = useState<string>("modern-interior");
  const [selectedWidth, setSelectedWidth] = useState<number>(40);
  const [selectedHeight, setSelectedHeight] = useState<number>(60);
  const [selectedMaterial, setSelectedMaterial] = useState<string>("paper");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Parse available print sizes
  const printSizes = useMemo(() => {
    if (!artwork.printSizes) return [];
    try {
      return JSON.parse(artwork.printSizes);
    } catch {
      return [];
    }
  }, [artwork.printSizes]);

  // Common sizes if no predefined sizes
  const commonSizes = [
    { width: 30, height: 40, material: "paper" },
    { width: 40, height: 60, material: "paper" },
    { width: 50, height: 70, material: "paper" },
    { width: 60, height: 80, material: "paper" },
    { width: 30, height: 40, material: "canvas" },
    { width: 40, height: 60, material: "canvas" },
    { width: 50, height: 70, material: "canvas" },
    { width: 60, height: 80, material: "canvas" },
  ];

  const availableSizes = printSizes.length > 0 ? printSizes : commonSizes;

  const currentRoom = roomBackgrounds.find(room => room.id === selectedRoom) || roomBackgrounds[0];

  // Calculate artwork dimensions in the room (scaled to room dimensions)
  const artworkDisplaySize = useMemo(() => {
    const roomWallArea = currentRoom.wallArea;
    const artworkRatio = selectedWidth / selectedHeight;
    
    // Scale artwork to fit within wall area while maintaining aspect ratio
    let displayWidth = selectedWidth * 2; // Scale factor for visibility
    let displayHeight = selectedHeight * 2;
    
    // Ensure it doesn't exceed wall area
    if (displayWidth > roomWallArea.width * 0.8) {
      displayWidth = roomWallArea.width * 0.8;
      displayHeight = displayWidth / artworkRatio;
    }
    
    if (displayHeight > roomWallArea.height * 0.8) {
      displayHeight = roomWallArea.height * 0.8;
      displayWidth = displayHeight * artworkRatio;
    }
    
    return {
      width: displayWidth,
      height: displayHeight,
      x: roomWallArea.x + (roomWallArea.width - displayWidth) / 2,
      y: roomWallArea.y + (roomWallArea.height - displayHeight) / 2
    };
  }, [selectedWidth, selectedHeight, currentRoom]);

  const handleSizeSelect = (size: any) => {
    setSelectedWidth(size.width);
    setSelectedHeight(size.height);
    setSelectedMaterial(size.material);
    if (onSizeSelect) {
      onSizeSelect(size.width, size.height, size.material);
    }
  };

  const PreviewContent = ({ isModal = false }) => (
    <div className={`space-y-6 ${isModal ? 'max-w-4xl' : ''}`}>
      {/* Room Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Select Room</Label>
          <Select value={selectedRoom} onValueChange={setSelectedRoom}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roomBackgrounds.map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  {room.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Material</Label>
          <Select value={selectedMaterial} onValueChange={setSelectedMaterial}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="paper">Paper</SelectItem>
              <SelectItem value="canvas">Canvas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Size Selection */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Print Size</Label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {availableSizes
            .filter(size => size.material === selectedMaterial)
            .map((size, index) => (
              <Button
                key={index}
                variant={selectedWidth === size.width && selectedHeight === size.height ? "default" : "outline"}
                size="sm"
                onClick={() => handleSizeSelect(size)}
                className="h-auto p-2 text-xs"
              >
                {size.width}×{size.height}cm
              </Button>
            ))}
        </div>
      </div>

      {/* Custom Size Inputs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Width (cm)</Label>
          <Input
            type="number"
            min="20"
            max="120"
            value={selectedWidth}
            onChange={(e) => setSelectedWidth(Number(e.target.value))}
            className="h-8"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">Height (cm)</Label>
          <Input
            type="number"
            min="20"
            max="120"
            value={selectedHeight}
            onChange={(e) => setSelectedHeight(Number(e.target.value))}
            className="h-8"
          />
        </div>
      </div>

      {/* Room Preview */}
      <div className="relative">
        <div className="bg-gray-100 rounded-lg p-4 relative overflow-hidden">
          {/* Room Background */}
          <div 
            className="relative w-full h-80 md:h-96 bg-contain bg-center bg-no-repeat"
            style={{ 
              backgroundImage: `url(${currentRoom.svg})`,
              backgroundSize: 'contain'
            }}
          >
            {/* Artwork Overlay */}
            <div
              className="absolute border-2 border-deep-blue/50 shadow-lg rounded-sm overflow-hidden"
              style={{
                left: `${(artworkDisplaySize.x / 800) * 100}%`,
                top: `${(artworkDisplaySize.y / 600) * 100}%`,
                width: `${(artworkDisplaySize.width / 800) * 100}%`,
                height: `${(artworkDisplaySize.height / 600) * 100}%`,
              }}
            >
              <img
                src={artwork.images[0]}
                alt={artwork.title}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>

        {/* Fullscreen Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsFullscreen(true)}
          className="absolute top-6 right-6 bg-white/90 hover:bg-white"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Size Info */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <div className="text-sm text-blue-900">
          <div className="font-medium mb-1">Preview Details:</div>
          <div>Size: {selectedWidth}×{selectedHeight}cm on {selectedMaterial}</div>
          <div>Room: {currentRoom.name}</div>
          <div className="text-xs text-blue-700 mt-1">
            *Preview is scaled for visualization. Actual size may vary depending on wall distance and viewing angle.
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Dialog>
        <DialogTrigger asChild>
          {/* TEMPORARILY HIDDEN - Preview on Wall button */}
          {/* To restore: remove the style={{display: 'none'}} */}
          <Button className="w-full bg-deep-blue hover:bg-deep-blue/90" style={{display: 'none'}}>
            <Eye className="w-4 h-4 mr-2" />
            Preview on Wall
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-playfair text-xl text-deep-blue">
              Preview "{artwork.title}" on Wall
            </DialogTitle>
          </DialogHeader>
          <PreviewContent isModal={true} />
        </DialogContent>
      </Dialog>

      {/* Fullscreen Modal */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-full h-screen p-6 overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-playfair text-xl text-deep-blue">
              Fullscreen Preview - "{artwork.title}"
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1">
            <div className="bg-gray-100 rounded-lg p-4 relative overflow-hidden">
              <div 
                className="relative w-full h-[70vh] bg-contain bg-center bg-no-repeat"
                style={{ 
                  backgroundImage: `url(${currentRoom.svg})`,
                  backgroundSize: 'contain'
                }}
              >
                {/* Artwork Overlay */}
                <div
                  className="absolute border-2 border-deep-blue/50 shadow-lg rounded-sm overflow-hidden"
                  style={{
                    left: `${(artworkDisplaySize.x / 800) * 100}%`,
                    top: `${(artworkDisplaySize.y / 600) * 100}%`,
                    width: `${(artworkDisplaySize.width / 800) * 100}%`,
                    height: `${(artworkDisplaySize.height / 600) * 100}%`,
                  }}
                >
                  <img
                    src={artwork.images[0]}
                    alt={artwork.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}