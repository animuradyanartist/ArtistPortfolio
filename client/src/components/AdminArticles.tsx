/**
 * ARTICLES — the owner's side of the publication workflow.
 *
 * Everything Career OS can do stops at a draft. This is where a draft becomes a decision:
 * Ani reads it, changes what she wants, and presses Publish. Nothing else on the site or
 * in the agent can make a post public, so this component is the entire path to going live.
 *
 * Deliberately not a CMS. There is no scheduling, no categories, no tags, no revisions, no
 * media library — an artist with a handful of essays a year needs a list, an editor and a
 * button, and each extra control is another thing to understand before writing anything.
 *
 * The list answers the questions actually asked in front of it: what is this, is it live,
 * when did I last touch it, when did it go out, and did I write it or did the agent?
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { BlogPost, Artwork } from "@shared/schema";
import { Plus, Edit, Trash, Eye, Globe, Undo2, Bot, User, Upload, X, ImageIcon } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Draft {
  id?: number;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  sourceNote: string;
  coverImage: string;
  coverImageAlt: string;
}

const EMPTY: Draft = { title: "", slug: "", excerpt: "", body: "", sourceNote: "", coverImage: "", coverImageAlt: "" };

/** "A Note on Oil" → "a-note-on-oil". Mirrors the server's own slug rule. */
function toSlug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80);
}

