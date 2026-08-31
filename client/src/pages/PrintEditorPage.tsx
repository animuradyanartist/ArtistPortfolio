/**
 * PRINT EDITOR — the ONE page for creating AND editing a fine-art print, end to end.
 *
 * Fixes the old split (create-print / edit-print / variants / master) and the empty-edit bug (the old
 * page fetched the LIST via the default query fn instead of the single print). Here every section
 * hydrates from a proper single-record fetch, and the whole product — details, production master,
 * options, publish — is managed in place.
 *
 * Nothing bypasses the fail-closed rules: the readiness panel and the Publish action are both held to
 * the shared `printReadiness` gate, and Publish re-checks on the server. Prices are entered in dollars
 * and converted to minor units for the API; the production master is uploaded (never a pasted URL) and
 * is never exposed on a public page.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Upload, X, Plus, Trash2, Check, AlertTriangle, Loader2, Image as ImageIcon, FileUp } from "lucide-react";
import type { Print, Artwork } from "@shared/schema";
import {
  printReadiness,
  type PrintReadiness,
  type PrintVariantView,
  type PrintMasterView,
} from "@shared/commerce/printProduct";
import {
  PRODIGI_LAUNCH_PRODUCTS,
  MATERIAL_LABEL,
  productsForMaterial,
  getProdigiProduct,
  type PrintMaterial,
} from "@shared/commerce/prodigiProducts";

// ── snake_case API rows → shared camelCase shapes (for the readiness gate) ──
interface VariantApiRow {
  id: number; material: string; prodigi_sku: string; size_label: string; width_cm: number; height_cm: number;
  framed: boolean; frame_colour: string | null; retail_minor: number | null; currency: string;
  print_ready_asset_url: string | null; effective_dpi: number | null; min_dpi: number | null;
  eligible: boolean; enabled: boolean; prodigi_verified: boolean;
}
interface MasterApi {
  widthPx: number | null; heightPx: number | null; status: string;
  printReadyAssetUrl: string | null; note?: string | null;
  assetKey?: string | null; assetFilename?: string | null; contentType?: string | null;
  byteSize?: number | null; hasAsset?: boolean;
}
const toVariantView = (v: VariantApiRow, printId: number): PrintVariantView => ({
  id: v.id, printId, material: v.material, prodigiSku: v.prodigi_sku, sizeLabel: v.size_label,
  widthCm: v.width_cm, heightCm: v.height_cm, framed: v.framed, frameColour: v.frame_colour,
  retailMinor: v.retail_minor, currency: v.currency, printReadyAssetUrl: v.print_ready_asset_url,
  mockups: null, effectiveDpi: v.effective_dpi, eligible: v.eligible, enabled: v.enabled,
  prodigiVerified: v.prodigi_verified,
});
const toMasterView = (m: MasterApi | null): PrintMasterView | null =>
  m ? { status: (m.status as PrintMasterView["status"]) ?? "missing", widthPx: m.widthPx, heightPx: m.heightPx, printReadyAssetUrl: m.printReadyAssetUrl, checksumMd5: null } : null;

// ── money: dollars in the UI, minor units on the wire ──
const centsToUsd = (minor: number | null | undefined): string => (minor == null ? "" : (minor / 100).toString());
const usdToCents = (s: string): number | null => {
  const n = Number(String(s).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
};

const MATERIALS = Array.from(new Set(PRODIGI_LAUNCH_PRODUCTS.filter((p) => p.activeForLaunch).map((p) => p.material))) as PrintMaterial[];

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
const humanSize = (bytes?: number | null): string => {
  if (!bytes || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(mb >= 10 ? 0 : 1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

export default function PrintEditorPage() {
  const { id } = useParams<{ id?: string }>();
  const printId = id ? Number(id) : null;
  const isEdit = printId != null;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Product fields (source of truth for the details section)
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [artworkId, setArtworkId] = useState<number | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [status, setStatus] = useState("draft");
  const [savingProduct, setSavingProduct] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingMaster, setUploadingMaster] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const masterInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // ── EDIT hydration: fetch the SINGLE print (the old bug fetched the list). ──
  const { data: print, isLoading: printLoading } = useQuery<Print>({
    queryKey: [`/api/prints/${printId}?raw=1`],
    queryFn: async () => (await apiRequest("GET", `/api/prints/${printId}?raw=1`)).json(),
    enabled: isEdit,
  });

  const { data: artworks = [] } = useQuery<Artwork[]>({ queryKey: ["/api/artworks"] });

  // Variants (edit mode only, once we have a printId).
  const variantsKey = [`/api/admin/prints/${printId}/variants`];
  const { data: variantData } = useQuery<{ variants: VariantApiRow[]; master: MasterApi | null; artworkId: number | null }>({
    queryKey: variantsKey,
    queryFn: async () => (await apiRequest("GET", `/api/admin/prints/${printId}/variants`)).json(),
    enabled: isEdit,
  });

  // Master is keyed to the ARTWORK, not the print — so it loads (and can be uploaded) as soon as a
  // source artwork is chosen, before the print has ever been saved. Selecting a different artwork
  // immediately shows THAT artwork's saved master (filename / dimensions / eligibility) if one exists.
  const masterKey = ["/api/admin/prints/masters", artworkId];
  const { data: masterResp } = useQuery<{ master: MasterApi | null }>({
    queryKey: masterKey,
    queryFn: async () => (await apiRequest("GET", `/api/admin/prints/masters/${artworkId}`)).json(),
    enabled: artworkId != null,
  });

  // Hydrate the form once the print loads. THIS is what the old edit page failed to do.
  useEffect(() => {
    if (!print) return;
    setTitle(print.title ?? "");
    setSlug(print.slug ?? "");
    setDescription(print.description ?? "");
    setArtworkId(print.artworkId ?? null);
    setImages((print.images ?? []).filter((s) => s && s.trim() !== ""));
    setStatus(print.status ?? "draft");
  }, [print]);

  const variants = useMemo(
    () => (variantData?.variants ?? []).map((v) => toVariantView(v, printId ?? 0)),
    [variantData, printId],
  );
  const masterApi = masterResp?.master ?? null;
  const master = useMemo(() => toMasterView(masterApi), [masterApi]);

  const readiness: PrintReadiness = useMemo(
    () => printReadiness({ title, description, artworkId, imageCount: images.length, master, variants }, status),
    [title, description, artworkId, images.length, master, variants, status],
  );
  const isPublished = status === "active";

  const refetchVariants = () => qc.invalidateQueries({ queryKey: variantsKey });
  const refetchMaster = () => qc.invalidateQueries({ queryKey: masterKey });

  // ── Product save (create → then continue in edit mode; or update in place) ──
  const saveProduct = async (): Promise<number | null> => {
    if (!title.trim()) { toast({ title: "Add a print title first", variant: "destructive" }); return null; }
    if (!description.trim()) { toast({ title: "Add a description first", variant: "destructive" }); return null; }
    const body = {
      title: title.trim(),
      slug: slug.trim() || undefined,
      description: description.trim(),
      images: images.length ? images : [],
      artworkId: artworkId ?? undefined,
      // The commerce editor manages listing via Publish/Unpublish; keep the current status on save.
      status: isEdit ? status : "draft",
      availableSizes: print?.availableSizes ?? "[]",
      preferredMaterial: print?.preferredMaterial ?? "paper",
    };
    if (images.length === 0) { toast({ title: "Add at least one public image", variant: "destructive" }); return null; }
    setSavingProduct(true);
    try {
      if (isEdit) {
        await apiRequest("PUT", `/api/prints/${printId}`, body);
        qc.invalidateQueries({ queryKey: [`/api/prints/${printId}?raw=1`] });
        qc.invalidateQueries({ queryKey: ["/api/admin/prints/overview"] });
        toast({ title: "Saved" });
        return printId!;
      } else {
        const created = await (await apiRequest("POST", "/api/prints", body)).json();
        qc.invalidateQueries({ queryKey: ["/api/admin/prints/overview"] });
        toast({ title: "Saved", description: "You can now add print options below." });
        setLocation(`/admin/edit-print/${created.id}`); // continue in the SAME editor, now with an id
        return created.id as number;
      }
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? "Please try again", variant: "destructive" });
      return null;
    } finally {
      setSavingProduct(false);
    }
  };

  // ── Public image upload (base64, storefront-facing) ──
  const onPickImage = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast({ title: "Please choose an image file", variant: "destructive" }); return; }
    setUploadingImage(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      setImages((prev) => [...prev, dataUrl]);
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  // ── Master upload — STREAMED multipart (no base64, no JSON body limit). The server measures the
  //    pixels, stores the file on the persistent disk, and returns the metadata. ──
  //    Works as soon as an artwork is selected — the master belongs to the artwork, not the print,
  //    so no saved Print record is needed to upload it.
  const onPickMaster = async (file?: File) => {
    if (!file || artworkId == null) return;
    if (!file.type.startsWith("image/")) { toast({ title: "Please choose an image file", variant: "destructive" }); return; }
    setUploadingMaster(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/admin/prints/masters/${artworkId}/file`, { method: "POST", credentials: "include", body: fd });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { toast({ title: "Could not upload the master", description: body.message, variant: "destructive" }); return; }
      const m = body.master;
      qc.setQueryData(masterKey, { master: m }); // show it immediately
      refetchMaster();
      if (isEdit) refetchVariants(); // variant eligibility depends on the master
      toast({
        title: m?.status === "ready" ? "Master uploaded — resolution is eligible" : "Master uploaded",
        description: m?.status === "ready"
          ? `${m.widthPx}×${m.heightPx}px · fits ${body.eligibleSizeCount} size${body.eligibleSizeCount === 1 ? "" : "s"}`
          : `${m?.widthPx}×${m?.heightPx}px · resolution too low to print at the offered sizes`,
      });
    } catch (e: any) {
      toast({ title: "Could not upload the master", description: e?.message, variant: "destructive" });
    } finally {
      setUploadingMaster(false);
      if (masterInputRef.current) masterInputRef.current.value = "";
    }
  };
  const removeMaster = async () => {
    if (artworkId == null) return;
    await apiRequest("DELETE", `/api/admin/prints/masters/${artworkId}/file`);
    qc.setQueryData(masterKey, { master: null });
    refetchMaster();
    if (isEdit) refetchVariants();
    toast({ title: "Master removed" });
  };

  // ── Publish / Unpublish ──
  const publish = async () => {
    if (!isEdit) return;
    setPublishing(true);
    try {
      const r = await fetch(`/api/admin/prints/${printId}/publish`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast({
          title: "Cannot publish yet",
          description: (body.missing ?? []).map((m: string) => `• ${m}`).join("\n") || body.message,
          variant: "destructive",
        });
        return;
      }
      setStatus("active");
      qc.invalidateQueries({ queryKey: ["/api/admin/prints/overview"] });
      qc.invalidateQueries({ queryKey: ["/api/commerce/prints"] });
      toast({ title: "Print published", description: "It is now live on /prints." });
    } finally {
      setPublishing(false);
    }
  };
  const unpublish = async () => {
    if (!isEdit) return;
    await apiRequest("POST", `/api/admin/prints/${printId}/unpublish`);
    setStatus("draft");
    qc.invalidateQueries({ queryKey: ["/api/admin/prints/overview"] });
    qc.invalidateQueries({ queryKey: ["/api/commerce/prints"] });
    toast({ title: "Unpublished", description: "Hidden from /prints; still in your admin list." });
  };

  if (isEdit && printLoading) {
    return <Shell><div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading print…</div></Shell>;
  }

  return (
    <Shell>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <button onClick={() => setLocation("/admin")} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-2">
            <ArrowLeft className="w-4 h-4" /> Back to Prints
          </button>
          <h1 className="font-playfair text-3xl text-deep-blue">{isEdit ? title || "Edit print" : "New print"}</h1>
          <p className="text-sm text-slate-500 mt-1">Create, configure and publish a fine-art print — all on one page.</p>
        </div>
        <StatePill state={readiness.state} />
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-8 items-start">
        <div className="space-y-6">
          {/* ── SECTION A — details ── */}
          <Section title="Print details" letter="A">
            <Field label="Source original artwork" hint="The painting this print reproduces. Its high-resolution master lives here.">
              <Select value={artworkId != null ? String(artworkId) : "none"} onValueChange={(v) => setArtworkId(v === "none" ? null : Number(v))}>
                <SelectTrigger><SelectValue placeholder="Choose an artwork" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No source artwork yet</SelectItem>
                  {artworks.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Print title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. A Sign in the Distance" />
            </Field>
            <Field label="Web address (slug)" hint="Leave blank to generate it from the title.">
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="a-sign-in-the-distance" />
            </Field>
            <Field label="Description">
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="A short description shown on the print page." />
            </Field>
            <Field label="Public storefront images" hint="Shown on /prints. The production master (Section B) is separate and never shown publicly.">
              <div className="flex flex-wrap gap-3">
                {images.map((img, i) => (
                  <div key={i} className="relative w-24 h-24 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                    <img src={img} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => setImages(images.filter((_, x) => x !== i))} className="absolute top-1 right-1 bg-white/90 rounded-full p-0.5 text-slate-700 hover:text-red-600" aria-label="Remove image">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button onClick={() => imageInputRef.current?.click()} disabled={uploadingImage}
                  className="w-24 h-24 rounded-lg border border-dashed border-slate-300 grid place-items-center text-slate-400 hover:border-slate-500 hover:text-slate-600">
                  {uploadingImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <div className="text-center"><ImageIcon className="w-5 h-5 mx-auto" /><span className="text-[10px]">Add</span></div>}
                </button>
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0])} />
              </div>
            </Field>
          </Section>

          {/* ── SECTION B — production master. Available as soon as a source artwork is chosen (the
                master belongs to the artwork, not the print), so it does NOT wait for Save. ── */}
          <Section title="Production file" letter="B">
            {artworkId == null ? (
              <LockNote>Select the source artwork first.</LockNote>
            ) : (
              <MasterPanel master={masterApi}
                uploading={uploadingMaster}
                onUpload={() => masterInputRef.current?.click()}
                onRemove={removeMaster} />
            )}
            <input ref={masterInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPickMaster(e.target.files?.[0])} />
            <p className="text-xs text-slate-400 mt-3">The high-resolution file is used only for printing and is never shown on the public print page.</p>
          </Section>

          {/* ── SECTION C — options / variants ── */}
          <Section title="Print options" letter="C">
            {!isEdit ? (
              <LockNote>Save the print first, then add material + size options here.</LockNote>
            ) : (
              <>
                <div className="space-y-2 mb-4">
                  {variants.length === 0 && <p className="text-sm text-slate-500">No options yet. Add a material and size below.</p>}
                  {variants.map((v) => (
                    <VariantRow key={v.id} v={v} printId={printId!} master={master} onChanged={refetchVariants} />
                  ))}
                </div>
                <AddOption printId={printId!} onAdded={refetchVariants} />
              </>
            )}
          </Section>
        </div>

        {/* ── Right rail: readiness + actions ── */}
        <div className="lg:sticky lg:top-6 space-y-4">
          <Section title="Print readiness" letter="D" compact>
            <ul className="space-y-1.5">
              {readiness.checks.map((c) => (
                <li key={c.key} className="flex items-start gap-2 text-sm">
                  {c.ok
                    ? <Check className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                    : <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />}
                  <span className={c.ok ? "text-slate-700" : "text-slate-500"}>
                    {c.label}
                    {!c.ok && <span className="block text-xs text-amber-600">{c.hint}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
            <Button onClick={saveProduct} disabled={savingProduct} variant="outline" className="w-full">
              {savingProduct ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save
            </Button>
            {isEdit && !isPublished && (
              <Button onClick={publish} disabled={publishing || !readiness.canPublish} className="w-full bg-deep-blue hover:bg-deep-blue/90"
                title={readiness.canPublish ? "" : "Complete the readiness checklist first"}>
                {publishing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Publish print
              </Button>
            )}
            {isEdit && isPublished && (
              <Button onClick={unpublish} variant="outline" className="w-full text-amber-700 border-amber-300 hover:bg-amber-50">
                Unpublish
              </Button>
            )}
            {isEdit && !isPublished && !readiness.canPublish && (
              <p className="text-xs text-slate-400 text-center">Publish unlocks when every readiness check passes.</p>
            )}
            {isPublished && <p className="text-xs text-green-600 text-center">Live on /prints.</p>}
          </div>
        </div>
      </div>
    </Shell>
  );
}

// ── Master panel ──
function MasterPanel({ master, uploading, onUpload, onRemove }: {
  master: MasterApi | null; uploading: boolean; onUpload: () => void; onRemove: () => void;
}) {
  const has = master && (master.hasAsset || master.printReadyAssetUrl);
  if (!has) {
    return (
      <button onClick={onUpload} disabled={uploading}
        className="w-full rounded-lg border border-dashed border-slate-300 py-8 grid place-items-center text-slate-500 hover:border-slate-500">
        {uploading ? <><Loader2 className="w-5 h-5 animate-spin mb-1" /> Uploading…</>
          : <><FileUp className="w-6 h-6 mb-1" /><span className="text-sm">Upload high-resolution print file</span><span className="text-xs text-slate-400">JPG or PNG, full resolution</span></>}
      </button>
    );
  }
  const ready = master!.status === "ready";
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-800 truncate">{master!.assetFilename || "Master file"}</p>
          <p className="text-sm text-slate-500 tabular-nums">
            {master!.widthPx}×{master!.heightPx}px{humanSize(master!.byteSize) ? ` · ${humanSize(master!.byteSize)}` : ""}
          </p>
          <div className="mt-2">
            {ready
              ? <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100"><Check className="w-3 h-3 mr-1" /> Resolution eligible</Badge>
              : <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100"><AlertTriangle className="w-3 h-3 mr-1" /> Resolution too low to print</Badge>}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <Button size="sm" variant="outline" onClick={onUpload} disabled={uploading}>{uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Replace"}</Button>
          <Button size="sm" variant="ghost" onClick={onRemove} className="text-red-600"><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  );
}

// ── One existing variant row ──
function VariantRow({ v, printId, master, onChanged }: {
  v: PrintVariantView; printId: number; master: PrintMasterView | null; onChanged: () => void;
}) {
  const { toast } = useToast();
  const [price, setPrice] = useState(centsToUsd(v.retailMinor));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPrice(centsToUsd(v.retailMinor)); }, [v.retailMinor]);

  const save = async (patch: { price?: string; enabled?: boolean }) => {
    const cents = usdToCents(patch.price ?? price);
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/prints/variants/${v.id}`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: v.prodigiSku, framed: v.framed, frameColour: v.frameColour, retailMinor: cents, currency: "USD", enabled: patch.enabled ?? v.enabled }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { toast({ title: body.message ?? "Could not update option", description: body.errors?.enabled, variant: "destructive" }); return; }
      onChanged();
    } finally { setBusy(false); }
  };
  const del = async () => { await apiRequest("DELETE", `/api/admin/prints/variants/${v.id}`); onChanged(); };

  const canEnable = v.eligible && (v.retailMinor ?? 0) > 0 && !!(v.printReadyAssetUrl || master?.printReadyAssetUrl);
  return (
    <div className="flex items-center gap-3 flex-wrap rounded-lg border border-slate-200 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-800">{MATERIAL_LABEL[v.material as PrintMaterial] ?? v.material}</p>
        <p className="text-xs text-slate-500">{v.sizeLabel}{v.effectiveDpi ? ` · ${v.effectiveDpi} DPI` : ""}</p>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400 text-sm">$</span>
        <Input value={price} onChange={(e) => setPrice(e.target.value)} onBlur={() => price !== centsToUsd(v.retailMinor) && save({})}
          inputMode="decimal" className="w-20 h-8" placeholder="120" />
      </div>
      <label className={`flex items-center gap-1.5 text-sm ${canEnable ? "text-slate-700" : "text-slate-400"}`}
        title={canEnable ? "" : "Needs a ready master, a price and an eligible size"}>
        <input type="checkbox" checked={v.enabled} disabled={busy || (!v.enabled && !canEnable)} onChange={(e) => save({ enabled: e.target.checked })} />
        {v.enabled ? "Enabled" : "Enable"}
      </label>
      {v.eligible
        ? <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100">Eligible</Badge>
        : <Badge variant="secondary" className="bg-slate-100 text-slate-500 hover:bg-slate-100">Not eligible</Badge>}
      <button onClick={del} className="text-red-600 hover:text-red-700" aria-label="Delete option"><Trash2 className="w-4 h-4" /></button>
    </div>
  );
}

// ── Add a new option (material + size → SKU resolved behind the scenes) ──
function AddOption({ printId, onAdded }: { printId: number; onAdded: () => void }) {
  const { toast } = useToast();
  const [material, setMaterial] = useState<PrintMaterial | "">("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const sizes = material ? productsForMaterial(material) : [];

  const add = async () => {
    if (!sku) { toast({ title: "Choose a material and size", variant: "destructive" }); return; }
    const cents = usdToCents(price);
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/prints/${printId}/variants`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, retailMinor: cents, currency: "USD", framed: false, enabled: false }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { toast({ title: body.message ?? "Could not add option", description: body.errors?.sku, variant: "destructive" }); return; }
      setMaterial(""); setSku(""); setPrice("");
      onAdded();
      toast({ title: "Option added" });
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-3">
      <p className="text-sm font-medium text-slate-700 mb-3">Add an option</p>
      <div className="grid sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
        <LabeledMini label="Material">
          <Select value={material} onValueChange={(v) => { setMaterial(v as PrintMaterial); setSku(""); }}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Choose" /></SelectTrigger>
            <SelectContent>{MATERIALS.map((m) => <SelectItem key={m} value={m}>{MATERIAL_LABEL[m]}</SelectItem>)}</SelectContent>
          </Select>
        </LabeledMini>
        <LabeledMini label="Size">
          <Select value={sku} onValueChange={setSku} disabled={!material}>
            <SelectTrigger className="h-9"><SelectValue placeholder={material ? "Choose" : "Pick material first"} /></SelectTrigger>
            <SelectContent>{sizes.map((s) => <SelectItem key={s.sku} value={s.sku}>{s.displayName}</SelectItem>)}</SelectContent>
          </Select>
        </LabeledMini>
        <LabeledMini label="Price (USD)">
          <div className="flex items-center gap-1"><span className="text-slate-400 text-sm">$</span>
            <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="120" className="w-24 h-9" /></div>
        </LabeledMini>
        <Button onClick={add} disabled={busy || !sku} className="h-9 bg-deep-blue hover:bg-deep-blue/90"><Plus className="w-4 h-4 mr-1" /> Add</Button>
      </div>
      {sku && <p className="text-[11px] text-slate-400 mt-2">Prodigi product: <code>{getProdigiProduct(sku)?.sku}</code> (resolved automatically)</p>}
    </div>
  );
}

// ── small presentational helpers ──
function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50"><div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</div></div>;
}
function Section({ title, letter, compact, children }: { title: string; letter: string; compact?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100">
        <span className="w-6 h-6 rounded-full bg-deep-blue/10 text-deep-blue grid place-items-center text-xs font-semibold">{letter}</span>
        <h2 className="font-medium text-slate-800">{title}</h2>
      </div>
      <div className={compact ? "p-4" : "p-4 space-y-4"}>{children}</div>
    </div>
  );
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}
function LabeledMini({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-[11px] uppercase tracking-wide text-slate-400 mb-1">{label}</label>{children}</div>;
}
function LockNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">{children}</p>;
}
function StatePill({ state }: { state: string }) {
  const meta: Record<string, { label: string; cls: string }> = {
    draft: { label: "Draft", cls: "bg-gray-100 text-gray-700" },
    "not-ready": { label: "Not ready", cls: "bg-amber-100 text-amber-800" },
    ready: { label: "Ready to publish", cls: "bg-blue-100 text-blue-800" },
    published: { label: "Published", cls: "bg-green-100 text-green-700" },
  };
  const m = meta[state] ?? meta.draft;
  return <span className={`px-3 py-1 rounded-full text-sm font-medium ${m.cls}`}>{m.label}</span>;
}
