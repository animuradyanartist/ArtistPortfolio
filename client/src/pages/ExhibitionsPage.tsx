import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Exhibition } from "@shared/schema";
import { updateCanonicalUrl, updateMetaDescription } from "@/lib/seo";
import { Eyebrow, OutlineButton } from "@/components/editorial";

type TypeFilter = "all" | "solo" | "group";

export default function ExhibitionsPage() {
  useEffect(() => {
    document.title = "Exhibitions by Ani Muradyan | Solo & Group Art Shows";
    updateCanonicalUrl("/exhibitions");
    updateMetaDescription(
      "Solo and group exhibitions by Armenian contemporary artist Ani Muradyan — shown internationally and across Armenia."
    );
  }, []);

  const [filter, setFilter] = useState<TypeFilter>("all");

  const { data: exhibitions = [] } = useQuery<Exhibition[]>({
    queryKey: ["/api/exhibitions"],
  });

  // Only offer a type filter for types that actually exist
  const availableFilters = useMemo<{ value: TypeFilter; label: string }[]>(() => {
    const base: { value: TypeFilter; label: string }[] = [{ value: "all", label: "All" }];
    if (exhibitions.some((e) => e.type === "solo")) base.push({ value: "solo", label: "Solo" });
    if (exhibitions.some((e) => e.type === "group")) base.push({ value: "group", label: "Group" });
    return base;
  }, [exhibitions]);

  const filtered = useMemo(
    () => exhibitions.filter((e) => filter === "all" || e.type === filter),
    [exhibitions, filter]
  );

  // Group by year, newest first
  const years = useMemo(() => {
    const byYear = new Map<number, Exhibition[]>();
    for (const ex of filtered) {
      const list = byYear.get(ex.year) ?? [];
      list.push(ex);
      byYear.set(ex.year, list);
    }
    return Array.from(byYear.entries()).sort((a, b) => b[0] - a[0]);
  }, [filtered]);

  const locationLine = (ex: Exhibition) =>
    [ex.venue, ex.location].map((s) => s?.trim()).filter(Boolean).join(", ");

  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      {/* ── Header ─────────────────────────────────────────── */}
      <section className="px-6 pt-20 md:pt-28 pb-8 text-center">
        <Eyebrow>Recognition</Eyebrow>
        <h1 className="font-playfair text-5xl md:text-6xl text-stone-900 mb-5">Exhibitions</h1>
        <p className="mx-auto max-w-xl text-sm md:text-base text-stone-600">
          Ani Muradyan's work has been exhibited internationally and across Armenia — in solo
          shows and art fairs from Yerevan to Paris, Madrid, and beyond.
        </p>
      </section>

      {/* ── Type filter (only when >1 option) ──────────────── */}
      {availableFilters.length > 1 && (
        <section className="px-6">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-3">
            {availableFilters.map((f) => {
              const active = filter === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`px-5 py-2 text-[11px] tracking-[0.2em] uppercase transition-colors ${
                    active
                      ? "bg-stone-900 text-stone-50"
                      : "border border-stone-300 text-stone-600 hover:border-stone-500 hover:text-stone-900"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Year-grouped list ──────────────────────────────── */}
      <section className="px-6 py-14 md:py-20">
        <div className="mx-auto max-w-4xl">
          {years.length === 0 ? (
            <p className="py-16 text-center font-playfair italic text-2xl text-stone-500">
              No exhibitions to show yet.
            </p>
          ) : (
            years.map(([year, list]) => (
              <div
                key={year}
                className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-4 md:gap-8 border-t border-stone-300 py-8 md:py-10"
              >
                <div className="font-playfair text-3xl text-stone-400">{year}</div>
                <div className="space-y-7">
                  {list.map((ex) => (
                    <div key={ex.id}>
                      <div className="flex items-baseline justify-between gap-4">
                        <h3 className="font-playfair text-lg md:text-xl text-stone-900">
                          {ex.title}
                        </h3>
                        <span className="shrink-0 text-[10px] tracking-[0.2em] uppercase text-stone-400">
                          {ex.type === "group" ? "Group" : "Solo"}
                        </span>
                      </div>
                      {locationLine(ex) && (
                        <p className="mt-1 text-sm text-stone-500">{locationLine(ex)}</p>
                      )}
                      {ex.description && (
                        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600">
                          {ex.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ── Closing CTA ────────────────────────────────────── */}
      <section className="py-20 md:py-28 px-6 text-center">
        <h2 className="font-playfair mx-auto max-w-xl text-4xl md:text-[44px] leading-tight text-stone-900 mb-10">
          See the paintings in person.
        </h2>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/artworks">
            <span
              className="inline-block px-6 py-3 text-[11px] tracking-[0.2em] uppercase text-stone-50 hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#26221c" }}
            >
              View Originals
            </span>
          </Link>
          <Link href="/contact">
            <OutlineButton>Contact the Artist</OutlineButton>
          </Link>
        </div>
      </section>
    </div>
  );
}
