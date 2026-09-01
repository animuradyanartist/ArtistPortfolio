/**
 * PROMO CODES — the owner's side. Create, edit, activate/deactivate and (only when never used)
 * delete discount codes. The customer-facing validation + discount maths live server-side; this is
 * just the management surface, and it mirrors the Articles editor's shape (list · inline form ·
 * confirm dialog) so it reads like the rest of the admin.
 *
 * Amounts: a FIXED code is entered in whole currency (e.g. 10.00) and stored in minor units; a
 * PERCENTAGE is a plain 1–100 and carries no currency. The server is the final authority on both.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatMoney, type Currency } from "@shared/commerce/money";
import { STORE_CURRENCIES } from "@shared/commerce/promo";
import type { PromoCode } from "@shared/schema";
import { Plus, Edit, Trash, Power, PowerOff } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface Draft {
  id?: number;
  code: string;
  discountType: "percentage" | "fixed";
  /** As typed: a plain percent for percentage, or whole currency (e.g. "10.00") for fixed. */
  amount: string;
  currency: string;
  appliesTo: "all" | "originals" | "prints";
  active: boolean;
  validFrom: string; // yyyy-mm-dd or ""
  expiresAt: string;
}

const EMPTY: Draft = {
  code: "", discountType: "percentage", amount: "", currency: "EUR",
  appliesTo: "all", active: true, validFrom: "", expiresAt: "",
};

const FIELD = "w-full border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400";

