/**
 * SEO ADMIN (Phase 12) — a decision surface, not a generic analytics dashboard. Every tab answers a
 * question that ends in an action. Works with or without live DataForSEO data; when unconfigured it
 * shows the structural analysis (mapping, missing pages, cannibalization) and how to connect.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type Tab = "overview" | "opportunities" | "page-map" | "actions" | "images" | "print-seo" | "usage";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "SEO Overview" },
  { id: "opportunities", label: "Keyword Opportunities" },
  { id: "page-map", label: "Page Map" },
  { id: "actions", label: "Actions" },
  { id: "images", label: "Google Images" },
  { id: "print-seo", label: "Print SEO" },
  { id: "usage", label: "DataForSEO Usage" },
];
const pri = (p: string) => p === "High" ? "bg-red-100 text-red-700" : p === "Medium" ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-500";

const get = async (url: string) => (await apiRequest("GET", url)).json();
const band = (b: string) => b === "high" ? "bg-emerald-100 text-emerald-700" : b === "medium" ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-500";

export default function AdminSeoPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: status } = useQuery<any>({ queryKey: ["/api/admin/seo/status"], queryFn: () => get("/api/admin/seo/status") });

  const seed = useMutation({ mutationFn: () => apiRequest("POST", "/api/admin/seo/seed", {}).then((r) => r.json()),
    onSuccess: (d: any) => { qc.invalidateQueries(); toast({ title: `Seeded ${d.seeded} keywords` }); },
    onError: (e: Error) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }) });
  const refresh = useMutation({ mutationFn: () => apiRequest("POST", "/api/admin/seo/refresh/keyword-overview", {}).then((r) => r.json()),
    onSuccess: (d: any) => { qc.invalidateQueries(); toast({ title: d.ok ? `Refreshed ${d.updated ?? 0} keywords${d.fromCache ? " (from cache)" : ""}` : d.message, variant: d.ok ? undefined : "destructive" }); },
    onError: (e: Error) => toast({ title: "Refresh failed", description: e.message, variant: "destructive" }) });

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <h1 className="text-2xl font-semibold text-stone-900">SEO Growth</h1>
            <p className="text-sm text-stone-500 mt-1">
              DataForSEO → opportunity → the right page → priority → a concrete action → did it work.
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className={`text-[11px] uppercase tracking-wide px-2 py-1 rounded ${status?.configured ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-600"}`}>
              DataForSEO: {status?.mode ?? "…"}
            </span>
            {status && <p className="text-[11px] text-stone-400 mt-1">Market {status.market?.locationCode} · {status.market?.languageCode}</p>}
          </div>
        </div>

        {status && !status.configured && (
          <div className="mb-5 border border-amber-300/70 bg-amber-50 text-amber-800 px-4 py-3 text-sm rounded">
            <strong>Not connected.</strong> Set <code>DATAFORSEO_LOGIN</code> + <code>DATAFORSEO_PASSWORD</code> to pull live volume, difficulty and rankings. The structural analysis below (mapping, missing pages, cannibalization) works without it.
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-6">
          <button onClick={() => seed.mutate()} disabled={seed.isPending} className="text-xs border border-stone-300 rounded px-3 py-1.5 hover:bg-stone-100">Seed keyword model</button>
          <button onClick={() => refresh.mutate()} disabled={refresh.isPending} className="text-xs border border-stone-300 rounded px-3 py-1.5 hover:bg-stone-100">Refresh keyword data (weekly · cheap)</button>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-stone-200 mb-6">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === t.id ? "border-stone-900 text-stone-900 font-medium" : "border-transparent text-stone-500 hover:text-stone-800"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" && <Overview />}
        {tab === "opportunities" && <Opportunities />}
        {tab === "page-map" && <PageMap />}
        {tab === "actions" && <Actions />}
        {tab === "images" && <Images />}
        {tab === "print-seo" && <PrintSeo />}
        {tab === "usage" && <Usage />}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-stone-200 rounded-lg bg-white p-5 mb-4">
      <h3 className="text-xs uppercase tracking-wide text-stone-500 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Overview() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/admin/seo/overview"], queryFn: () => get("/api/admin/seo/overview") });
  if (isLoading) return <p className="text-stone-500">Analysing…</p>;
  if (!data) return null;
  const plan = data.weeklyPlan;
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3 mb-4">
        <Stat label="Keywords tracked" value={data.keywords} />
        <Stat label="Wrong-page rankings" value={data.wrongPageRanking?.length ?? 0} tone={data.wrongPageRanking?.length ? "warn" : "ok"} />
        <Stat label="Cannibalization risks" value={data.cannibalization?.length ?? 0} tone={data.cannibalization?.length ? "warn" : "ok"} />
      </div>
      {data.biggestOpportunity && (
        <Card title="Biggest opportunity">
          <p className="text-stone-900 font-medium">{data.biggestOpportunity.keyword}</p>
          <p className="text-sm text-stone-500">Score {data.biggestOpportunity.score}/100 · {data.biggestOpportunity.family} · target {data.biggestOpportunity.target ?? "—"}{data.biggestOpportunity.rank != null ? ` · #${data.biggestOpportunity.rank}` : ""}</p>
        </Card>
      )}
      {plan && (
        <Card title="What to do this week">
          {plan.quickWins?.length > 0 && (
            <div className="mb-3">
              <p className="text-[11px] uppercase tracking-wide text-emerald-700 mb-1">Quick wins</p>
              {plan.quickWins.map((a: any, i: number) => <ActionLine key={i} a={a} />)}
            </div>
          )}
          {plan.groups?.map((g: any) => (
            <div key={g.group} className="mb-3">
              <p className="text-[11px] uppercase tracking-wide text-stone-500 mb-1">{g.group}</p>
              {g.actions.map((a: any, i: number) => <ActionLine key={i} a={a} />)}
            </div>
          ))}
          {!plan.quickWins?.length && !plan.groups?.length && <p className="text-sm text-stone-500">No actions yet — seed the keyword model and regenerate.</p>}
          <p className="text-[11px] text-stone-400 mt-2">Showing {plan.shown} of {plan.total} · the rest are deliberately hidden so real opportunities aren't buried.</p>
        </Card>
      )}
      {data.newPrintOpportunities?.length > 0 && (
        <Card title="New print opportunities">
          {data.newPrintOpportunities.map((o: any, i: number) => <p key={i} className="text-sm text-stone-700">“{o.keyword}” → <code>/prints/{o.slug}</code></p>)}
        </Card>
      )}
      {data.wrongPageRanking?.length > 0 && (
        <Card title="Google is ranking the wrong page">
          {data.wrongPageRanking.map((w: any, i: number) => <p key={i} className="text-sm text-stone-700">“{w.keyword}”: ranking <code>{w.ranking}</code> — should be <code>{w.shouldBe}</code></p>)}
        </Card>
      )}
    </div>
  );
}

function ActionLine({ a }: { a: any }) {
  return (
    <div className="text-sm text-stone-700 py-1 border-b border-stone-100 last:border-0">
      <span className="font-medium">{a.recommendedChange}</span>
      <span className="text-stone-400"> — {a.keyword} · P{a.priority} · {a.effort}</span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  return (
    <div className="border border-stone-200 rounded-lg bg-white p-4">
      <p className="text-xs text-stone-500">{label}</p>
      <p className={`text-2xl font-semibold ${tone === "warn" ? "text-amber-700" : "text-stone-900"}`}>{value}</p>
    </div>
  );
}

function Opportunities() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/admin/seo/opportunities"], queryFn: () => get("/api/admin/seo/opportunities") });
  const [open, setOpen] = useState<string | null>(null);
  if (isLoading) return <p className="text-stone-500">Analysing…</p>;
  const kws = data?.keywords ?? [];
  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-500">Each row is a decision — the exact action rises to the top. Highest-value first.</p>
      {kws.map((k: any) => (
        <div key={k.keyword} className="border border-stone-200 rounded-lg bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-stone-900">{k.keyword}</span>
                <span className="text-[10px] uppercase tracking-wide bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded">{k.family}</span>
                {k.category && <span className="text-[10px] uppercase tracking-wide bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded">{k.category}</span>}
              </div>
              {/* the decision */}
              {k.action && <p className="text-sm text-stone-900 mt-2"><span className="text-stone-400">Do:</span> {k.action}</p>}
              <div className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2 mt-2 text-xs text-stone-500">
                <span>Page: <code>{k.page ?? "— none yet"}</code></span>
                <span>Demand: {k.volume != null ? `${k.volume}/mo` : "unknown"}</span>
                <span>Intent: {k.intent ?? "unknown"}</span>
                <span>Current: {k.rank != null ? `#${k.rank}` : "not ranking"}{k.wrongPageRanking ? " (wrong page)" : ""}</span>
                <span className="sm:col-span-2">Why: {k.why}</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className={`text-[11px] uppercase tracking-wide px-2 py-1 rounded ${pri(k.priority)}`}>{k.priority}</span>
              <button onClick={() => setOpen(open === k.keyword ? null : k.keyword)} className={`text-[11px] uppercase tracking-wide px-2 py-1 rounded ${band(k.band)}`}>score {k.score}</button>
            </div>
          </div>
          {open === k.keyword && (
            <div className="mt-3 pt-3 border-t border-stone-100">
              <p className="text-[11px] uppercase tracking-wide text-stone-400 mb-1">Score breakdown</p>
              {k.factors?.map((f: any) => (
                <div key={f.name} className="flex items-center justify-between gap-3 text-sm py-0.5">
                  <span className="text-stone-600">{f.name} <span className="text-stone-400">— {f.note}</span></span>
                  <span className="tabular-nums text-stone-500">+{f.contribution.toFixed(1)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {!kws.length && <p className="text-stone-500">No keywords yet. Click “Seed keyword model”.</p>}
    </div>
  );
}

function Images() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/admin/seo/images"], queryFn: () => get("/api/admin/seo/images") });
  if (isLoading) return <p className="text-stone-500">Auditing images…</p>;
  return (
    <div>
      <p className="text-sm text-stone-500 mb-4">Google Images is a first-class channel for a painter. {data?.artworksAudited} artworks audited. No hacks — every fix is “describe the real work better”.</p>
      <div className="space-y-2 mb-6">
        {(data?.summary ?? []).map((s: any) => (
          <div key={s.issue} className="border border-stone-200 rounded bg-white p-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-stone-900 font-medium">{s.issue.replace(/-/g, " ")} <span className="text-xs text-stone-400">· {s.count} artwork(s) · {s.category}</span></p>
              <p className="text-sm text-stone-600 mt-0.5">{s.recommendedChange}</p>
            </div>
            <span className={`text-[11px] uppercase tracking-wide px-2 py-1 rounded shrink-0 ${pri(s.priority)}`}>{s.priority}</span>
          </div>
        ))}
        {!(data?.summary ?? []).length && <p className="text-sm text-stone-500">No image-SEO issues found.</p>}
      </div>
      {(data?.sample ?? []).length > 0 && (
        <Card title="Examples">
          {data.sample.map((f: any, i: number) => (
            <p key={i} className="text-xs text-stone-600 py-0.5"><code>{f.url}</code> — {f.issue.replace(/-/g, " ")}</p>
          ))}
        </Card>
      )}
    </div>
  );
}

function PageMap() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/admin/seo/page-map"], queryFn: () => get("/api/admin/seo/page-map") });
  if (isLoading) return <p className="text-stone-500">Loading…</p>;
  return (
    <div className="space-y-3">
      {(data?.pages ?? []).map((p: any) => (
        <div key={p.url} className="border border-stone-200 rounded bg-white p-4">
          <div className="flex items-center justify-between">
            <code className="text-stone-900">{p.url}</code>
            <span className="text-xs text-stone-400">{p.type} · {p.keywords.length} keyword(s)</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {p.keywords.map((k: any) => <span key={k.keyword} className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded">{k.keyword}{k.rank != null ? ` #${k.rank}` : ""}</span>)}
          </div>
          {p.keywords.length > 1 && p.url !== "(unmapped)" && <p className="text-[11px] text-amber-600 mt-2">{p.keywords.length} keywords on one page — confirm they’re complementary, not competing.</p>}
        </div>
      ))}
    </div>
  );
}

function Actions() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/admin/seo/actions"], queryFn: () => get("/api/admin/seo/actions") });
  const regen = useMutation({ mutationFn: () => apiRequest("POST", "/api/admin/seo/regenerate-actions", {}).then((r) => r.json()),
    onSuccess: (d: any) => { qc.invalidateQueries({ queryKey: ["/api/admin/seo/actions"] }); toast({ title: `Regenerated ${d.actions} actions` }); } });
  const setStatus = useMutation({ mutationFn: (v: { id: number; status: string }) => apiRequest("POST", `/api/admin/seo/actions/${v.id}/status`, { status: v.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/seo/actions"] }) });
  if (isLoading) return <p className="text-stone-500">Loading…</p>;
  const actions = data?.actions ?? [];
  return (
    <div>
      <button onClick={() => regen.mutate()} className="text-xs border border-stone-300 rounded px-3 py-1.5 hover:bg-stone-100 mb-4">Regenerate actions from current data</button>
      <div className="space-y-2">
        {actions.map((a: any) => (
          <div key={a.id} className="border border-stone-200 rounded bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-stone-900 font-medium">{a.recommended_change}</p>
                <p className="text-xs text-stone-500 mt-0.5">{a.action_group} · {a.keyword} · P{a.priority} · {a.effort} · {a.target_url ?? "—"}</p>
                <p className="text-xs text-stone-400 mt-1">{a.reason} <span className="text-stone-300">|</span> {a.evidence}</p>
              </div>
              <select value={a.status} onChange={(e) => setStatus.mutate({ id: a.id, status: e.target.value })}
                className="text-xs border border-stone-300 rounded px-2 py-1 shrink-0">
                {["todo", "doing", "done", "ignored"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        ))}
        {!actions.length && <p className="text-stone-500">No actions. Seed keywords, then “Regenerate actions”.</p>}
      </div>
    </div>
  );
}

function PrintSeo() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/admin/seo/print-seo"], queryFn: () => get("/api/admin/seo/print-seo") });
  if (isLoading) return <p className="text-stone-500">Loading…</p>;
  const dec = (d: string) => d === "create" ? "bg-emerald-100 text-emerald-700" : d === "wait-for-inventory" ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-500";
  return (
    <div className="space-y-2">
      {(data?.recommendations ?? []).map((r: any) => (
        <div key={r.slug} className="border border-stone-200 rounded bg-white p-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-stone-900 font-medium">{r.label} <code className="text-xs text-stone-400">/prints/{r.slug}</code></p>
            <p className="text-sm text-stone-600 mt-0.5">{r.reason}</p>
            <p className="text-xs text-stone-400 mt-1">{r.evidence}</p>
          </div>
          <span className={`text-[11px] uppercase tracking-wide px-2 py-1 rounded shrink-0 ${dec(r.decision)}`}>{r.decision}</span>
        </div>
      ))}
    </div>
  );
}

function Usage() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/admin/seo/usage"], queryFn: () => get("/api/admin/seo/usage") });
  if (isLoading) return <p className="text-stone-500">Loading…</p>;
  return (
    <div>
      <Card title="Usage (last 30 days)">
        {(data?.usage ?? []).length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-stone-500"><tr><th className="py-1">Data type</th><th>Calls</th><th>Cache hits</th><th>Cost</th></tr></thead>
            <tbody>
              {data.usage.map((u: any) => (
                <tr key={u.dataType} className="border-t border-stone-100"><td className="py-1.5">{u.dataType}</td><td>{u.calls}</td><td className="text-emerald-700">{u.cacheHits}</td><td className="tabular-nums">${u.cost?.toFixed?.(2) ?? u.cost}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-sm text-stone-500">No usage yet.</p>}
      </Card>
      <Card title="Cost-control cadence">
        <table className="w-full text-sm">
          <tbody>
            {Object.entries(data?.cadence ?? {}).map(([k, v]) => (
              <tr key={k} className="border-t border-stone-100 first:border-0"><td className="py-1.5">{k}</td><td>{String(v)}</td><td className="text-stone-400">{data?.costTier?.[k]}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
