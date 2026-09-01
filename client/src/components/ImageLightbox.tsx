/**
 * FULLSCREEN ARTWORK VIEWER (lightbox) — shared by the Original artwork page and the Print
 * product page. Click an image → it opens fullscreen on a dark backdrop for detailed inspection:
 * next/previous when several images exist, zoom in/out/reset, pan when zoomed, mouse-wheel and
 * pinch zoom, and full keyboard support (Escape closes, arrows navigate, +/- zoom, 0 resets).
 *
 * SECURITY: the viewer renders ONLY the public storefront image URLs its callers pass in
 * (`artwork.images`, `print.images`, per-option `mockup`). It has no access to — and never
 * receives — the print master, crop-source originals, `printReadyAssetUrl`, object-storage keys
 * or any signed fulfilment URL; those never reach the client. The viewer cannot invent a source.
 *
 * The maths (navigation wraparound, zoom clamping, pan bounds) lives in `@/lib/lightbox` so it is
 * unit-tested without a DOM. `LightboxStage` (the visual shell) is exported and rendered on its
 * own in tests; `ImageLightbox` wraps it in a Radix dialog for focus-trap + Escape + portal.
 */

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Minimize2 } from "lucide-react";
import {
  clampPan, clampZoom, hasMultiple, isZoomed, nextIndex, prevIndex, resetView,
  wrapIndex, zoomIn as stepZoomIn, zoomOut as stepZoomOut, ZOOM_MAX, ZOOM_MIN, type Pan,
} from "@/lib/lightbox";

export interface ImageLightboxProps {
  /** PUBLIC storefront image URLs only. Never a master/crop-source/signed fulfilment URL. */
  images: string[];
  /** The image to show first (also the controlled index while open). */
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the viewer moves to another image, so the host page can stay in sync. */
  onIndexChange?: (index: number) => void;
  /** Alt text for the shown image. Defaults to the dialog title. */
  alt?: (src: string, index: number) => string;
  /** Accessible dialog name (visually hidden). */
  title?: string;
}

interface LightboxStageProps {
  images: string[];
  index: number;
  scale: number;
  pan: Pan;
  dragging?: boolean;
  alt?: (src: string, index: number) => string;
  title: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  stageRef?: React.Ref<HTMLDivElement>;
  /** Wheel / pointer / touch handlers wired onto the zoom-pan stage by the stateful wrapper. */
  stageHandlers?: React.HTMLAttributes<HTMLDivElement>;
}

const CTRL =
  "inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white " +
  "backdrop-blur-sm transition hover:bg-black/70 focus:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-white/80 disabled:opacity-40 disabled:pointer-events-none";

/**
 * The visual shell — no portal, no focus-trap — so it can be rendered on its own in a test and
 * asserted (which image, which controls). `ImageLightbox` mounts this inside a Radix dialog.
 */
