import { useEffect, useMemo, useRef, useState, type ReactNode, type ElementType } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Artwork } from "@shared/schema";
import { updateCanonicalUrl, updateMetaDescription, artworkPath } from "@/lib/seo";
import { artworkCategory } from "@/lib/artworkCategory";

const NAVY = "#0d1434";
const CORAL = "#be7c68"; // the single warm accent — the story's pulse

/* ── Scroll reveal ─────────────────────────────────────────── */
function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: ElementType;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setInView(true);
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-[1100ms] ease-out ${
        inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      } ${className}`}
    >
      {children}
    </Tag>
  );
}

/* ── Breathing pulse ───────────────────────────────────────── */
function Pulse({ size = 12, color = CORAL }: { size?: number; color?: string }) {
  const ring: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: "9999px",
    background: color,
  };
  return (
    <span style={{ position: "relative", display: "inline-block", width: size, height: size }}>
      <span style={{ ...ring }} />
      <span
        className="path-pulse-ring"
        style={{ ...ring, animation: "pathBreathe 3.6s ease-out infinite" }}
      />
      <span
        className="path-pulse-ring"
        style={{ ...ring, animation: "pathBreathe 3.6s ease-out infinite 1.8s" }}
      />
    </span>
  );
}

/* Uppercase tracked label */
function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-[11px] tracking-[0.32em] uppercase ${className}`}>{children}</p>
  );
}

/* A framed painting "plate" linking to its detail page */
function Plate({
  artwork,
  aspect = "aspect-[4/5]",
  mat = "bg-white",
  caption,
  className = "",
  imgClassName = "",
  overlay,
}: {
  artwork?: Artwork;
  aspect?: string;
  mat?: string;
  caption?: ReactNode;
  className?: string;
  imgClassName?: string;
  overlay?: ReactNode;
}) {
  if (!artwork) return null;
  return (
    <Link href={artworkPath(artwork)}>
      <figure
        className={`group m-0 p-2 ${mat} shadow-[0_30px_60px_-40px_rgba(0,0,0,0.5)] cursor-pointer ${className}`}
      >
        <div className={`relative overflow-hidden ${aspect}`}>
          <img
            src={artwork.images[0]}
            alt={`${artwork.title} — oil painting by Ani Muradyan`}
            className={`absolute inset-0 h-full w-full object-cover transition-transform duration-[900ms] group-hover:scale-[1.04] ${imgClassName}`}
            loading="lazy"
          />
          {overlay}
        </div>
        {caption}
      </figure>
    </Link>
  );
}