function when(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function valueLabel(p: PromoCode): string {
  return p.discountType === "percentage"
    ? `${p.discountValue}%`
    : formatMoney(p.discountValue, (p.currency ?? "EUR") as Currency);
}

function toDraft(p: PromoCode): Draft {
  return {
    id: p.id,
    code: p.code,
    discountType: p.discountType === "fixed" ? "fixed" : "percentage",
    amount: p.discountType === "fixed" ? (p.discountValue / 100).toFixed(2) : String(p.discountValue),
    currency: p.currency ?? "EUR",
    appliesTo: (p.appliesTo as Draft["appliesTo"]) ?? "all",
    active: p.active,
    validFrom: p.validFrom ? new Date(p.validFrom).toISOString().slice(0, 10) : "",
    expiresAt: p.expiresAt ? new Date(p.expiresAt).toISOString().slice(0, 10) : "",
  };
}

/** Turn a draft into the API payload — converting a fixed amount from whole currency to minor units. */
function toPayload(d: Draft) {
  const discountValue = d.discountType === "fixed"
    ? Math.round(parseFloat(d.amount || "0") * 100)
    : parseInt(d.amount || "0", 10);
  return {
    code: d.code.trim(),
    discountType: d.discountType,
    discountValue,
    currency: d.discountType === "fixed" ? d.currency : null,
    appliesTo: d.appliesTo,
    active: d.active,
    validFrom: d.validFrom || null,
    expiresAt: d.expiresAt || null,
  };
}

export default function AdminPromoCodes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<PromoCode | null>(null);

  const { data: codes = [], isLoading } = useQuery<PromoCode[]>({ queryKey: ["/api/admin/promo-codes"] });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
  const fail = (e: Error, what: string) => toast({ title: what, description: e.message, variant: "destructive" });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const res = await fetch(d.id ? `/api/admin/promo-codes/${d.id}` : "/api/admin/promo-codes", {
        method: d.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(toPayload(d)),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(body.message ?? "Could not save"), { fieldErrors: body.errors });
      return body as PromoCode;
    },
    onSuccess: () => { refresh(); setEditing(null); setErrors({}); toast({ title: "Saved" }); },
    onError: (e: Error & { fieldErrors?: Record<string, string> }) => {
      if (e.fieldErrors) setErrors(e.fieldErrors);
      fail(e, "Could not save");
    },
  });

  const setActive = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) =>
      apiRequest("POST", `/api/admin/promo-codes/${id}/active`, { active }),
    onSuccess: (_r, v) => { refresh(); toast({ title: v.active ? "Activated" : "Deactivated" }); },
    onError: (e: Error) => fail(e, "Could not change status"),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/promo-codes/${id}`),
    onSuccess: () => { refresh(); setConfirmDelete(null); toast({ title: "Deleted" }); },
    // A used code returns 409 "deactivate instead" — surface that and offer the deactivate.
    onError: (e: Error) => { setConfirmDelete(null); fail(e, "Could not delete"); },
  });

  // ── Editor ──────────────────────────────────────────────────────────────
  if (editing) {
    return (
      <PromoForm
        draft={editing}
        errors={errors}
        saving={save.isPending}
        onChange={setEditing}
        onCancel={() => { setEditing(null); setErrors({}); }}
        onSave={() => save.mutate(editing)}
      />
    );
  }

  // ── List ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <Card className="border-slate-200/50 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Promo codes</CardTitle>
          <Button onClick={() => { setErrors({}); setEditing({ ...EMPTY }); }}><Plus className="w-4 h-4 mr-1" /> New promo code</Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-slate-500 py-8 text-center">Loading…</p>
          ) : codes.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-600 mb-1">No promo codes yet.</p>
              <p className="text-sm text-slate-500">Create one to offer a discount at checkout.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-3">Code</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Value</th>
                    <th className="py-2 pr-3">Applies to</th>
                    <th className="py-2 pr-3">Active</th>
                    <th className="py-2 pr-3">Valid from</th>
                    <th className="py-2 pr-3">Expires</th>
                    <th className="py-2 pr-3">Created</th>
                    <th className="py-2 pr-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {codes.map((p) => (
                    <tr key={p.id} className="text-slate-700">
                      <td className="py-3 pr-3 font-medium text-slate-900">{p.code}</td>
                      <td className="py-3 pr-3 capitalize">{p.discountType}</td>
                      <td className="py-3 pr-3 tabular-nums">{valueLabel(p)}</td>
                      <td className="py-3 pr-3 capitalize">{p.appliesTo}</td>
                      <td className="py-3 pr-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${p.active ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>
                          {p.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-3 pr-3">{when(p.validFrom)}</td>
                      <td className="py-3 pr-3">{when(p.expiresAt)}</td>
                      <td className="py-3 pr-3">{when(p.createdAt)}</td>
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button size="sm" variant="ghost" title="Edit" onClick={() => { setErrors({}); setEditing(toDraft(p)); }}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          {p.active ? (
                            <Button size="sm" variant="ghost" title="Deactivate" onClick={() => setActive.mutate({ id: p.id, active: false })} disabled={setActive.isPending}>
                              <PowerOff className="w-4 h-4 text-amber-600" />
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" title="Activate" onClick={() => setActive.mutate({ id: p.id, active: true })} disabled={setActive.isPending}>
                              <Power className="w-4 h-4 text-green-600" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" title="Delete" onClick={() => setConfirmDelete(p)}>
                            <Trash className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirmDelete?.code}”?</AlertDialogTitle>
            <AlertDialogDescription>
              A code that has been used on an order can’t be deleted (its discount is part of that order’s
              history) — deactivating it is preferred. If it has never been used, this removes it permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => confirmDelete && remove.mutate(confirmDelete.id)}>
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * The create/edit form. Exported and presentational (state lives in the parent) so a test can render
 * it directly and assert every field the spec requires is present.
 */
export function PromoForm({ draft, errors, saving, onChange, onCancel, onSave }: {
  draft: Draft;
  errors: Record<string, string>;
  saving: boolean;
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const d = draft;
  const set = (patch: Partial<Draft>) => onChange({ ...d, ...patch });
  const err = (k: string) => errors[k] ? <p className="text-xs text-red-600 mt-1">{errors[k]}</p> : null;
  return (
    <Card className="border-slate-200/50 shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{d.id ? "Edit promo code" : "New promo code"}</CardTitle>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </CardHeader>
      <CardContent className="space-y-4 max-w-lg">
        <div>
          <label className="text-sm font-medium text-slate-700">Code</label>
          <Input value={d.code} onChange={(e) => set({ code: e.target.value })} placeholder="SAVE10" autoCapitalize="characters" />
          <p className="text-xs text-slate-500 mt-1">Customers can type it in any case — SAVE10, save10 and “ save10 ” all match.</p>
          {err("code")}
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Discount type</label>
          <select className={FIELD} value={d.discountType}
            onChange={(e) => set({ discountType: e.target.value as Draft["discountType"] })}>
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed amount</option>
          </select>
          {err("discountType")}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700">{d.discountType === "percentage" ? "Percent (1–100)" : "Amount"}</label>
            <Input value={d.amount} onChange={(e) => set({ amount: e.target.value })}
              inputMode="decimal" placeholder={d.discountType === "percentage" ? "10" : "10.00"} />
            {err("discountValue")}
          </div>
          {d.discountType === "fixed" && (
            <div>
              <label className="text-sm font-medium text-slate-700">Currency</label>
              <select className={FIELD} value={d.currency} onChange={(e) => set({ currency: e.target.value })}>
                {STORE_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {err("currency")}
            </div>
          )}
        </div>
        {d.discountType === "fixed" && (
          <p className="text-xs text-slate-500 -mt-2">Only applies to orders in this currency (originals are EUR, prints may be USD).</p>
        )}
        <div>
          <label className="text-sm font-medium text-slate-700">Applies to</label>
          <select className={FIELD} value={d.appliesTo} onChange={(e) => set({ appliesTo: e.target.value as Draft["appliesTo"] })}>
            <option value="all">All products</option>
            <option value="originals">Originals only</option>
            <option value="prints">Prints only</option>
          </select>
          {err("appliesTo")}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Valid from <span className="text-slate-400 font-normal">(optional)</span></label>
            <Input type="date" value={d.validFrom} onChange={(e) => set({ validFrom: e.target.value })} />
            {err("validFrom")}
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Expires <span className="text-slate-400 font-normal">(optional)</span></label>
            <Input type="date" value={d.expiresAt} onChange={(e) => set({ expiresAt: e.target.value })} />
            {err("expiresAt")}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={d.active} onChange={(e) => set({ active: e.target.checked })} />
          Active
        </label>
        <div className="flex gap-2 pt-2">
          <Button onClick={onSave} disabled={saving || !d.code.trim() || !d.amount.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
