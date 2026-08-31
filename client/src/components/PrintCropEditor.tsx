/**
 * PRINT CROP EDITOR — an interactive, non-destructive crop for ONE print variant.
 *
 * The artist positions/scales a frame — locked to the SKU's exact print-area aspect ratio — over the
 * uploaded production master (shown via an admin-only downscaled preview). What prints is inside the
 * frame; what is removed is dimmed. The image is NEVER stretched (the frame aspect is fixed) and the
 * master is NEVER modified — only a normalized crop rectangle is saved for this variant. Confirming is
 * explicit (Apply); Reset restores the largest centered crop; Cancel discards.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getProdigiProduct } from "@shared/commerce/prodigiProducts";
import { defaultCropForSku, croppedPixels, type NormalizedCrop } from "@shared/commerce/printCrop";

const FLOOR_DPI = 150;

export default function PrintCropEditor({ printId, variantId, prodigiSku, master, initialCrop, onClose, onSaved }: {
  printId: number;
  variantId: number;
  prodigiSku: string;
  master: { widthPx: number; heightPx: number };
  initialCrop: NormalizedCrop | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const product = getProdigiProduct(prodigiSku);
  const boxRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [previewOk, setPreviewOk] = useState<boolean | null>(null);

  const maximal = useMemo(
    () => (product ? defaultCropForSku(master.widthPx, master.heightPx, product) : { x: 0, y: 0, w: 1, h: 1 }),
    [product, master.widthPx, master.heightPx],
  );
  const [crop, setCrop] = useState<NormalizedCrop>(initialCrop ?? maximal);
  // scale = fraction of the maximal (aspect-locked) frame, so the aspect ratio is ALWAYS exact.
  const initialScale = useMemo(() => (initialCrop ? Math.min(1, initialCrop.w / maximal.w) : 1), [initialCrop, maximal.w]);
  const [scale, setScale] = useState(initialScale);

  // Recompute w/h from the maximal frame × scale; clamp the position so it stays inside the master.
  const applyScale = (s: number, keepCenter = true) => {
    const w = maximal.w * s, h = maximal.h * s;
    setCrop((c) => {
      const cx = keepCenter ? c.x + c.w / 2 : c.x;
      const cy = keepCenter ? c.y + c.h / 2 : c.y;
      let x = keepCenter ? cx - w / 2 : c.x;
      let y = keepCenter ? cy - h / 2 : c.y;
      x = Math.min(1 - w, Math.max(0, x));
      y = Math.min(1 - h, Math.max(0, y));
      return { x, y, w, h };
    });
    setScale(s);
  };

  // Drag to reposition (mouse + touch), clamped inside the image.
  const dragging = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const onDown = (clientX: number, clientY: number) => { dragging.current = { px: clientX, py: clientY, ox: crop.x, oy: crop.y }; };
  const onMove = (clientX: number, clientY: number) => {
    const d = dragging.current, box = boxRef.current;
    if (!d || !box) return;
    const rect = box.getBoundingClientRect();
    const dx = (clientX - d.px) / rect.width;
    const dy = (clientY - d.py) / rect.height;
    const x = Math.min(1 - crop.w, Math.max(0, d.ox + dx));
    const y = Math.min(1 - crop.h, Math.max(0, d.oy + dy));
    setCrop((c) => ({ ...c, x, y }));
  };
  const onUp = () => { dragging.current = null; };
  useEffect(() => {
    const move = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const up = () => onUp();
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  });

  const { widthPx, heightPx } = croppedPixels(master.widthPx, master.heightPx, crop);
  const skuLong = product ? Math.max(product.printAreaWidthPx, product.printAreaHeightPx) : 1;
  const croppedLong = Math.max(widthPx, heightPx);
  const effectiveDpi = Math.floor((300 * croppedLong) / skuLong);
  const belowFloor = effectiveDpi < FLOOR_DPI;

  const apply = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/prints/variants/${variantId}/crop`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crop }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { toast({ title: body.message ?? "Could not save the crop", variant: "destructive" }); return; }
      if (body.eligible) toast({ title: "Crop applied — this size is now eligible", description: `${effectiveDpi} DPI` });
      else toast({ title: "Crop saved", description: body.reason ?? "Resolution after cropping is too low — crop less.", variant: belowFloor ? "destructive" : undefined });
      onSaved();
      onClose();
    } finally { setSaving(false); }
  };

  // The frame is aspect-locked to the SKU; the box height follows the master aspect so nothing distorts.
  const boxAspect = master.widthPx / master.heightPx;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-2xl w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-slate-800">Set crop · {product?.displayName ?? prodigiSku}</h3>
            <p className="text-xs text-slate-500">Position the frame over what should print. The original master is never changed.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div
          ref={boxRef}
          className="relative mx-auto bg-slate-100 overflow-hidden rounded select-none"
          style={{ width: "100%", maxWidth: 560, aspectRatio: `${boxAspect}` }}
        >
          <img
            src={`/api/admin/prints/${printId}/master-preview`}
            alt="master preview"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            onLoad={() => setPreviewOk(true)}
            onError={() => setPreviewOk(false)}
          />
          {previewOk === false && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">Preview unavailable</div>
          )}
          {/* The crop frame — everything OUTSIDE is dimmed via a huge box-shadow. */}
          <div
            role="button"
            aria-label="Crop frame — drag to reposition"
            onMouseDown={(e) => onDown(e.clientX, e.clientY)}
            className="absolute border-2 border-white cursor-move"
            style={{
              left: `${crop.x * 100}%`, top: `${crop.y * 100}%`,
              width: `${crop.w * 100}%`, height: `${crop.h * 100}%`,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
            }}
          >
            <div className="absolute inset-0 border border-black/30" />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <label className="text-xs text-slate-500 w-14">Zoom</label>
          <input type="range" min={0.3} max={1} step={0.01} value={scale} onChange={(e) => applyScale(Number(e.target.value))} className="flex-1" />
          <button onClick={() => { setScale(1); setCrop(maximal); }} className="text-slate-500 hover:text-slate-700 flex items-center gap-1 text-xs">
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className={`text-sm tabular-nums ${belowFloor ? "text-red-600" : "text-slate-600"}`}>
            {widthPx}×{heightPx}px cropped · <span className="font-medium">{effectiveDpi} DPI</span>
            {belowFloor ? ` · below the ${FLOOR_DPI} DPI floor — crop less` : ""}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={apply} disabled={saving} className="bg-deep-blue hover:bg-deep-blue/90">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Apply crop
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