export default function PathPage() {
  useEffect(() => {
    document.title = "The Path — From Silence to Open Space | Ani Muradyan";
    updateCanonicalUrl("/path");
    updateMetaDescription(
      "From Silence to Open Space — the artistic journey of contemporary oil painter Ani Muradyan, from inward figures to open horizons and the threshold of transformation."
    );
  }, []);

  const { data: artworks = [] } = useQuery<Artwork[]>({ queryKey: ["/api/artworks"] });
  const { data: settings = {} } = useQuery<Record<string, string | null>>({
    queryKey: ["/api/path-settings"],
  });

  const picks = useMemo(() => {
    const find = (t: string) => artworks.find((a) => a.title === t);
    const firstOf = (c: "landscape" | "figurative", exclude: Artwork[] = []) =>
      artworks.find((a) => artworkCategory(a) === c && !exclude.includes(a));
    // Admin-chosen painting for a slot (by id), if set and still exists
    const chosen = (id?: string | null) =>
      id ? artworks.find((a) => String(a.id) === String(id)) : undefined;

    const hero =
      chosen(settings.heroArtworkId) || find("Evening Calm") || find("Endless Horizon") || firstOf("landscape");
    const c1a = chosen(settings.chapterOneArtworkId) || find("Blue Detachment") || firstOf("figurative");
    const c1b =
      chosen(settings.chapterOneDetailArtworkId) || find("Strength in Shadows") || find("Reflective Gaze") || firstOf("figurative", [c1a!]);
    const c2a =
      chosen(settings.chapterTwoArtworkId) || find("Endless Horizon") || find("Layered horizons") || firstOf("landscape", [hero!]);
    const c2b =
      chosen(settings.chapterTwoDetailArtworkId) || find("Quiet Pathway") || find("Evening Calm") || firstOf("landscape", [hero!, c2a!]);
    const c3 =
      chosen(settings.chapterThreeArtworkId) || find("Threshold of Memories") || find("A Safe Distance") || find("Rebirth");

    // Current series — available works with a "threshold" feel, then top up
    const preferred = ["Rebirth", "A Safe Distance", "Beyond Every Limit", "Threshold of Memories", "Layered horizons"];
    const seen = new Set<number>();
    const series: Artwork[] = [];
    for (const t of preferred) {
      const a = find(t);
      if (a && a.availability === "available" && !seen.has(a.id)) {
        series.push(a);
        seen.add(a.id);
      }
    }
    for (const a of artworks) {
      if (series.length >= 3) break;
      if (a.availability === "available" && !seen.has(a.id)) {
        series.push(a);
        seen.add(a.id);
      }
    }
    return { hero, c1a, c1b, c2a, c2b, c3, series: series.slice(0, 3) };
  }, [artworks, settings]);

  const dims = (a?: Artwork) => (a ? `${a.medium || "Oil on canvas"} · ${a.dimensions}` : "");

  return (
    <div className="bg-[#f5f1ea] text-stone-800">
      {/* ═══════════ HERO ═══════════ */}
      <header className="mx-auto max-w-6xl px-6 pt-20 md:pt-28 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-[1.05fr_0.95fr] gap-10 md:gap-16 items-center">
          <Reveal>
            <Eyebrow className="text-stone-500">Ani Muradyan — Contemporary Oil Painting</Eyebrow>
            <h1 className="font-playfair text-5xl md:text-7xl leading-[0.98] text-stone-900 mt-5">
              From Silence
              <br />
              to Open Space
            </h1>
            <p className="font-playfair italic text-xl md:text-2xl text-stone-600 mt-6 max-w-md">
              I paint the moment when an inner state becomes a landscape.
            </p>
            <p className="text-sm md:text-base leading-relaxed text-stone-600 mt-6 max-w-md">
              Over time, my work has moved from enclosed figures and emotional weight toward open
              horizons, quiet fields of colour, and the uncertain space of becoming.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#chapter-one"
                className="px-6 py-3 text-[11px] tracking-[0.2em] uppercase text-stone-50 hover:opacity-90 transition-opacity"
                style={{ backgroundColor: "#26221c" }}
              >
                Follow the Story
              </a>
              <a
                href="#current-series"
                className="px-6 py-3 text-[11px] tracking-[0.2em] uppercase border border-stone-800 text-stone-900 hover:bg-stone-900 hover:text-stone-50 transition-colors"
              >
                View Current Works
              </a>
            </div>
            <div
              className="mt-9 inline-flex items-center gap-3 rounded-full border border-stone-300 bg-[#fbf8f2]/70 pl-3 pr-4 py-2"
              aria-label="Current chapter"
            >
              <Pulse size={9} />
              <span className="text-[10px] tracking-[0.2em] uppercase text-stone-400">
                Current Chapter
              </span>
              <span className="font-playfair italic text-sm text-stone-800">Returning Changed</span>
            </div>
          </Reveal>

          <Reveal delay={150}>
            <Plate
              artwork={picks.hero}
              caption={
                picks.hero && (
                  <figcaption className="flex items-baseline justify-between gap-4 px-1 pt-3 text-[10px] tracking-[0.14em] uppercase text-stone-400">
                    <span className="text-stone-600 font-playfair italic normal-case tracking-normal text-sm">
                      {picks.hero.title}
                    </span>
                    <span>{picks.hero.dimensions}</span>
                  </figcaption>
                )
              }
            />
          </Reveal>
        </div>

        {/* Manifesto */}
        <Reveal className="mx-auto max-w-3xl text-center mt-20 md:mt-28">
          <span className="mx-auto mb-8 block h-14 w-px bg-gradient-to-b from-stone-300 to-[#be7c68]" />
          <p className="font-playfair italic text-2xl md:text-[34px] leading-snug text-stone-900">
            “A landscape, for me, is never only a place. It is an inner state becoming visible.”
          </p>
        </Reveal>
      </header>

      {/* ═══════════ CHAPTER ONE — dark, enclosed, heavy ═══════════ */}
      <section id="chapter-one" className="relative overflow-hidden" style={{ backgroundColor: NAVY }}>
        <div className="mx-auto max-w-6xl px-6 py-24 md:py-36">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
            {/* Image — tightly framed, vignette closing in */}
            <Reveal className="order-1">
              <div className="relative mx-auto max-w-sm md:max-w-none">
                <Plate
                  artwork={picks.c1a}
                  mat="bg-[#1a2138]"
                  imgClassName="brightness-90"
                  overlay={
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{ boxShadow: `inset 0 0 90px 30px ${NAVY}` }}
                    />
                  }
                  caption={
                    picks.c1a && (
                      <figcaption className="flex items-baseline justify-between gap-4 px-1 pt-3 text-[10px] tracking-[0.14em] uppercase text-white/35">
                        <span className="font-playfair italic normal-case tracking-normal text-sm text-white/70">
                          {picks.c1a.title}
                        </span>
                        <span>{picks.c1a.dimensions}</span>
                      </figcaption>
                    )
                  }
                />
                {picks.c1b && (
                  <div className="absolute -bottom-8 -right-4 w-2/5 hidden sm:block">
                    <Plate artwork={picks.c1b} aspect="aspect-square" mat="bg-[#1a2138]" imgClassName="brightness-95" />
                  </div>
                )}
              </div>
            </Reveal>

            {/* Text — narrow, compressed, light on dark */}
            <Reveal delay={120} className="order-2">
              <p
                className="font-playfair leading-[0.8] mb-2 select-none"
                style={{ fontSize: "clamp(5rem,14vw,11rem)", color: "transparent", WebkitTextStroke: "1px rgba(255,255,255,0.14)" }}
                aria-hidden="true"
              >
                01
              </p>
              <div className="flex items-baseline gap-4 flex-wrap">
                <Eyebrow className="text-white/40">Chapter One</Eyebrow>
                <span className="text-[11px] tracking-[0.14em] uppercase" style={{ color: CORAL }}>
                  2021–2023
                </span>
              </div>
              <h2 className="font-playfair text-4xl md:text-5xl text-[#f2ede2] mt-3 leading-tight">
                The Weight Within
              </h2>
              <p className="mt-4 text-[11px] tracking-[0.14em] uppercase text-white/45">
                Figures · Silence · Held emotion
              </p>
              <div className="mt-8 max-w-md space-y-4 text-[15px] leading-[1.8] text-white/70">
                <p className="font-playfair italic text-lg text-white/85">
                  In my early work, the figure carried almost everything.
                </p>
                <p>
                  Women appeared turned inward, surrounded by darker colours, compressed spaces, and
                  a silence that felt heavier than stillness. At the time, I did not fully understand
                  why these images kept returning. Only later did I recognise them as forms of an
                  inner weight I had not yet learned to name.
                </p>
                <p>Painting became the place where that weight could become visible.</p>
              </div>
              <p className="mt-8 max-w-md border-t border-white/10 pt-4 text-sm leading-relaxed text-white/55">
                <span className="text-[11px] tracking-[0.18em] uppercase text-white/40 mr-2">
                  What to notice
                </span>
                Enclosed compositions, inward figures, darker tonal fields, and a feeling of held
                emotion.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══════════ CHAPTER TWO — light, open, spacious ═══════════ */}
      <section id="chapter-two" className="bg-[#faf7f1]">
        <div className="mx-auto max-w-6xl px-6 py-28 md:py-44">
          {/* Spacious asymmetric layout — text small, painting wide */}
          <Reveal>
            <p
              className="font-playfair leading-[0.8] select-none"
              style={{ fontSize: "clamp(5rem,14vw,11rem)", color: "transparent", WebkitTextStroke: "1px #d3c7b2" }}
              aria-hidden="true"
            >
              02
            </p>
            <div className="flex items-baseline gap-4 flex-wrap mt-2">
              <Eyebrow className="text-stone-400">Chapter Two</Eyebrow>
              <span className="text-[11px] tracking-[0.14em] uppercase text-stone-400">After 2023</span>
            </div>
            <h2 className="font-playfair text-4xl md:text-6xl text-stone-900 mt-3 max-w-2xl leading-[1.05]">
              Toward My Own Language
            </h2>
            <p className="mt-5 text-[11px] tracking-[0.14em] uppercase text-stone-400">
              Horizons · Space · Quiet colour
            </p>
          </Reveal>

          {/* Wide panoramic landscape — the "open space" */}
          <Reveal delay={120} className="mt-14 md:mt-20">
            <Plate
              artwork={picks.c2a}
              aspect="aspect-square"
              caption={
                picks.c2a && (
                  <figcaption className="flex items-baseline justify-between gap-4 px-1 pt-3 text-[10px] tracking-[0.14em] uppercase text-stone-400">
                    <span className="font-playfair italic normal-case tracking-normal text-sm text-stone-600">
                      {picks.c2a.title}
                    </span>
                    <span>{dims(picks.c2a)}</span>
                  </figcaption>
                )
              }
            />
          </Reveal>

          {/* Text sits in a narrow column with generous space beside it */}
          <div className="mt-16 md:mt-24 grid grid-cols-1 md:grid-cols-[1fr_1.1fr] gap-10 md:gap-20 items-start">
            <Reveal>
              <span className="mb-6 block h-px w-24 bg-stone-300" />
              <div className="space-y-5 text-[15px] leading-[1.85] text-stone-600 max-w-md">
                <p className="font-playfair italic text-lg text-stone-800">
                  Gradually, the paintings began to open.
                </p>
                <p>
                  As I released ideas and burdens that no longer belonged to me, more space entered
                  the work. The compositions became quieter. Forms were reduced. Landscapes,
                  horizons, and wider fields of colour began to replace the density of the earlier
                  figures.
                </p>
                <p>
                  I discovered that a painting did not need to say everything. Sometimes one line,
                  one distance, or one quiet colour could hold the entire feeling.
                </p>
              </div>
              <p className="mt-8 max-w-md border-t border-stone-200 pt-4 text-sm leading-relaxed text-stone-500">
                <span className="text-[11px] tracking-[0.18em] uppercase text-stone-400 mr-2">
                  What to notice
                </span>
                Open horizons, fewer elements, softer transitions, and silence that feels spacious
                rather than heavy.
              </p>
            </Reveal>

            {picks.c2b && (
              <Reveal delay={120}>
                <Plate
                  artwork={picks.c2b}
                  aspect="aspect-[4/5]"
                  className="md:ml-auto md:max-w-xs"
                  caption={
                    <figcaption className="flex items-baseline justify-between gap-4 px-1 pt-3 text-[10px] tracking-[0.14em] uppercase text-stone-400">
                      <span className="font-playfair italic normal-case tracking-normal text-sm text-stone-600">
                        {picks.c2b.title}
                      </span>
                      <span>{picks.c2b.dimensions}</span>
                    </figcaption>
                  }
                />
              </Reveal>
            )}
          </div>
        </div>
      </section>

      {/* ═══════════ CHAPTER THREE — threshold, becoming ═══════════ */}
      <section
        id="chapter-three"
        style={{ background: "linear-gradient(to bottom, #f5f1ea 0%, #ece7dc 45%, #d9d2c6 100%)" }}
      >
        <div className="mx-auto max-w-3xl px-6 py-28 md:py-40 text-center">
          <Reveal>
            <p
              className="font-playfair leading-[0.8] select-none mx-auto"
              style={{ fontSize: "clamp(5rem,14vw,11rem)", color: "transparent", WebkitTextStroke: "1px #ccbfa8" }}
              aria-hidden="true"
            >
              03
            </p>
            <div className="flex items-baseline justify-center gap-4 flex-wrap mt-2">
              <Eyebrow className="text-stone-500">Chapter Three</Eyebrow>
              <span className="text-[11px] tracking-[0.14em] uppercase" style={{ color: CORAL }}>
                Current Work
              </span>
              <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.14em] uppercase" style={{ color: CORAL }}>
                <Pulse size={7} />
                Current Chapter
              </span>
            </div>
            <h2 className="font-playfair text-4xl md:text-6xl text-stone-900 mt-3 leading-[1.05]">
              Returning Changed
            </h2>
            <p className="mt-5 text-[11px] tracking-[0.14em] uppercase text-stone-400">
              Thresholds · Distance · Transformation
            </p>
          </Reveal>

          {/* Current painting — edges softly merging into the ground */}
          <Reveal delay={100} className="mt-12 md:mt-16">
            <Plate
              artwork={picks.c3}
              aspect="aspect-square"
              mat="bg-[#fbf8f2]"
              caption={
                picks.c3 && (
                  <figcaption className="flex items-baseline justify-between gap-4 px-1 pt-3 text-[10px] tracking-[0.14em] uppercase text-stone-400">
                    <span className="font-playfair italic normal-case tracking-normal text-sm text-stone-600">
                      {picks.c3.title}
                    </span>
                    <span>{dims(picks.c3)}</span>
                  </figcaption>
                )
              }
            />
          </Reveal>

          <Reveal delay={120} className="mt-12">
            <div className="mx-auto max-w-xl space-y-5 text-[15px] leading-[1.85] text-stone-600">
              <p className="font-playfair italic text-lg text-stone-900">
                My current paintings begin at a threshold.
              </p>
              <p>
                A figure stands at the edge of a space. A horizon opens in the distance. Something
                familiar has been left behind, but what comes next is not yet fully known. I am
                drawn to this fragile moment between leaving and arriving.
              </p>
              <p>
                The paintings do not describe what happens next. They hold the pause in which a
                person begins to see differently — and, through that seeing, returns changed.
              </p>
              <p>
                This is also where I find myself now. Painting has become part of how I understand
                movement, uncertainty, and the quiet ways we return to ourselves.
              </p>
            </div>
          </Reveal>

          {/* "The path is still open" mark */}
          <Reveal className="mt-16 flex flex-col items-center gap-4">
            <span className="text-[11px] tracking-[0.28em] uppercase" style={{ color: CORAL }}>
              The path is still open
            </span>
            <span className="h-12 w-px" style={{ background: `linear-gradient(#cbbfa8, ${CORAL})` }} />
            <Pulse size={13} />
            <p className="font-playfair italic text-2xl md:text-3xl text-stone-900 mt-1">
              Still becoming.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══════════ CURRENT SERIES ═══════════ */}
      <section id="current-series" className="bg-[#f5f1ea]">
        <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
          <Reveal className="grid grid-cols-1 md:grid-cols-[0.85fr_1.15fr] gap-6 md:gap-16 items-end mb-14">
            <div>
              <Eyebrow className="text-stone-500 mb-3">Current Series</Eyebrow>
              <h2 className="font-playfair text-4xl md:text-5xl text-stone-900 leading-[1.02]">
                Works from
                <br />
                the Threshold
              </h2>
            </div>
            <p className="text-sm md:text-base leading-relaxed text-stone-600 max-w-xl">
              These paintings belong to the chapter I am living now. Each holds a moment between what
              has been left behind and what has not yet taken form — a quiet passage through
              uncertainty, distance, and change.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-12">
            {picks.series.map((a, i) => (
              <Reveal key={a.id} delay={i * 90}>
                <Link href={artworkPath(a)}>
                  <div className="group aspect-[4/5] overflow-hidden cursor-pointer bg-stone-200">
                    <img
                      src={a.images[0]}
                      alt={`${a.title} — oil painting by Ani Muradyan`}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                </Link>
                <h3 className="font-playfair italic text-lg text-stone-900 mt-4">{a.title}</h3>
                <p className="text-xs text-stone-500 mt-1">{dims(a)}</p>
                <span
                  className="mt-3 inline-flex items-center gap-2 text-[10px] tracking-[0.16em] uppercase"
                  style={{ color: CORAL }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CORAL }} />
                  Available
                </span>
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-16 text-center">
            <Link href="/artworks">
              <span
                className="inline-block px-6 py-3 text-[11px] tracking-[0.2em] uppercase text-stone-50 hover:opacity-90 transition-opacity"
                style={{ backgroundColor: "#26221c" }}
              >
                Explore Available Paintings
              </span>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ═══════════ CLOSING ═══════════ */}
      <section className="bg-[#ece7dc] py-24 md:py-32 px-6 text-center">
        <Reveal className="mx-auto max-w-2xl">
          <Eyebrow className="text-stone-500 mb-4">Live With the Work</Eyebrow>
          <h2 className="font-playfair text-4xl md:text-[52px] leading-[1.03] text-stone-900">
            When a painting stays with you
          </h2>
          <p className="mx-auto mt-6 max-w-md text-sm md:text-base leading-relaxed text-stone-600">
            A painting changes when it enters a lived space. If one of these works stays with you, I
            would be glad to share more about its story, details, and availability.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/artworks">
              <span
                className="inline-block px-6 py-3 text-[11px] tracking-[0.2em] uppercase text-stone-50 hover:opacity-90 transition-opacity"
                style={{ backgroundColor: "#26221c" }}
              >
                View Available Works
              </span>
            </Link>
            <a
              href="mailto:animuradyan.artist@gmail.com?subject=Artwork%20Inquiry"
              className="inline-block px-6 py-3 text-[11px] tracking-[0.2em] uppercase border border-stone-800 text-stone-900 hover:bg-stone-900 hover:text-stone-50 transition-colors"
            >
              Ask About a Painting
            </a>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