export function LightboxStage({
  images, index, scale, pan, dragging, alt, title,
  onClose, onPrev, onNext, onZoomIn, onZoomOut, onResetZoom, stageRef, stageHandlers,
}: LightboxStageProps) {
  const count = images.length;
  const safeIndex = wrapIndex(index, count);
  const src = images[safeIndex] ?? "";
  const many = hasMultiple(images);
  const zoomed = isZoomed(scale);
  const altText = alt ? alt(src, safeIndex) : title;

  return (
    <div className="relative flex h-full w-full flex-col">
      {/* Top bar: image counter (only when several) + close. Kept off the artwork itself. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between p-3 sm:p-4">
        <span className="pointer-events-auto rounded-full bg-black/40 px-3 py-1 text-xs tabular-nums text-white/90 backdrop-blur-sm">
          {many ? `${safeIndex + 1} / ${count}` : ""}
        </span>
        <button type="button" aria-label="Close viewer" onClick={onClose} className={`pointer-events-auto ${CTRL}`}>
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Stage: the artwork, contained (never stretched or cropped), zoom + pan via transform. */}
      <div
        ref={stageRef}
        className="flex flex-1 items-center justify-center overflow-hidden select-none"
        style={{ touchAction: "none", cursor: zoomed ? (dragging ? "grabbing" : "grab") : "auto" }}
        {...stageHandlers}
      >
        {src ? (
          <img
            src={src}
            alt={altText}
            draggable={false}
            className="max-h-full max-w-full object-contain"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transition: dragging ? "none" : "transform 120ms ease-out",
              willChange: "transform",
            }}
          />
        ) : null}
      </div>

      {/* Previous / next — only when there is more than one public image. */}
      {many ? (
        <>
          <button
            type="button" aria-label="Previous image" onClick={onPrev}
            className={`absolute left-3 top-1/2 z-20 -translate-y-1/2 ${CTRL}`}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button" aria-label="Next image" onClick={onNext}
            className={`absolute right-3 top-1/2 z-20 -translate-y-1/2 ${CTRL}`}
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      ) : null}

      {/* Zoom toolbar: out · reset · in. Bottom-centre, away from the artwork. */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-2 p-4">
        <button type="button" aria-label="Zoom out" onClick={onZoomOut} disabled={scale <= ZOOM_MIN} className={CTRL}>
          <ZoomOut className="h-5 w-5" />
        </button>
        <button type="button" aria-label="Reset zoom" onClick={onResetZoom} disabled={!zoomed} className={CTRL}>
          <Minimize2 className="h-5 w-5" />
        </button>
        <button type="button" aria-label="Zoom in" onClick={onZoomIn} disabled={scale >= ZOOM_MAX} className={CTRL}>
          <ZoomIn className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export function ImageLightbox({ images, index, open, onOpenChange, onIndexChange, alt, title = "Artwork viewer" }: ImageLightboxProps) {
  const count = images.length;
  const safeIndex = wrapIndex(index, count);
  const [view, setView] = useState(resetView());
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; pan: Pan } | null>(null);
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // A fresh image (or a fresh open) always starts fitted and centred.
  useEffect(() => { setView(resetView()); }, [safeIndex, open]);

  const stageSize = () => {
    const r = stageRef.current?.getBoundingClientRect();
    return { w: r?.width ?? 0, h: r?.height ?? 0 };
  };

  const setZoom = useCallback((scale: number, keepPan = true) => {
    setView((v) => {
      const s = clampZoom(scale);
      const { w, h } = stageSize();
      const pan = clampPan(s <= ZOOM_MIN || !keepPan ? { x: 0, y: 0 } : v.pan, s, w, h);
      return { scale: s, pan };
    });
  }, []);

  const goTo = useCallback((to: number) => {
    if (count > 1) onIndexChange?.(wrapIndex(to, count));
  }, [count, onIndexChange]);
  const goNext = useCallback(() => goTo(nextIndex(safeIndex, count)), [goTo, safeIndex, count]);
  const goPrev = useCallback(() => goTo(prevIndex(safeIndex, count)), [goTo, safeIndex, count]);

  // Keyboard: arrows navigate, +/- zoom, 0 resets. Escape is handled by the Radix dialog itself.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && count > 1) { e.preventDefault(); goNext(); }
      else if (e.key === "ArrowLeft" && count > 1) { e.preventDefault(); goPrev(); }
      else if (e.key === "+" || e.key === "=") { e.preventDefault(); setZoom(stepZoomIn(view.scale)); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); setZoom(stepZoomOut(view.scale)); }
      else if (e.key === "0") { e.preventDefault(); setView(resetView()); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, count, view.scale, goNext, goPrev, setZoom]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(view.scale + (e.deltaY < 0 ? 0.3 : -0.3));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!isZoomed(view.scale)) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, pan: view.pan };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const { w, h } = stageSize();
    const next = clampPan({ x: d.pan.x + (e.clientX - d.x), y: d.pan.y + (e.clientY - d.y) }, view.scale, w, h);
    setView((v) => ({ ...v, pan: next }));
  };
  const endDrag = () => { dragRef.current = null; setDragging(false); };

  // Touch pinch-to-zoom (two fingers). Single-finger drag pans when zoomed (handled by pointer events).
  const touchDist = (t: React.TouchList) => {
    const [a, b] = [t[0], t[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) pinchRef.current = { dist: touchDist(e.touches), scale: view.scale };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const ratio = touchDist(e.touches) / (pinchRef.current.dist || 1);
      setZoom(pinchRef.current.scale * ratio);
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchRef.current = null;
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/90 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[100] border-none bg-transparent p-0 shadow-none outline-none focus:outline-none"
          aria-label={title}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Use the left and right arrow keys to browse images, plus and minus to zoom, 0 to reset, and Escape to close.
          </DialogPrimitive.Description>
          <LightboxStage
            images={images}
            index={safeIndex}
            scale={view.scale}
            pan={view.pan}
            dragging={dragging}
            alt={alt}
            title={title}
            onClose={() => onOpenChange(false)}
            onPrev={goPrev}
            onNext={goNext}
            onZoomIn={() => setZoom(stepZoomIn(view.scale))}
            onZoomOut={() => setZoom(stepZoomOut(view.scale))}
            onResetZoom={() => setView(resetView())}
            stageRef={stageRef}
            stageHandlers={{
              onWheel,
              onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerLeave: endDrag,
              onTouchStart, onTouchMove, onTouchEnd,
            }}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
