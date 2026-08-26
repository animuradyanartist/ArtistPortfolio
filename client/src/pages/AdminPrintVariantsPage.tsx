/**
 * ADMIN — PRINT VARIANTS + MASTER.
 *
 * The admin manages a print product's sellable variants and the artwork master behind them. The
 * SKU is CHOSEN from the verified Prodigi catalogue (never typed), and the server derives every
 * physical fact (material, size, pixels, DPI, eligibility). A variant can only be enabled for sale
 * when it is genuinely sellable; framed variants are architected but not yet enable-able (framed
 * SKUs are unverified).
 */
import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface CatalogueProduct {
  sku: string; material: string; displayName: string;
  widthCm: number; heightCm: number; printAreaWidthPx: number; printAreaHeightPx: number; substrateGsm: number;
}
interface Master {
  widthPx: number | null; heightPx: number | null; status: string; printReadyAssetUrl: string | null; note?: string | null;
}
interface Variant {
  id: number; material: string; prodigi_sku: string; size_label: string; framed: boolean; frame_colour: string | null;
  retail_minor: number | null; currency: string; print_ready_asset_url: string | null;
  effective_dpi: number | null; min_dpi: number | null; eligible: boolean; enabled: boolean; prodigi_verified: boolean;
}

const inputCls = "w-full border border-stone-300 rounded px-2 py-1.5 text-sm focus:border-stone-800 focus:outline-none";

export default function AdminPrintVariantsPage() {
  const { id } = useParams();
  const printId = Number(id);
  const qc = useQueryClient();
  const key = ["/api/admin/prints", printId, "variants"];

  const { data, isLoading } = useQuery<{ variants: Variant[]; master: Master | null; artworkId: number | null }>({
    queryKey: key,
    queryFn: async () => (await apiRequest("GET", `/api/admin/prints/${printId}/variants`)).json(),
  });
  const { data: cat } = useQuery<{ products: CatalogueProduct[] }>({
    queryKey: ["/api/admin/prints/catalogue"],
    queryFn: async () => (await apiRequest("GET", `/api/admin/prints/catalogue`)).json(),
  });

  const done = () => qc.invalidateQueries({ queryKey: key });
  const products = cat?.products ?? [];
  const master = data?.master ?? null;
  const artworkId = data?.artworkId ?? null;

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <Link href={`/admin/edit-print/${printId}`}><a className="text-sm text-stone-500 border-b border-stone-300">← Back to print</a></Link>
        <h1 className="text-2xl font-semibold text-stone-900 mt-3 mb-1">Print variants</h1>
        <p className="text-sm text-stone-500 mb-8">Sizes come from the sandbox-verified Prodigi catalogue. Nothing sells until it has a ready master, an eligible size, a price and an asset.</p>

        {artworkId != null && <MasterCard artworkId={artworkId} master={master} onSaved={done} />}

        {isLoading ? <p className="text-stone-500 mt-8">Loading…</p> : (
          <div className="mt-8">
            <h2 className="text-lg font-medium text-stone-900 mb-3">Variants</h2>
            <div className="space-y-2 mb-6">
              {(data?.variants ?? []).length === 0 && <p className="text-sm text-stone-500">No variants yet.</p>}
              {(data?.variants ?? []).map((v) => (
                <VariantRow key={v.id} v={v} onDeleted={done} onSaved={done} products={products} />
              ))}
            </div>
            <VariantForm printId={printId} products={products} onSaved={done} />
          </div>
        )}
      </div>
    </div>
  );
}

function MasterCard({ artworkId, master, onSaved }: { artworkId: number; master: Master | null; onSaved: () => void }) {
  const { toast } = useToast();
  const [widthPx, setWidthPx] = useState(master?.widthPx ? String(master.widthPx) : "");
  const [heightPx, setHeightPx] = useState(master?.heightPx ? String(master.heightPx) : "");
  const [url, setUrl] = useState(master?.printReadyAssetUrl ?? "");
  const [status, setStatus] = useState(master?.status ?? "missing");
  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", `/api/admin/prints/masters/${artworkId}`, {
      widthPx: widthPx || null, heightPx: heightPx || null, printReadyAssetUrl: url || null, status,
    })).json(),
    onSuccess: () => { onSaved(); toast({ title: "Master saved" }); },
    onError: (e: Error) => toast({ title: "Couldn't save master", description: e.message, variant: "destructive" }),
  });
  return (
    <div className="border border-stone-200 rounded-lg bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-medium text-stone-900">High-res master</h2>
        <span className={`text-[11px] uppercase tracking-wide px-2 py-0.5 rounded ${master?.status === "ready" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{master?.status ?? "missing"}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-stone-600">Width px<input className={inputCls} value={widthPx} onChange={(e) => setWidthPx(e.target.value)} inputMode="numeric" /></label>
        <label className="text-sm text-stone-600">Height px<input className={inputCls} value={heightPx} onChange={(e) => setHeightPx(e.target.value)} inputMode="numeric" /></label>
        <label className="text-sm text-stone-600 sm:col-span-2">Print-ready asset URL (HTTPS)<input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></label>
        <label className="text-sm text-stone-600">Status
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="missing">missing</option><option value="provisional">provisional</option><option value="ready">ready</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-stone-500 mt-2">Only a <strong>ready</strong> master (real pixels + HTTPS asset) makes variants eligible. Current web images are not masters.</p>
      <button onClick={() => save.mutate()} disabled={save.isPending} className="mt-3 bg-stone-900 text-white text-sm px-4 py-2 rounded disabled:opacity-50">Save master</button>
    </div>
  );
}

function money(minor: number | null, currency: string) {
  if (minor == null) return "—";
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100); } catch { return `${(minor / 100).toFixed(2)} ${currency}`; }
}

function VariantRow({ v, onDeleted }: { v: Variant; onDeleted: () => void; onSaved: () => void; products: CatalogueProduct[] }) {
  const { toast } = useToast();
  const del = useMutation({
    mutationFn: async () => { await apiRequest("DELETE", `/api/admin/prints/variants/${v.id}`); },
    onSuccess: () => { onDeleted(); toast({ title: "Variant deleted" }); },
    onError: (e: Error) => toast({ title: "Couldn't delete", description: e.message, variant: "destructive" }),
  });
  return (
    <div className="border border-stone-200 rounded bg-white px-4 py-3 flex items-center justify-between gap-4 text-sm">
      <div className="min-w-0">
        <div className="font-medium text-stone-900 truncate">{v.prodigi_sku} · {v.size_label}</div>
        <div className="text-stone-500 text-xs">
          {v.material} · {v.framed ? `framed (${v.frame_colour ?? "natural"})` : "unframed"} · {money(v.retail_minor, v.currency)}
          {v.effective_dpi != null && ` · ${v.effective_dpi} DPI`}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${v.eligible ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>{v.eligible ? "eligible" : "not eligible"}</span>
        <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${v.enabled ? "bg-emerald-600 text-white" : "bg-stone-100 text-stone-500"}`}>{v.enabled ? "enabled" : "disabled"}</span>
        <button onClick={() => { if (window.confirm("Delete this variant?")) del.mutate(); }} className="text-red-600 text-xs border border-red-200 rounded px-2 py-1">Delete</button>
      </div>
    </div>
  );
}

