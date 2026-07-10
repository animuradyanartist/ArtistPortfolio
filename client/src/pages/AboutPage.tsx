import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link } from "wouter";
import type { ArtistBio, Exhibition } from "@shared/schema";
import { updateCanonicalUrl, updateMetaDescription } from "@/lib/seo";
import { Eyebrow, OutlineButton } from "@/components/editorial";
import backgroundImage from "@assets/1bg_1750936488071.png";

export default function AboutPage() {
  useEffect(() => {
    document.title = "About Ani Muradyan | Contemporary Armenian Artist";
    updateCanonicalUrl("/about");
    updateMetaDescription(
      "Learn about Ani Muradyan, a contemporary Armenian oil painter. Biography, artist statement, education, and exhibition history."
    );
  }, []);

  const { data: artistBio } = useQuery<ArtistBio>({
    queryKey: ["/api/artist-bio"],
  });
  const { data: exhibitions = [] } = useQuery<Exhibition[]>({
    queryKey: ["/api/exhibitions"],
  });

  const portrait = artistBio?.image || backgroundImage;
  const recentExhibitions = [...exhibitions].sort((a, b) => (b.year || 0) - (a.year || 0));

  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      {/* ── Header ─────────────────────────────────────────── */}
      <section className="px-6 pt-20 md:pt-28 pb-4 text-center">
        <Eyebrow>The Artist</Eyebrow>
        <h1 className="font-playfair text-5xl md:text-6xl text-stone-900 mb-5">Ani Muradyan</h1>
        <p className="mx-auto max-w-xl text-sm md:text-base text-stone-600">
          Contemporary oil painter working with simplified forms, colour, space, and emotional
          atmosphere — based in Yerevan, Armenia.
        </p>
      </section>

      {/* ── Portrait + biography ───────────────────────────── */}
      <section className="px-6 py-16 md:py-24">
        <div className="mx-auto grid max-w-6xl grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16 items-start">
          <div className="mx-auto w-full max-w-md">
            <img
              src={portrait}
              alt="Portrait of Ani Muradyan, contemporary Armenian oil painter"
              className="w-full aspect-[4/5] object-cover shadow-[0_24px_60px_rgba(0,0,0,0.18)]"
              loading="eager"
              onError={(e) => {
                e.currentTarget.src = backgroundImage;
              }}
            />
          </div>
          <div className="md:pt-6">
            <Eyebrow>Biography</Eyebrow>
            {artistBio?.description && (
              <div className="whitespace-pre-wrap text-sm md:text-base leading-relaxed text-stone-700 max-w-md">
                {artistBio.description}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Artist statement ───────────────────────────────── */}
      {artistBio?.statement && (
        <section className="bg-[#ece7dc] py-20 md:py-28 px-6 text-center">
          <Eyebrow>Artist Statement</Eyebrow>
          <blockquote className="font-playfair italic mx-auto max-w-3xl text-2xl md:text-[32px] leading-snug text-stone-900 whitespace-pre-wrap">
            {artistBio.statement}
          </blockquote>
        </section>
      )}

      {/* ── Education & awards ─────────────────────────────── */}
      {(artistBio?.education || artistBio?.awards) && (
        <section className="px-6 py-20 md:py-24">
          <div className="mx-auto grid max-w-4xl grid-cols-1 sm:grid-cols-2 gap-12">
            {artistBio?.education && (
              <div>
                <Eyebrow>Education</Eyebrow>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700">
                  {artistBio.education}
                </div>
              </div>
            )}
            {artistBio?.awards && (
              <div>
                <Eyebrow>Awards &amp; Recognition</Eyebrow>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700">
                  {artistBio.awards}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Exhibitions ────────────────────────────────────── */}
      {recentExhibitions.length > 0 && (
        <section className="bg-[#eee9df] py-20 md:py-28 px-6">
          <div className="mx-auto max-w-4xl">
            <Eyebrow>Recognition</Eyebrow>
            <h2 className="font-playfair text-4xl md:text-5xl text-stone-900 mb-3">Exhibitions</h2>
            <p className="text-sm text-stone-600 mb-10">
              Ani Muradyan's work has been exhibited internationally and in Armenia.
            </p>
            <div className="border-t border-stone-300">
              {recentExhibitions.map((ex) => (
                <div
                  key={ex.id}
                  className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-8 border-b border-stone-300 py-5"
                >
                  <span className="font-playfair w-16 shrink-0 text-stone-500">{ex.year}</span>
                  <p className="text-sm text-stone-800">
                    <span className="font-semibold">{ex.title}</span>
                    <span className="text-stone-500">
                      {" — "}
                      {[ex.venue, ex.location].filter(Boolean).join(", ")}
                    </span>
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-10">
              <Link href="/exhibitions">
                <OutlineButton>View Exhibitions</OutlineButton>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── Closing CTA ────────────────────────────────────── */}
      <section className="py-24 md:py-32 px-6 text-center">
        <h2 className="font-playfair mx-auto max-w-xl text-4xl md:text-[44px] leading-tight text-stone-900 mb-10">
          See the work behind the story.
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
