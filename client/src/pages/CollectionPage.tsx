import { useEffect, useMemo } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Artwork } from "@shared/schema";
import { collectionBySlug, collectionMembers } from "@shared/collections";
import { artworkCommerceDisplay } from "@shared/commerce/display";
import { artworkPath, generateArtworkAlt, updateCanonicalUrl, updateMetaDescription } from "@/lib/seo";
import { artworkDimensions } from "@shared/artworkSsr";
import { Eyebrow, OutlineButton } from "@/components/editorial";

/**
 * A BUYER-INTENT COLLECTION — /collections/:slug.
 *
 * The server prerenders this page's works and structured data (server/routes.ts). On mount the
 * first client render replaces the #collection-ssr fallback, so nothing is duplicated; the
 * membership and copy come from the same shared definition the server used, so the two cannot
 * disagree about which works belong or what the page claims.
 */
export default function CollectionPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const slug = String(params.slug ?? "");
  const def = collectionBySlug(slug);

  const { data: artworks = [] } = useQuery<Artwork[]>({ queryKey: ["/api/artworks"] });

  useEffect(() => {
    if (!def) { setLocation("/artworks"); return; }
    document.title = def.title;
    updateCanonicalUrl(`/collections/${def.slug}`);
    updateMetaDescription(def.metaDescription);
  }, [def, setLocation]);

  const works = useMemo(
    () => (def ? collectionMembers(def, artworks as never[]) as Artwork[] : []),
    [def, artworks],
  );

  if (!def) return null;
  const available = works.filter((w) => w.availability === "available");

  return (
    <main className="min-h-screen bg-[#f5f1ea] px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <Eyebrow>Original Paintings</Eyebrow>
        <h1 className="font-playfair text-4xl md:text-5xl text-stone-900 mb-4">{def.heading}</h1>
        <p className="max-w-2xl text-stone-600 leading-relaxed mb-4">{def.intro}</p>
        {works.length > 0 && (
          <p className="text-[11px] tracking-[0.2em] uppercase text-stone-400 mb-10">
            {available.length} available of {works.length} works
          </p>
        )}

        {works.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-14">
            {works.map((artwork) => (
              <div key={artwork.id} className="animate-fadeIn">
                <Link href={artworkPath(artwork)}>
                  <div className="group aspect-[4/5] overflow-hidden cursor-pointer bg-stone-200">
                    <img
                      src={artwork.images[0]}
                      alt={generateArtworkAlt(artwork.title, artwork.medium)}
                      width={artworkDimensions(artwork as never)?.width}
                      height={artworkDimensions(artwork as never)?.height}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                </Link>
                <h3 className="font-playfair italic text-lg text-stone-900 mt-4">{artwork.title}</h3>
                <p className="text-xs text-stone-500 mt-1">
                  {artwork.medium || "Oil on canvas"} · {artwork.dimensions}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className={`text-sm ${artwork.availability === "available" ? "text-stone-800" : "text-red-600"}`}>
                    {artwork.availability === "available"
                      ? artworkCommerceDisplay(artwork as never).websitePrice ?? "Enquire"
                      : "In a private collection"}
                  </span>
                  <Link href={artworkPath(artwork)}>
                    <span className="text-[10px] tracking-[0.2em] uppercase text-stone-700 border-b border-stone-400 pb-0.5 hover:text-stone-900 hover:border-stone-800 transition-colors">
                      View Work
                    </span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-stone-600">
            Works in this collection are coming soon.{" "}
            <Link href="/artworks"><span className="underline">See all original paintings.</span></Link>
          </p>
        )}

        <div className="mt-16 flex flex-wrap gap-4">
          <Link href="/artworks"><OutlineButton>All Originals</OutlineButton></Link>
          <Link href="/contact"><OutlineButton>Enquire About a Work</OutlineButton></Link>
        </div>
      </div>
    </main>
  );
}