function VariantForm({ printId, products, onSaved }: { printId: number; products: CatalogueProduct[]; onSaved: () => void }) {
  const { toast } = useToast();
  const [sku, setSku] = useState("");
  const [retailMinor, setRetailMinor] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [framed, setFramed] = useState(false);
  const [frameColour, setFrameColour] = useState("natural");
  const [asset, setAsset] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const product = products.find((p) => p.sku === sku);

  const create = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/prints/${printId}/variants`, {
        sku, retailMinor: retailMinor || null, currency, framed, frameColour: framed ? frameColour : null,
        printReadyAssetUrl: asset || null, enabled,
      });
      return r.json();
    },
    onSuccess: () => { setErrors({}); setSku(""); setRetailMinor(""); setAsset(""); setEnabled(false); setFramed(false); onSaved(); toast({ title: "Variant added" }); },
    onError: async (e: any) => {
      // apiRequest throws "status: body"; try to surface field errors
      try { const m = String(e.message); const body = JSON.parse(m.slice(m.indexOf("{"))); if (body.errors) setErrors(body.errors); toast({ title: body.message ?? "Couldn't add", variant: "destructive" }); }
      catch { toast({ title: "Couldn't add variant", description: e.message, variant: "destructive" }); }
    },
  });

  return (
    <div className="border border-dashed border-stone-300 rounded-lg bg-white p-5">
      <h3 className="text-sm font-medium text-stone-900 mb-3">Add a variant</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-stone-600 sm:col-span-2">Verified Prodigi SKU
          <select className={inputCls} value={sku} onChange={(e) => setSku(e.target.value)}>
            <option value="">— choose a verified size —</option>
            {products.map((p) => <option key={p.sku} value={p.sku}>{p.material} · {p.displayName} · {p.sku}</option>)}
          </select>
          {errors.sku && <span className="text-xs text-red-600">{errors.sku}</span>}
        </label>
        {product && (
          <p className="text-xs text-stone-500 sm:col-span-2 -mt-1">
            Print area {product.printAreaWidthPx}×{product.printAreaHeightPx}px · {product.substrateGsm}gsm — physical fields are derived by the server.
          </p>
        )}
        <label className="text-sm text-stone-600">Price (minor units)<input className={inputCls} value={retailMinor} onChange={(e) => setRetailMinor(e.target.value)} inputMode="numeric" placeholder="6500" />{errors.retailMinor && <span className="text-xs text-red-600">{errors.retailMinor}</span>}</label>
        <label className="text-sm text-stone-600">Currency<input className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} /></label>
        <label className="text-sm text-stone-600 sm:col-span-2">Print-ready asset URL (HTTPS)<input className={inputCls} value={asset} onChange={(e) => setAsset(e.target.value)} placeholder="https://…" />{errors.printReadyAssetUrl && <span className="text-xs text-red-600">{errors.printReadyAssetUrl}</span>}</label>
        <label className="flex items-center gap-2 text-sm text-stone-600"><input type="checkbox" checked={framed} onChange={(e) => setFramed(e.target.checked)} /> Framed</label>
        {framed && (
          <label className="text-sm text-stone-600">Frame colour
            <select className={inputCls} value={frameColour} onChange={(e) => setFrameColour(e.target.value)}>
              <option value="natural">natural</option><option value="black">black</option><option value="white">white</option>
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-stone-600 sm:col-span-2"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enable for sale (only if eligible + priced + asset, unframed)</label>
        {errors.enabled && <span className="text-xs text-red-600 sm:col-span-2 -mt-2">{errors.enabled}</span>}
        {errors.frameColour && <span className="text-xs text-red-600 sm:col-span-2 -mt-2">{errors.frameColour}</span>}
      </div>
      <button onClick={() => create.mutate()} disabled={create.isPending || !sku} className="mt-3 bg-stone-900 text-white text-sm px-4 py-2 rounded disabled:opacity-50">Add variant</button>
    </div>
  );
}
