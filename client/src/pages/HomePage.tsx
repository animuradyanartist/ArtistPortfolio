import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Artwork, HomepageSettings, ArtistBio, Exhibition } from "@shared/schema";
import backgroundImage from "@assets/1bg_1750936488071.png";
import { updateCanonicalUrl, updateMetaDescription, artworkPath, generateArtworkAlt } from "@/lib/seo";
import { SHOW_PRICES } from "@/lib/featureFlags";
import { useToast } from "@/hooks/use-toast";
import { Eyebrow, OutlineButton, ViewLink } from "@/components/editorial";

const NAVY = "#0d1434";
const SAGE = "#9c9d95";

export default function HomePage() {
  useEffect(() => {
    document.title = "Ani Muradyan – Contemporary Artist";
    updateCanonicalUrl("/");
    updateMetaDescription(
      "Ani Muradyan is an Armenian contemporary oil painter whose figurative works and landscapes create quiet moments of emotional clarity, distance, hope, and reflection."
    );
  }, []);

  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [joining, setJoining] = useState(false);

  const { data: homepageSettings } = useQuery<HomepageSettings>({
    queryKey: ["/api/homepage-settings"],
  });
  const { data: artworks = [] } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks"],
  });
  const { data: artistBio } = useQuery<ArtistBio>({
    queryKey: ["/api/artist-bio"],
  });
  const { data: exhibitions = [] } = useQuery<Exhibition[]>({
    queryKey: ["/api/exhibitions"],
  });

  // Used as the About-section fallback portrait
  const heroImage = homepageSettings?.heroImage || backgroundImage;

  // Curated picks for the two category cards — prefer known pieces, fall back by index
  const figurativeCard =
    artworks.find((a) => a.title === "Reconstruction") || artworks[1] || artworks[0];
  const landscapeCard =
    artworks.find((a) => a.title === "Endless Horizon") || artworks[0];

  // "Available Original Paintings" must only show pieces a collector can
  // actually buy — never sold (or reserved) works.
  const collectArtworks = artworks
    .filter((a) => a.availability === "available")
    .slice(0, 6);
  const roomArtworks = [
    artworks.find((a) => a.title === "Silent Bliss") || artworks[2],
    landscapeCard,
  ].filter(Boolean) as Artwork[];

  // Admin-managed "Where the work lives" images (uploaded via the admin tool).
  // Each item is { image, caption }. When set, these replace the fallback
  // mock-up below. Parsed defensively so bad/old data never breaks the page.
  const roomItems: { image: string; caption?: string }[] = (() => {
    try {
      const parsed = JSON.parse(homepageSettings?.roomItems || "[]");
      return Array.isArray(parsed)
        ? parsed.filter((x) => x && typeof x.image === "string" && x.image.trim())
        : [];
    } catch {
      return [];
    }
  })();

  const recentExhibitions = [...exhibitions]
    .sort((a, b) => (b.year || 0) - (a.year || 0))
    .slice(0, 7);

  const priceLabel = (artwork: Artwork) => {
    if (artwork.availability !== "available") {
      return artwork.availability === "reserved" ? "Reserved" : "Sold";
    }
    if (SHOW_PRICES && artwork.price) return `€${artwork.price.toLocaleString()}`;
    return "Inquire";
  };

  const joinCollectorList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setJoining(true);
    try {
      const res = await fetch("/api/collectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) throw new Error("Request failed");
      toast({
        title: "Welcome to the collector list",
        description: "You'll receive new paintings and studio updates before public release.",
      });
      setEmail("");
    } catch {
      toast({
        title: "Something went wrong",
        description: "Please try again, or email animuradyan.artist@gmail.com directly.",
        variant: "destructive",
      });
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden" style={{ backgroundColor: NAVY }}>
        <div className="relative h-[72vh] md:h-[88vh] min-h-[480px]">
          {/* Soft-motion painting loop */}
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster="/hero-poster.jpg"
            aria-label="Animated painting by Ani Muradyan"
            className="absolute inset-0 h-full w-full object-cover"
          >
            <source src="/hero-loop.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0" style={{ backgroundColor: "rgba(13,20,52,0.55)" }} />

          {/* Centered name */}
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
            <div>
              <p
                className="text-white/90 font-extralight text-lg md:text-2xl animate-fadeIn"
                style={{ fontFamily: "'Poppins', sans-serif" }}
              >
                Hello, I am
              </p>
              <h1
                className="whitespace-nowrap leading-tight text-[13vw] sm:text-[10vw] md:text-[7.5vw] animate-slideUp"
                style={{ fontFamily: "'SHK Dzeragir', 'Playfair Display', serif", fontStyle: "italic", letterSpacing: "0.02em" }}
              >
                <span style={{ color: SAGE }}>Ani </span>
                <span className="text-white">Murad</span>
                <span style={{ color: SAGE }}>yan</span>
              </h1>
              <p
                className="font-extralight text-xl md:text-[2.75vw] animate-slideUp animation-delay-200"
                style={{ fontFamily: "'Poppins', sans-serif" }}
              >
                <span style={{ color: SAGE }}>Contempor</span>
                <span className="text-white">ary Artist</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Intro statement ──────────────────────────────────── */}
      <section className="py-20 md:py-28 px-6">
        <p className="font-playfair mx-auto max-w-3xl text-center text-2xl md:text-[28px] leading-relaxed text-stone-800">
          Ani Muradyan is an Armenian contemporary oil painter whose figurative works and
          landscapes create quiet moments of emotional clarity, distance, hope, and reflection.
        </p>
      </section>

      {/* ── Explore the Work ─────────────────────────────────── */}
      <section className="pb-20 md:pb-28 px-6">
        <h2 className="font-playfair text-center text-4xl md:text-[40px] text-stone-900 mb-12">
          Explore the Work
        </h2>
        <div className="mx-auto grid max-w-6xl grid-cols-1 md:grid-cols-2 gap-8">
          {[
            {
              artwork: figurativeCard,
              title: "Figurative Works",
              copy: "Human presence, emotional connection, inner silence, and quiet strength.",
              cta: "View Figurative Works",
            },
            {
              artwork: landscapeCard,
              title: "Landscapes",
              copy: "Open space, light, distance, memory, and the emotional atmosphere of the world outside.",
              cta: "View Landscapes",
            },
          ].map(
            (card) =>
              card.artwork && (
                <Link key={card.title} href="/artworks">
                  <div className="group relative aspect-[4/5] md:aspect-[4/5] overflow-hidden cursor-pointer">
                    <img
                      src={card.artwork.images[0]}
                      alt={card.title}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/5" />
                    <div className="absolute bottom-0 left-0 p-7 text-white">
                      <h3 className="font-playfair text-2xl md:text-3xl mb-2">{card.title}</h3>
                      <p className="max-w-xs text-sm text-white/85 mb-4">{card.copy}</p>
                      <span className="text-[10px] tracking-[0.2em] uppercase border-b border-white/60 pb-0.5 group-hover:border-white transition-colors">
                        {card.cta}
                      </span>
                    </div>
                  </div>
                </Link>
              )
          )}
        </div>
      </section>

      {/* ── Available Original Paintings ─────────────────────── */}
      <section className="bg-[#eee9df] py-20 md:py-28 px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-6 mb-12">
            <div>
              <Eyebrow>To Collect</Eyebrow>
              <h2 className="font-playfair text-4xl md:text-5xl text-stone-900 mb-4">
                Available Original Paintings
              </h2>
              <p className="max-w-sm text-sm text-stone-600">
                A curated selection of original oil paintings on canvas, available for collectors.
              </p>
            </div>
            <Link href="/artworks">
              <ViewLink>View All Originals</ViewLink>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-14">
            {collectArtworks.map((artwork) => (
              <div key={artwork.id}>
                <Link href={artworkPath(artwork)}>
                  <div className="group aspect-[4/5] overflow-hidden cursor-pointer bg-stone-200">
                    <img
                      src={artwork.images[0]}
                      alt={generateArtworkAlt(artwork.title, artwork.medium)}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                </Link>
                <h3 className="font-playfair italic text-lg text-stone-900 mt-4">
                  {artwork.title}
                </h3>
                <p className="text-xs text-stone-500 mt-1">
                  {artwork.medium || "Oil on canvas"} · {artwork.dimensions}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-stone-800">{priceLabel(artwork)}</span>
                  <Link href={artworkPath(artwork)}>
                    <ViewLink>View Work</ViewLink>
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center">
            <Link href="/artworks">
              <OutlineButton>View All Originals</OutlineButton>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Quote band ───────────────────────────────────────── */}
      <section className="bg-[#ece7dc] py-24 md:py-32 px-6 text-center">
        <blockquote className="font-playfair italic mx-auto max-w-3xl text-3xl md:text-4xl leading-snug text-stone-900">
          “{homepageSettings?.heroQuote?.trim() || "I paint the dialogue between inner life and the world outside."}”
        </blockquote>
        <p className="mt-8 text-[11px] tracking-[0.3em] uppercase text-stone-500">Ani Muradyan</p>
      </section>

      {/* ── Where the work lives ─────────────────────────────── */}
      {(roomItems.length > 0 || roomArtworks.length > 0) && (
        <section className="py-20 md:py-28 px-6">
          <div className="mx-auto max-w-6xl">
            <Eyebrow>In Your Space</Eyebrow>
            <h2 className="font-playfair text-4xl md:text-5xl text-stone-900 mb-4">
              Where the work lives
            </h2>
            <p className="max-w-md text-sm text-stone-600 mb-12">
              Each painting is made to hold a room quietly — to change with the light through the
              day and settle into the life around it.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {roomItems.length > 0
                ? // Admin-uploaded photos: show them directly, no mock-up frame.
                  roomItems.map((item, i) => (
                    <figure key={i}>
                      <div className="aspect-[16/10] overflow-hidden bg-stone-200 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
                        <img
                          src={item.image}
                          alt={item.caption || "Ani Muradyan painting shown in an interior"}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      {item.caption?.trim() && (
                        <figcaption className="font-playfair italic text-xs text-stone-500 mt-3">
                          {item.caption}
                        </figcaption>
                      )}
                    </figure>
                  ))
                : // Fallback: CSS room mock-up with a couple of paintings.
                  roomArtworks.map((artwork, i) => (
                    <figure key={artwork.id}>
                      {/* CSS room mock-up: wall, framed painting, floor */}
                      <div
                        className="relative aspect-[16/10] overflow-hidden"
                        style={{
                          background:
                            i % 2 === 0
                              ? "linear-gradient(to bottom, #d8cfc4 78%, #a89a89 78%, #93857a 100%)"
                              : "linear-gradient(to bottom, #d6d6d2 78%, #a4988c 78%, #8f8378 100%)",
                        }}
                      >
                        <div className="absolute left-1/2 top-[12%] w-[34%] -translate-x-1/2 bg-white p-[3%] shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                          <img
                            src={artwork.images[0]}
                            alt={`${artwork.title} shown in an interior`}
                            className="block w-full"
                            loading="lazy"
                          />
                        </div>
                      </div>
                      <figcaption className="font-playfair italic text-xs text-stone-500 mt-3">
                        “{artwork.title}”{" "}
                        {artwork.availability === "sold"
                          ? "— in a private collection"
                          : "— available as an original oil painting"}
                      </figcaption>
                    </figure>
                  ))}
            </div>
          </div>
        </section>
      )}

      {/* ── The Path (invitation) ────────────────────────────── */}
      <section className="bg-[#f8f4ed] py-20 md:py-28 px-6">
        <div className="mx-auto grid max-w-6xl grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="mx-auto w-full max-w-md">
            <img
              src={(landscapeCard || figurativeCard)?.images?.[0] || artistBio?.image || heroImage}
              alt="A painting from Ani Muradyan's series, The Path"
              className="w-full shadow-[0_24px_60px_rgba(0,0,0,0.18)]"
              loading="lazy"
            />
          </div>
          <div>
            <Eyebrow>The Path</Eyebrow>
            <h2 className="font-playfair text-4xl md:text-5xl text-stone-900 mb-6">
              From Silence to Open Space
            </h2>
            <p className="font-playfair italic text-lg text-stone-600 mb-5 max-w-md">
              I paint the moment when an inner state becomes a landscape.
            </p>
            <p className="max-w-md text-sm leading-relaxed text-stone-700 mb-8">
              Over time, my work has moved from enclosed figures and emotional weight toward open
              horizons, quiet fields of colour, and the uncertain space of becoming.
            </p>
            <Link href="/path">
              <OutlineButton>Enter The Path</OutlineButton>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Exhibitions ──────────────────────────────────────── */}
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

      {/* ── Collector list ───────────────────────────────────── */}
      <section className="bg-[#ece7dc] py-20 md:py-28 px-6 text-center">
        <Eyebrow>Private Previews</Eyebrow>
        <h2 className="font-playfair text-4xl md:text-5xl text-stone-900 mb-4">
          Join the Collector List
        </h2>
        <p className="mx-auto max-w-md text-sm text-stone-600 mb-8">
          Receive new paintings, available works, studio updates, and private previews before
          public release.
        </p>
        <form
          onSubmit={joinCollectorList}
          className="mx-auto flex max-w-md flex-col sm:flex-row gap-3"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email address"
            className="flex-1 border border-stone-300 bg-white px-4 py-3 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-stone-500"
          />
          <button
            type="submit"
            disabled={joining}
            className="px-6 py-3 text-[11px] tracking-[0.2em] uppercase text-stone-50 disabled:opacity-60 transition-colors"
            style={{ backgroundColor: "#26221c" }}
          >
            {joining ? "Joining…" : "Join the List"}
          </button>
        </form>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────── */}
      <section className="py-24 md:py-32 px-6 text-center">
        <h2 className="font-playfair mx-auto max-w-xl text-4xl md:text-[44px] leading-tight text-stone-900 mb-10">
          Discover original oil paintings and fine art prints by Ani Muradyan.
        </h2>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/artworks">
            <span
              className="inline-block px-6 py-3 text-[11px] tracking-[0.2em] uppercase text-stone-50 hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#26221c" }}
            >
              View Available Originals
            </span>
          </Link>
          <Link href="/contact">
            <OutlineButton>Contact the Artist</OutlineButton>
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="bg-[#efeae0] border-t border-stone-300 px-6 pt-16 pb-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <div>
              <h3 className="font-playfair text-xl text-stone-900 mb-2">Ani Muradyan</h3>
              <p className="text-xs text-stone-500">
                Contemporary oil painter · Yerevan, Armenia
              </p>
            </div>
            <ul className="space-y-2 text-sm text-stone-700">
              <li><Link href="/artworks" className="hover:text-stone-900 transition-colors">Originals</Link></li>
              <li><Link href="/prints" className="hover:text-stone-900 transition-colors">Prints</Link></li>
              <li><Link href="/exhibitions" className="hover:text-stone-900 transition-colors">Exhibitions</Link></li>
              <li><Link href="/gallery" className="hover:text-stone-900 transition-colors">Gallery</Link></li>
            </ul>
            <ul className="space-y-2 text-sm text-stone-700">
              <li>
                <a
                  href="https://www.instagram.com/animoria.art/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-stone-900 transition-colors"
                >
                  Instagram
                </a>
              </li>
              <li>
                <a
                  href="mailto:animuradyan.artist@gmail.com"
                  className="hover:text-stone-900 transition-colors"
                >
                  animuradyan.artist@gmail.com
                </a>
              </li>
              <li><Link href="/contact" className="hover:text-stone-900 transition-colors">Contact</Link></li>
            </ul>
          </div>
          <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-stone-300 pt-6 text-xs text-stone-500">
            <p>© {new Date().getFullYear()} Ani Muradyan. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <p>Made with care in Yerevan</p>
              <Link href="/admin" className="text-stone-400 hover:text-stone-600">Admin</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