function when(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminArticles() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<BlogPost | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BlogPost | null>(null);

  // The admin list is the ONLY one that includes drafts — the public routes cannot.
  const { data: posts = [], isLoading } = useQuery<BlogPost[]>({ queryKey: ["/api/admin/blog"] });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/blog"] });
    queryClient.invalidateQueries({ queryKey: ["/api/blog"] });
  };
  const fail = (e: Error, what: string) => toast({ title: what, description: e.message, variant: "destructive" });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = {
        title: d.title, slug: toSlug(d.slug || d.title), excerpt: d.excerpt, body: d.body,
        sourceNote: d.sourceNote || null,
        coverImage: d.coverImage || null, coverImageAlt: d.coverImageAlt || null,
      };
      if (d.id) return apiRequest("PATCH", `/api/admin/blog/${d.id}`, payload);
      return apiRequest("POST", "/api/admin/blog", payload);
    },
    onSuccess: () => { refresh(); setEditing(null); toast({ title: "Saved as draft", description: "Nothing is public until you press Publish." }); },
    onError: (e: Error) => fail(e, "Could not save"),
  });

  // Publishing is its own call to its own route — the server refuses to change what the
  // public sees through the ordinary edit path, so this button is the only way live.
  const setLive = useMutation({
    mutationFn: async ({ id, live }: { id: number; live: boolean }) =>
      apiRequest("POST", `/api/admin/blog/${id}/publish`, { live }),
    onSuccess: (_r, v) => {
      refresh();
      toast({ title: v.live ? "Published" : "Returned to draft", description: v.live ? "It is live and in the sitemap." : "It is no longer public." });
    },
    onError: (e: Error) => fail(e, "Could not change publication state"),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/blog/${id}`),
    onSuccess: () => { refresh(); setConfirmDelete(null); toast({ title: "Deleted" }); },
    onError: (e: Error) => fail(e, "Could not delete"),
  });

  // Her own paintings, so a cover can be one of them without uploading anything. The list
  // is already served for the Artworks tab; this reuses it rather than adding a picker API.
  const { data: artworks = [] } = useQuery<Artwork[]>({ queryKey: ["/api/artworks"] });
  const [showPicker, setShowPicker] = useState(false);

  // The site's EXISTING upload endpoint — sharp converts to WebP and returns a path under
  // /uploads. No new storage, no media library, same pipeline the artworks use.
  const uploadCover = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed");
      return (await res.json()) as { imagePath: string };
    },
    onSuccess: (d) => { setEditing((e) => (e ? { ...e, coverImage: d.imagePath } : e)); toast({ title: "Image added" }); },
    onError: (e: Error) => fail(e, "Could not upload the image"),
  });

  const awaitingReview = posts.filter((p) => p.status === "draft" && p.origin === "career_os");

  // ── Editor ────────────────────────────────────────────────────────────────
  if (editing) {
    const d = editing;
    const set = (patch: Partial<Draft>) => setEditing({ ...d, ...patch });
    return (
      <Card className="border-slate-200/50 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{d.id ? "Edit article" : "New article"}</CardTitle>
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Title</label>
            <Input value={d.title} onChange={(e) => set({ title: e.target.value, slug: d.id ? d.slug : toSlug(e.target.value) })} placeholder="What the piece is called" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Address on the site</label>
            <Input value={d.slug} onChange={(e) => set({ slug: e.target.value })} placeholder="a-note-on-oil" />
            <p className="text-xs text-slate-500 mt-1">animuradyan.com/blog/{toSlug(d.slug || d.title) || "…"}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Summary</label>
            <Textarea rows={2} value={d.excerpt} onChange={(e) => set({ excerpt: e.target.value })} placeholder="One sentence. This is what Google shows under the title, and what the index card says." />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">The article</label>
            <Textarea rows={18} className="font-mono text-sm" value={d.body} onChange={(e) => set({ body: e.target.value })} placeholder={"Write in plain text.\n\nBlank line between paragraphs.\n\n## A heading\n\n- a list item\n\n**bold** and [a link](https://example.com)"} />
            <p className="text-xs text-slate-500 mt-1">Blank line between paragraphs · ## heading · - list · **bold** · [link](url)</p>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Cover image <span className="text-slate-400 font-normal">(optional)</span></label>
            {d.coverImage ? (
              <div className="mt-2 space-y-2">
                {/* The same preview the reader will get — if it looks wrong here it is wrong. */}
                <div className="relative inline-block">
                  <img src={d.coverImage} alt={d.coverImageAlt || "Cover preview"} className="max-h-48 rounded-lg border border-slate-200" />
                  <Button size="sm" variant="ghost" className="absolute top-1 right-1 bg-white/90 hover:bg-white"
                    onClick={() => set({ coverImage: "", coverImageAlt: "" })} title="Remove image">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Describe the image</label>
                  <Input value={d.coverImageAlt} onChange={(e) => set({ coverImageAlt: e.target.value })}
                    placeholder="e.g. A blue seascape at dusk, oil on canvas" />
                  <p className="text-xs text-slate-500 mt-1">
                    Read aloud to people who cannot see it, and used by search engines. Leave blank if the image is purely decorative.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex gap-2 flex-wrap">
                <label>
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCover.mutate(f); }} />
                  <Button asChild variant="outline" size="sm" disabled={uploadCover.isPending}>
                    <span className="cursor-pointer"><Upload className="w-4 h-4 mr-1" /> {uploadCover.isPending ? "Uploading…" : "Upload an image"}</span>
                  </Button>
                </label>
                <Button variant="outline" size="sm" onClick={() => setShowPicker(!showPicker)}>
                  <ImageIcon className="w-4 h-4 mr-1" /> Use one of my paintings
                </Button>
                <p className="text-xs text-slate-500 w-full mt-1">
                  Either works on the page. An uploaded image is the safer choice for the preview
                  card on Facebook, X and WhatsApp — a painting is served from Singulart via a
                  redirect, and some of those crawlers will not follow one.
                </p>
              </div>
            )}
            {showPicker && !d.coverImage && (
              <div className="mt-3 grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-64 overflow-y-auto p-2 border border-slate-200 rounded-lg">
                {artworks.map((a) => (
                  <button key={a.id} type="button" title={a.title}
                    onClick={() => { set({ coverImage: `/img/artwork/${a.id}/0`, coverImageAlt: `${a.title}${a.medium ? `, ${a.medium}` : ""}` }); setShowPicker(false); }}
                    className="aspect-square rounded-md overflow-hidden border border-slate-200 hover:border-blue-500">
                    <img src={`/img/artwork/${a.id}/0`} alt={a.title} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Why this was written <span className="text-slate-400 font-normal">(optional, private)</span></label>
            <Input value={d.sourceNote} onChange={(e) => set({ sourceNote: e.target.value })} placeholder="e.g. people search this and nothing of mine answers it" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={() => save.mutate(d)} disabled={save.isPending || !d.title || !d.excerpt || !d.body}>
              {save.isPending ? "Saving…" : "Save as draft"}
            </Button>
            {d.id && (
              <Button variant="outline" onClick={() => setPreview(posts.find((p) => p.id === d.id) ?? null)}>
                <Eye className="w-4 h-4 mr-1" /> Preview
              </Button>
            )}
          </div>
          <p className="text-xs text-slate-500">Saving never publishes. Publishing is a separate button on the list.</p>
        </CardContent>
      </Card>
    );
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  if (preview) {
    return (
      <Card className="border-slate-200/50 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Preview — {preview.status === "published" ? "live" : "draft, not public"}</CardTitle>
          <Button variant="ghost" onClick={() => setPreview(null)}>Back</Button>
        </CardHeader>
        <CardContent>
          <article className="max-w-2xl mx-auto py-6">
            {preview.coverImage && (
              <img src={preview.coverImage} alt={preview.coverImageAlt ?? ""} className="w-full rounded-xl mb-6" />
            )}
            <h1 className="text-4xl font-bold text-slate-900 mb-2">{preview.title}</h1>
            <p className="text-slate-500 text-sm mb-6">{when(preview.publishedAt ?? preview.createdAt)} · Ani Muradyan</p>
            <p className="text-lg text-slate-600 mb-8">{preview.excerpt}</p>
            {/* The same plain-text shape the server renders — paragraphs, headings, lists. */}
            {String(preview.body ?? "").split(/\n{2,}/).map((block, i) => {
              const b = block.trim();
              if (!b) return null;
              if (/^###\s+/.test(b)) return <h3 key={i} className="text-xl font-bold text-slate-900 mt-8 mb-3">{b.replace(/^###\s+/, "")}</h3>;
              if (/^##\s+/.test(b)) return <h2 key={i} className="text-2xl font-bold text-slate-900 mt-8 mb-3">{b.replace(/^##\s+/, "")}</h2>;
              if (/^[-*]\s+/.test(b)) return (
                <ul key={i} className="list-disc pl-6 text-slate-700 mb-4">
                  {b.split("\n").map((l, j) => <li key={j} className="mb-1">{l.replace(/^[-*]\s+/, "")}</li>)}
                </ul>
              );
              return <p key={i} className="text-slate-700 leading-relaxed mb-4">{b.replace(/\n/g, " ")}</p>;
            })}
          </article>
        </CardContent>
      </Card>
    );
  }

  // ── List ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {awaitingReview.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="py-4 flex items-center gap-3">
            <Bot className="w-5 h-5 text-amber-700 shrink-0" />
            <p className="text-sm text-amber-900">
              <strong>{awaitingReview.length} draft{awaitingReview.length === 1 ? "" : "s"} from Career OS</strong> waiting for you.
              Nothing is public until you publish it.
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="border-slate-200/50 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Articles</CardTitle>
          <Button onClick={() => setEditing({ ...EMPTY })}><Plus className="w-4 h-4 mr-1" /> New article</Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-slate-500 py-8 text-center">Loading…</p>
          ) : posts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-600 mb-1">No articles yet.</p>
              <p className="text-sm text-slate-500">Nothing appears on the site until you write one and publish it.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {posts.map((p) => (
                <div key={p.id} className="py-4 flex items-start justify-between gap-4">
                  {p.coverImage && (
                    <img src={p.coverImage} alt="" className="w-16 h-12 object-cover rounded shrink-0 border border-slate-200" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900 truncate">{p.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === "published" ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>
                        {p.status === "published" ? "Published" : "Draft"}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 inline-flex items-center gap-1">
                        {p.origin === "career_os" ? <><Bot className="w-3 h-3" /> Career OS</> : <><User className="w-3 h-3" /> You</>}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 truncate mt-0.5">{p.excerpt}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Updated {when(p.updatedAt)}
                      {p.status === "published" && <> · Published {when(p.publishedAt)}</>}
                      {p.sourceNote && <> · {p.sourceNote}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => setPreview(p)} title="Preview"><Eye className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" title="Edit"
                      onClick={() => setEditing({ id: p.id, title: p.title, slug: p.slug, excerpt: p.excerpt, body: p.body, sourceNote: p.sourceNote ?? "", coverImage: p.coverImage ?? "", coverImageAlt: p.coverImageAlt ?? "" })}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    {p.status === "published" ? (
                      <Button size="sm" variant="outline" onClick={() => setLive.mutate({ id: p.id, live: false })} disabled={setLive.isPending}>
                        <Undo2 className="w-4 h-4 mr-1" /> Unpublish
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => setLive.mutate({ id: p.id, live: true })} disabled={setLive.isPending}>
                        <Globe className="w-4 h-4 mr-1" /> Publish
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(p)} title="Delete">
                      <Trash className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirmDelete?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the article permanently. {confirmDelete?.status === "published" && "It is currently live, so it will disappear from the site and the sitemap. "}
              There is no undo.
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
