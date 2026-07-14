import { useEffect, useMemo, useRef, useState, type FormEvent, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Artwork } from "@shared/schema";
import { updateCanonicalUrl, updateMetaDescription, generateArtworkAlt } from "@/lib/seo";
import { artworkCategory } from "@/lib/artworkCategory";

/* ============================================================
   PAINTING PATH — Ani Muradyan · a scroll-book
   Each .spread is a page: one painting, one passage.
   The styles live in a scoped <style> under .pp-root so the
   book's generic class names never leak into the rest of the app.
   ============================================================ */

const CSS = `
.pp-root {
  --ground:#F4EFE7; --surface:#FBF8F2; --ink:#2B2926; --ink-soft:#55514A;
  --bluegrey:#77858E; --beige:#C9BCA6; --stone:#E2D9CA; --stone-deep:#D3C7B2;
  --coral:#BE7C68; --coral-soft:rgba(190,124,104,0.16);
  --c1-a:#4B5259; --c1-b:#2E3238; --c1-c:#6C6357;
  --c2-a:#AEB9BC; --c2-b:#DDD6C7; --c2-c:#C9D2D2;
  --c3-a:#C88E76; --c3-b:#E4DBCB; --c3-c:#9FB0B4;
  --measure:60ch;
  --serif:'Baskerville','Hoefler Text','Cormorant Garamond',Georgia,'Times New Roman',serif;
  --sans:'Helvetica Neue','Inter',ui-sans-serif,system-ui,sans-serif;
  position:relative; background:var(--ground); color:var(--ink);
  font-family:var(--serif); -webkit-font-smoothing:antialiased; line-height:1.6;
  overflow-x:clip; min-height:100vh;
}
html.dark .pp-root {
  --ground:#181513; --surface:#211D1A; --ink:#EDE7DC; --ink-soft:#B7AE9F;
  --bluegrey:#93A0A8; --beige:#B6A98F; --stone:#37312A; --stone-deep:#453D33;
  --coral:#CE8A74; --coral-soft:rgba(206,138,116,0.20);
  --c1-a:#3A4046; --c1-b:#1C1F23; --c1-c:#4E463C;
  --c2-a:#899397; --c2-b:#4C4F4C; --c2-c:#5D6A6C;
  --c3-a:#B07A62; --c3-b:#574C3F; --c3-c:#6B7C80;
}
html.pp-snap { scroll-snap-type:y proximity; scroll-behavior:smooth; }
@media (prefers-reduced-motion:reduce) { html.pp-snap { scroll-behavior:auto; } }
.pp-root * { box-sizing:border-box; }
.pp-root::before {
  content:""; position:fixed; inset:0; pointer-events:none; z-index:0;
  opacity:0.5; mix-blend-mode:multiply;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.28'/%3E%3C/svg%3E");
}
html.dark .pp-root::before { mix-blend-mode:screen; opacity:0.22; }
.pp-root .pp__wrap { position:relative; z-index:1; }

.pp-root .eyebrow { font-family:var(--sans); font-size:0.72rem; font-weight:500; letter-spacing:0.32em; text-transform:uppercase; color:var(--bluegrey); margin:0; }
.pp-root .kw { font-family:var(--sans); font-size:0.7rem; letter-spacing:0.14em; text-transform:uppercase; color:var(--ink-soft); }
.pp-root .quote { font-family:var(--serif); font-style:italic; font-size:clamp(1.35rem,2.6vw,2rem); line-height:1.45; color:var(--ink); text-wrap:balance; margin:0; }
.pp-root .body p { font-size:clamp(1.16rem,2.4vw,1.3rem); line-height:1.75; color:var(--ink-soft); margin:0 0 1.5em; max-width:var(--measure); }
.pp-root .body p:last-child { margin-bottom:0; }

.pp-root .reveal { opacity:0; transform:translateY(22px); transition:opacity 1.1s ease, transform 1.1s cubic-bezier(.16,.7,.2,1); }
.pp-root .reveal.in { opacity:1; transform:none; }
@media (prefers-reduced-motion:reduce) { .pp-root .reveal { opacity:1 !important; transform:none !important; transition:none; } }

#pp-progress { position:fixed; top:0; left:0; z-index:30; height:2px; width:0; background:var(--coral); transition:width 0.15s linear; }
.pp-root .pager { position:fixed; bottom:1rem; left:1rem; z-index:20; font-family:var(--sans); font-size:0.62rem; letter-spacing:0.16em; text-transform:uppercase; background:color-mix(in srgb, var(--surface) 80%, transparent); color:var(--ink-soft); border:1px solid var(--stone); border-radius:999px; padding:0.5rem 0.9rem; -webkit-backdrop-filter:blur(6px); backdrop-filter:blur(6px); text-decoration:none; cursor:pointer; transition:color 0.35s ease, border-color 0.35s ease; }
.pp-root .pager:hover { color:var(--ink); border-color:var(--stone-deep); }
.pp-root .pager b { font-weight:500; color:var(--ink); }
.pp-root .pager .contents-link { color:var(--bluegrey); }
.pp-root .pager:hover .contents-link { color:var(--coral); }

.pp-root .cta { position:fixed; bottom:1rem; right:1rem; z-index:20; display:inline-flex; align-items:center; gap:0.55rem; font-family:var(--sans); font-size:0.7rem; font-weight:500; letter-spacing:0.16em; text-transform:uppercase; color:#fff; background:var(--coral); border:1px solid var(--coral); border-radius:999px; padding:0.75rem 1.35rem; text-decoration:none; box-shadow:0 0 0 4px var(--coral-soft), 0 12px 28px -12px color-mix(in srgb, var(--coral) 75%, transparent); opacity:0; transform:translateY(8px); pointer-events:none; transition:opacity 0.5s ease, transform 0.5s ease, background 0.35s ease, border-color 0.35s ease; }
.pp-root .cta.show { opacity:1; transform:none; pointer-events:auto; }
.pp-root .cta:hover { background:var(--ink); border-color:var(--ink); }
.pp-root .cta__dot { width:6px; height:6px; border-radius:50%; background:#fff; }

.pp-root .rail { position:fixed; left:clamp(0.9rem,2.2vw,1.8rem); top:50%; transform:translateY(-50%); height:42vh; width:1px; z-index:15; opacity:0; transition:opacity 0.6s ease; pointer-events:none; }
.pp-root .rail.show { opacity:1; }
.pp-root .rail__line { position:absolute; inset:0; width:1px; background:var(--stone-deep); }
.pp-root .rail__fill { position:absolute; top:0; left:0; width:1px; height:0%; background:var(--coral); transition:height 0.7s ease; }
.pp-root .rail__dot { position:absolute; left:0.5px; top:0%; transform:translate(-50%,-50%); width:9px; height:9px; border-radius:50%; background:var(--coral); transition:top 0.7s ease; }
.pp-root .rail__dot.breathe::before, .pp-root .rail__dot.breathe::after { content:""; position:absolute; inset:0; border-radius:50%; background:var(--coral); }
.pp-root .rail__dot.breathe::before { animation:pp-breathe 3.6s ease-out infinite; }
.pp-root .rail__dot.breathe::after { animation:pp-breathe 3.6s ease-out infinite 1.8s; }
@media (prefers-reduced-motion:reduce) { .pp-root .rail__dot.breathe::before, .pp-root .rail__dot.breathe::after { animation:none; opacity:0; } .pp-root .rail__fill, .pp-root .rail__dot { transition:none; } }
.pp-root .rail__label { position:absolute; left:15px; top:50%; transform:translateY(-50%); font-family:var(--sans); font-style:normal; font-size:0.64rem; letter-spacing:0.2em; text-transform:uppercase; color:var(--coral); white-space:nowrap; }
.pp-root .rail__end { position:absolute; left:50%; transform:translateX(-50%); font-family:var(--sans); font-size:0.56rem; letter-spacing:0.18em; text-transform:uppercase; color:var(--bluegrey); white-space:nowrap; }
.pp-root .rail__end--top { bottom:calc(100% + 10px); }
.pp-root .rail__end--bottom { top:calc(100% + 10px); }
@media (max-width:899px) { .pp-root .rail { display:none; } }

.pp-root .spread { position:relative; min-height:100vh; min-height:100svh; scroll-snap-align:start; display:grid; align-content:center; justify-items:stretch; max-width:1180px; margin:0 auto; padding:clamp(4.5rem,10vh,7rem) clamp(1.5rem,5vw,4rem) clamp(4rem,9vh,6rem); }
.pp-root .runhead { position:absolute; top:clamp(1.1rem,3vh,2rem); left:0; right:0; text-align:center; font-family:var(--sans); font-size:0.6rem; letter-spacing:0.28em; text-transform:uppercase; color:var(--bluegrey); pointer-events:none; }
.pp-root .folio { position:absolute; bottom:clamp(1.1rem,2.6vh,1.8rem); left:0; right:0; text-align:center; font-family:var(--sans); font-size:0.62rem; letter-spacing:0.24em; color:var(--beige); pointer-events:none; }

.pp-root .act { position:relative; }
.pp-root .act--one { background:color-mix(in srgb, var(--bluegrey) 8%, var(--ground)); }
.pp-root .act--two { background:var(--ground); }
.pp-root .act--three { background:color-mix(in srgb, var(--coral) 6%, var(--ground)); }

.pp-root .cover { text-align:center; justify-items:center; padding-block:clamp(2rem,4.5vh,3.5rem); }
.pp-root .cover__title { font-family:var(--serif); font-weight:400; font-size:clamp(3.2rem,9vw,6.5rem); line-height:0.98; letter-spacing:-0.01em; margin:1.4rem 0 0; text-wrap:balance; }
.pp-root .cover__sub { font-family:var(--serif); font-style:italic; font-size:clamp(1.05rem,2.2vw,1.4rem); color:var(--ink-soft); line-height:1.5; margin:1.4rem auto 0; max-width:34rem; }
.pp-root .cover .plate { width:min(380px,72vw,32svh); margin-top:clamp(1.4rem,3.5vh,2.6rem); margin-inline:auto; }
.pp-root .cover .plate__img { aspect-ratio:4 / 5; }
.pp-root .hint { display:inline-flex; flex-direction:column; align-items:center; gap:0.5rem; margin-top:clamp(1rem,3vh,2rem); border:0; background:none; cursor:pointer; font-family:var(--sans); font-size:0.62rem; letter-spacing:0.24em; text-transform:uppercase; color:var(--bluegrey); }
.pp-root .hint::after { content:""; width:1px; height:34px; background:linear-gradient(var(--stone-deep),transparent); }
.pp-root .hint:hover { color:var(--ink); }

.pp-root .letterpage { padding-block:clamp(2.5rem,6vh,4rem); }
.pp-root .letterpage__grid { display:grid; gap:clamp(2rem,5vw,4.5rem); grid-template-columns:1fr; align-items:center; }
@media (min-width:900px) { .pp-root .letterpage__grid { grid-template-columns:1.1fr 0.9fr; } }
.pp-root .letterpage__title { font-family:var(--serif); font-weight:400; font-size:clamp(2rem,4.6vw,3.2rem); line-height:1.05; margin:0.8rem 0 0; text-wrap:balance; }
.pp-root .letter { margin-top:1.8rem; }
.pp-root .letter p { font-size:clamp(1.16rem,2.4vw,1.3rem); line-height:1.75; color:var(--ink-soft); margin:0 0 1.25em; max-width:34rem; }
.pp-root .letter__sign { font-family:var(--serif); font-style:italic; font-size:1.45rem; color:var(--ink); margin:1.5rem 0 0; }
.pp-root .letter__sign small { display:block; font-family:var(--sans); font-style:normal; font-size:0.64rem; letter-spacing:0.2em; text-transform:uppercase; color:var(--bluegrey); margin-top:0.5rem; }
.pp-root .letterpage .plate { max-width:min(400px,80vw); margin-inline:auto; }

.pp-root .contents { text-align:center; justify-items:center; }
.pp-root .contents__title { font-family:var(--serif); font-weight:400; font-size:clamp(1.7rem,3.6vw,2.5rem); margin:0.8rem 0 0; text-wrap:balance; }
.pp-root .toc { width:min(600px,100%); margin-top:clamp(2rem,5vh,3.2rem); text-align:left; }
.pp-root .toc a { display:flex; align-items:baseline; gap:0.8rem; padding:1.05rem 0.2rem; text-decoration:none; color:inherit; transition:background 0.4s ease; }
.pp-root .toc a + a { border-top:1px solid var(--stone); }
.pp-root .toc a:hover { background:color-mix(in srgb, var(--surface) 55%, transparent); }
.pp-root .toc .no { font-family:var(--sans); font-size:0.68rem; letter-spacing:0.18em; color:var(--bluegrey); min-width:2.2ch; }
.pp-root .toc .t { font-family:var(--serif); font-size:clamp(1.15rem,2.4vw,1.5rem); line-height:1.2; }
.pp-root .toc .yr { font-family:var(--sans); font-size:0.62rem; letter-spacing:0.14em; text-transform:uppercase; color:var(--beige); white-space:nowrap; }
.pp-root .toc .dots { flex:1; min-width:2rem; border-bottom:1px dotted var(--stone-deep); transform:translateY(-4px); }
.pp-root .toc .pg { font-family:var(--sans); font-size:0.7rem; letter-spacing:0.1em; color:var(--ink-soft); }
.pp-root .toc .here { display:inline-flex; align-items:center; gap:0.4rem; margin-left:0.6rem; font-family:var(--sans); font-size:0.56rem; letter-spacing:0.18em; text-transform:uppercase; color:var(--coral); }
.pp-root .toc .is-future .t { font-style:italic; color:var(--ink-soft); }

.pp-root .titlepage { text-align:center; justify-items:center; }
.pp-root .titlepage__ghost { font-family:var(--serif); font-weight:400; font-size:clamp(6rem,20vh,13rem); line-height:0.8; color:transparent; -webkit-text-stroke:1px var(--stone-deep); opacity:0.6; margin:0 0 -0.12em; letter-spacing:-0.03em; pointer-events:none; user-select:none; }
.pp-root .titlepage__meta { display:flex; align-items:baseline; justify-content:center; gap:1rem; flex-wrap:wrap; }
.pp-root .titlepage__yr { font-family:var(--sans); font-size:0.72rem; letter-spacing:0.14em; text-transform:uppercase; color:var(--beige); }
.pp-root .titlepage__title { font-family:var(--serif); font-weight:400; font-size:clamp(2.4rem,6vw,4.2rem); line-height:1.02; margin:0.8rem 0 0; text-wrap:balance; }
.pp-root .titlepage__kws { display:flex; flex-wrap:wrap; justify-content:center; gap:0.5rem 0.9rem; margin:1.5rem 0 0; }
.pp-root .titlepage__kws span { position:relative; }
.pp-root .titlepage__kws span + span::before { content:"·"; position:absolute; left:-0.6rem; color:var(--stone-deep); }
.pp-root .titlepage .quote { margin-top:clamp(1.8rem,4vh,2.8rem); max-width:30ch; }
.pp-root .titlepage__arc { font-family:var(--serif); font-size:clamp(1.05rem,2vw,1.2rem); line-height:1.6; color:var(--ink-soft); max-width:44ch; margin:1.6rem auto 0; }
.pp-root .titlepage__badge { display:inline-flex; align-items:center; gap:0.45rem; margin-top:1.2rem; font-family:var(--sans); font-size:0.62rem; letter-spacing:0.18em; text-transform:uppercase; color:var(--coral); }

.pp-root .story__grid { display:grid; gap:clamp(2rem,5vw,5rem); grid-template-columns:1fr; align-items:center; }
@media (min-width:900px) { .pp-root .story__grid { grid-template-columns:0.9fr 1.1fr; } .pp-root .story--alt .story__media { order:2; } }
.pp-root .story__media { position:relative; max-width:min(520px,86vw,52svh); width:100%; margin-inline:auto; }
.pp-root .story:has(.bridge) .story__media { max-width:min(470px,86vw,46svh); }
.pp-root .bloom { position:absolute; inset:-6% -9%; z-index:-1; filter:blur(36px) saturate(1.25); opacity:0.5; pointer-events:none; }
.pp-root .bloom .paint { position:absolute; inset:0; }
html.dark .pp-root .bloom { opacity:0.4; }
.pp-root .when { font-family:var(--sans); font-size:0.7rem; font-weight:500; letter-spacing:0.26em; text-transform:uppercase; color:var(--coral); margin:0 0 0.7rem; }
.pp-root .story__title { position:relative; font-family:var(--serif); font-weight:400; font-size:clamp(1.9rem,4.2vw,3rem); line-height:1.05; color:var(--ink); margin:0 0 1.4rem; padding-top:1.1rem; text-wrap:balance; }
.pp-root .story__title::before { content:""; position:absolute; top:0; left:0.05em; width:2.2rem; height:2px; background:var(--coral); }
.pp-root .story__copy .body p:first-of-type::first-letter { font-size:2.9em; line-height:0.85; float:left; padding:0.08em 0.12em 0 0; color:var(--ink); }
.pp-root .bridge { text-align:center; margin:clamp(1.5rem,4vh,2.5rem) auto 0; max-width:40ch; }
.pp-root .bridge__line { display:block; width:1px; height:26px; margin:0 auto 0.8rem; background:linear-gradient(transparent,var(--stone-deep)); }
.pp-root .bridge__say { font-family:var(--serif); font-style:italic; font-size:clamp(1.05rem,2vw,1.35rem); color:var(--ink-soft); margin:0; text-wrap:balance; }

.pp-root .plate { position:relative; border-radius:3px; background:var(--surface); margin:0; padding:clamp(0.6rem,1.4vw,1rem); box-shadow:0 1px 0 var(--stone), 0 30px 60px -40px rgba(0,0,0,0.45); }
.pp-root .plate__img { position:relative; overflow:hidden; border-radius:1px; aspect-ratio:4 / 5; }
.pp-root .plate__img img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.pp-root .plate__cap { display:flex; justify-content:space-between; align-items:baseline; gap:1rem; padding:0.75rem 0.4rem 0.2rem; font-family:var(--sans); font-size:0.62rem; letter-spacing:0.14em; text-transform:uppercase; color:var(--bluegrey); }
.pp-root .plate__cap .t { color:var(--ink-soft); text-align:right; }
.pp-root .plate--view { cursor:zoom-in; }
.pp-root .plate--view .plate__img::after { content:"Step closer"; position:absolute; left:50%; bottom:0.7rem; transform:translateX(-50%) translateY(4px); font-family:var(--sans); font-size:0.6rem; letter-spacing:0.2em; text-transform:uppercase; color:var(--ink); background:color-mix(in srgb, var(--surface) 88%, transparent); border:1px solid var(--stone); border-radius:999px; padding:0.4rem 0.85rem; opacity:0; transition:opacity 0.35s ease, transform 0.35s ease; pointer-events:none; -webkit-backdrop-filter:blur(4px); backdrop-filter:blur(4px); white-space:nowrap; }
.pp-root .plate--view:hover .plate__img::after { opacity:1; transform:translateX(-50%) translateY(0); }

.pp-room { position:fixed; inset:0; z-index:40; display:none; flex-direction:column; align-items:center; justify-content:center; gap:1.1rem; padding:clamp(1rem,4vh,2.5rem); background:color-mix(in srgb, #2B2926 90%, transparent); -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px); cursor:zoom-out; }
.pp-room.open { display:flex; }
.pp-room__frame { position:relative; overflow:hidden; border-radius:2px; cursor:zoom-in; box-shadow:0 40px 90px -30px rgba(0,0,0,0.7); transition:transform 0.55s cubic-bezier(.2,.7,.2,1); will-change:transform; }
.pp-room__frame.is-close { transform:scale(2.3); cursor:zoom-out; }
@media (prefers-reduced-motion:reduce) { .pp-room__frame { transition:none; } }
.pp-room__frame .paint, .pp-room__frame img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.pp-room__cap { font-family:'Helvetica Neue',sans-serif; font-size:0.64rem; letter-spacing:0.2em; text-transform:uppercase; color:#E2D9CA; margin:0; }
.pp-room__hint { font-family:Georgia,serif; font-style:italic; font-size:0.95rem; color:#C9BCA6; margin:0; opacity:0.85; }
.pp-room__close { position:absolute; top:1rem; right:1rem; border:1px solid rgba(226,217,202,0.4); background:none; color:#E2D9CA; border-radius:999px; width:42px; height:42px; font-size:1.1rem; line-height:1; cursor:pointer; font-family:sans-serif; }
.pp-room__close:hover { border-color:#E2D9CA; }

.pp-root .paint { position:absolute; inset:0; background-size:cover; background-position:center; }
.pp-root .paint.c1 { background:radial-gradient(120% 90% at 30% 18%, var(--c1-c) 0%, transparent 55%), radial-gradient(140% 120% at 78% 88%, var(--c1-a) 0%, transparent 60%), linear-gradient(155deg, var(--c1-b), var(--c1-a)); }
.pp-root .paint.c2 { background:radial-gradient(120% 80% at 22% 78%, var(--c2-c) 0%, transparent 60%), radial-gradient(100% 90% at 80% 20%, rgba(255,255,255,0.33) 0%, transparent 55%), linear-gradient(165deg, var(--c2-b), var(--c2-a)); }
.pp-root .paint.c3 { background:radial-gradient(90% 70% at 62% 40%, var(--c3-a) 0%, transparent 58%), radial-gradient(120% 100% at 20% 85%, var(--c3-c) 0%, transparent 62%), linear-gradient(160deg, var(--c3-b), var(--c3-c)); }
.pp-root .paint.hero-field { background:radial-gradient(80% 60% at 65% 35%, var(--c3-a) 0%, transparent 55%), radial-gradient(120% 110% at 18% 88%, var(--c1-a) 0%, transparent 60%), radial-gradient(90% 80% at 85% 90%, var(--c2-c) 0%, transparent 55%), linear-gradient(155deg, var(--c2-b) 0%, var(--bluegrey) 100%); }

.pp-root .breath { position:relative; display:inline-block; width:14px; height:14px; border-radius:50%; background:var(--coral); }
.pp-root .breath::before, .pp-root .breath::after { content:""; position:absolute; inset:0; border-radius:50%; background:var(--coral); }
.pp-root .breath::before { animation:pp-breathe 3.6s ease-out infinite; }
.pp-root .breath::after { animation:pp-breathe 3.6s ease-out infinite 1.8s; }
@keyframes pp-breathe { 0% { transform:scale(1); opacity:0.55; } 70% { transform:scale(3.6); opacity:0; } 100% { transform:scale(3.6); opacity:0; } }
@media (prefers-reduced-motion:reduce) { .pp-root .breath::before, .pp-root .breath::after { animation:none; opacity:0; } }

.pp-root .invite { text-align:center; justify-items:center; padding-block:clamp(2.5rem,6vh,4rem); }
.pp-root .invite__title { font-family:var(--serif); font-weight:400; font-size:clamp(2.2rem,5.4vw,3.8rem); margin:1rem 0 0; line-height:1.03; text-wrap:balance; }
.pp-root .invite__text { color:var(--ink-soft); margin:1.6rem auto 0; max-width:54ch; text-align:left; }
.pp-root .invite__text p { margin:0 0 1.4em; }
.pp-root .invite__text p:last-child { margin-bottom:0; }
.pp-root .invite__form { display:flex; flex-wrap:wrap; justify-content:center; gap:0.7rem; margin-top:2.2rem; }
.pp-root .invite__form input[type="email"] { font-family:var(--serif); font-size:1.02rem; color:var(--ink); background:var(--surface); border:1px solid var(--stone-deep); border-radius:999px; padding:0.9rem 1.4rem; min-width:min(340px,78vw); outline:none; transition:border-color 0.35s ease, box-shadow 0.35s ease; }
.pp-root .invite__form input[type="email"]::placeholder { color:var(--bluegrey); font-style:italic; }
.pp-root .invite__form input[type="email"]:focus { border-color:var(--coral); box-shadow:0 0 0 4px var(--coral-soft); }
.pp-root .invite__small { font-family:var(--sans); font-size:0.72rem; letter-spacing:0.06em; color:var(--bluegrey); margin:1rem auto 0; max-width:44ch; line-height:1.6; }
.pp-root .invite__thanks { display:none; margin-top:2.2rem; }
.pp-root .invite__thanks.show { display:block; }
.pp-root .invite__thanks .quote { font-size:clamp(1.25rem,2.4vw,1.7rem); }
.pp-root .invite--done .invite__form, .pp-root .invite--done .invite__small { display:none; }
.pp-root .invite__secondary { display:flex; flex-wrap:wrap; justify-content:center; gap:1rem; margin-top:2.6rem; }

.pp-root .btn { font-family:var(--sans); font-size:0.78rem; letter-spacing:0.14em; text-transform:uppercase; padding:0.95rem 1.9rem; border-radius:999px; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; transition:transform 0.35s ease, background 0.35s ease, color 0.35s ease, border-color 0.35s ease; border:0; }
.pp-root .btn:hover { transform:translateY(-2px); }
.pp-root .btn--ghost { background:transparent; color:var(--ink); border:1px solid var(--stone-deep); }
.pp-root .btn--ghost:hover { border-color:var(--ink); }
.pp-root .btn--invite { position:relative; font-size:0.88rem; font-weight:500; letter-spacing:0.16em; padding:1.15rem 2.6rem; background:var(--coral); color:#fff; border:1px solid var(--coral); box-shadow:0 0 0 6px var(--coral-soft), 0 18px 40px -16px color-mix(in srgb, var(--coral) 75%, transparent); }
.pp-root .btn--invite::before { content:""; position:absolute; inset:-1px; border-radius:999px; border:1.5px solid var(--coral); pointer-events:none; animation:pp-halo 2.8s ease-out infinite; }
@keyframes pp-halo { 0% { transform:scale(1); opacity:0.8; } 70% { transform:scale(1.22); opacity:0; } 100% { transform:scale(1.22); opacity:0; } }
.pp-root .btn--invite .arrow { display:inline-block; margin-left:0.7rem; transition:transform 0.35s ease; }
.pp-root .btn--invite:hover { background:var(--ink); border-color:var(--ink); transform:translateY(-3px); box-shadow:0 0 0 8px var(--coral-soft), 0 24px 48px -16px rgba(0,0,0,0.45); }
.pp-root .btn--invite:hover .arrow { transform:translateX(5px); }
.pp-root .btn--invite.btn--down:hover .arrow { transform:translateY(4px); }
@media (prefers-reduced-motion:reduce) { .pp-root .btn--invite::before { animation:none; opacity:0; } .pp-root .btn--invite .arrow { transition:none; } }
.pp-root .letter__cta { margin-top:1.6rem; }
.pp-root .foot { text-align:center; padding:2rem 0 2.6rem; font-family:var(--sans); font-size:0.66rem; letter-spacing:0.2em; text-transform:uppercase; color:var(--bluegrey); }
`;

/* ── artwork selection ─────────────────────────────────────── */
type Plates = {
  cover?: Artwork; c1a?: Artwork; c1b?: Artwork; c1c?: Artwork;
  c2a?: Artwork; c2b?: Artwork; c2c?: Artwork;
  c3a?: Artwork; c3b?: Artwork; c3c?: Artwork;
};

export default function PathPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState("");

  const { data: artworks = [] } = useQuery<Artwork[]>({ queryKey: ["/api/artworks"] });
  const { data: settings = {} } = useQuery<Record<string, string | null>>({ queryKey: ["/api/path-settings"] });
  const { data: bio } = useQuery<{ image?: string | null }>({ queryKey: ["/api/artist-bio"] });

  useEffect(() => {
    document.title = "Painting Path — Ani Muradyan";
    updateCanonicalUrl("/path");
    updateMetaDescription(
      "Painting Path — the journey of painter Ani Muradyan through inner weight, open space, and transformation, told in three chapters and one still unwritten, one painting at a time."
    );
  }, []);

  const plates: Plates = useMemo(() => {
    const used = new Set<number>();
    const take = (a?: Artwork) => { if (a && !used.has(a.id)) { used.add(a.id); return a; } return undefined; };
    const find = (t: string) => artworks.find((a) => a.title === t && !used.has(a.id));
    const chosen = (id?: string | null) => (id ? artworks.find((a) => String(a.id) === String(id) && !used.has(a.id)) : undefined);
    const firstOf = (c: "landscape" | "figurative") => artworks.find((a) => artworkCategory(a) === c && !used.has(a.id));
    const anyLeft = () => artworks.find((a) => !used.has(a.id));
    const anyAvailable = () => artworks.find((a) => a.availability === "available" && !used.has(a.id));

    const cover = take(chosen(settings.heroArtworkId)) || take(find("Evening Calm")) || take(find("Endless Horizon")) || take(firstOf("landscape")) || take(anyLeft());
    const c1a = take(chosen(settings.chapterOneArtworkId)) || take(find("Blue Detachment")) || take(firstOf("figurative")) || take(anyLeft());
    const c1b = take(chosen(settings.chapterOneDetailArtworkId)) || take(find("Strength in Shadows")) || take(find("Reflective Gaze")) || take(firstOf("figurative")) || take(anyLeft());
    const c1c = take(firstOf("figurative")) || take(anyLeft());
    const c2a = take(chosen(settings.chapterTwoArtworkId)) || take(find("Endless Horizon")) || take(firstOf("landscape")) || take(anyLeft());
    const c2b = take(chosen(settings.chapterTwoDetailArtworkId)) || take(find("Quiet Pathway")) || take(firstOf("landscape")) || take(anyLeft());
    const c2c = take(firstOf("landscape")) || take(anyLeft());
    const c3a = take(chosen(settings.chapterThreeArtworkId)) || take(find("Threshold of Memories")) || take(find("Rebirth")) || take(anyAvailable()) || take(anyLeft());
    const c3b = take(anyAvailable()) || take(anyLeft());
    const c3c = take(anyAvailable()) || take(anyLeft());
    return { cover, c1a, c1b, c1c, c2a, c2b, c2c, c3a, c3b, c3c };
  }, [artworks, settings]);

  const portrait = bio?.image || plates.cover?.images?.[0];

  /* ── behaviours: reveal, page/progress/rail, viewing room ── */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.documentElement.classList.add("pp-snap");
    const cleanups: Array<() => void> = [];

    // reveal
    const reveals = Array.from(root.querySelectorAll<HTMLElement>(".reveal"));
    if (!("IntersectionObserver" in window) || reduce) {
      reveals.forEach((e) => e.classList.add("in"));
    } else {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
      }, { threshold: 0.14, rootMargin: "0px 0px -8% 0px" });
      reveals.forEach((e) => io.observe(e));
      cleanups.push(() => io.disconnect());
    }

    // page counter + rail + cta
    const spreads = Array.from(root.querySelectorAll<HTMLElement>(".spread"));
    const pageNow = root.querySelector("#pp-pageNow");
    const pageTotal = root.querySelector("#pp-pageTotal");
    const cta = root.querySelector<HTMLElement>("#pp-walkCta");
    const rail = root.querySelector<HTMLElement>("#pp-rail");
    const railFill = root.querySelector<HTMLElement>("#pp-railFill");
    const railDot = root.querySelector<HTMLElement>("#pp-railDot");
    const railLabel = root.querySelector<HTMLElement>("#pp-railLabel");
    const last = spreads.length;
    if (pageTotal) pageTotal.textContent = String(last);
    if ("IntersectionObserver" in window) {
      const io2 = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const el = en.target as HTMLElement;
          const p = parseInt(el.getAttribute("data-page") || "1", 10);
          if (pageNow) pageNow.textContent = String(p);
          cta?.classList.toggle("show", p >= 3 && p < last);
          const when = el.getAttribute("data-when");
          if (when && rail && railDot && railFill && railLabel) {
            const t = parseFloat(el.getAttribute("data-t") || "0") * 100;
            rail.classList.add("show");
            railDot.style.top = t + "%";
            railFill.style.height = t + "%";
            railLabel.textContent = when;
            railDot.classList.toggle("breathe", t >= 96);
          } else if (rail) {
            rail.classList.remove("show");
          }
        });
      }, { threshold: 0.5 });
      spreads.forEach((s) => io2.observe(s));
      cleanups.push(() => io2.disconnect());
    }

    // progress bar
    const bar = root.querySelector<HTMLElement>("#pp-progress");
    let ticking = false;
    const paint = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      if (bar) bar.style.width = (max > 0 ? (scrollY / max) * 100 : 0) + "%";
      ticking = false;
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(paint); } };
    addEventListener("scroll", onScroll, { passive: true });
    paint();
    cleanups.push(() => removeEventListener("scroll", onScroll));

    // viewing room
    const room = root.querySelector<HTMLElement>("#pp-room");
    const frame = root.querySelector<HTMLElement>("#pp-roomFrame");
    const cap = root.querySelector<HTMLElement>("#pp-roomCap");
    const hint = root.querySelector<HTMLElement>("#pp-roomHint");
    const closeBtn = root.querySelector<HTMLElement>("#pp-roomClose");
    if (room && frame && cap && hint && closeBtn) {
      let ar = 0.8;
      const FAR = "Click the painting to step closer";
      const CLOSE = "Move to wander the surface · click to step back";
      const fit = () => {
        const w = Math.min(innerWidth * 0.9, innerHeight * 0.72 * ar);
        frame.style.width = w + "px";
        frame.style.height = w / ar + "px";
      };
      const openRoom = (plate: HTMLElement) => {
        const src = plate.querySelector(".plate__img")?.firstElementChild as HTMLElement | undefined;
        if (!src) return;
        const clone = src.cloneNode(true) as HTMLElement;
        frame.innerHTML = "";
        frame.appendChild(clone);
        frame.classList.remove("is-close");
        frame.style.transformOrigin = "50% 50%";
        ar = 0.8;
        if (clone.tagName === "IMG") {
          const img = clone as HTMLImageElement;
          const setAr = () => { if (img.naturalHeight) { ar = img.naturalWidth / img.naturalHeight; fit(); } };
          img.complete ? setAr() : img.addEventListener("load", setAr);
        }
        const c = plate.querySelector(".plate__cap .t") || plate.querySelector(".plate__cap span");
        cap.textContent = c ? c.textContent : "";
        hint.textContent = FAR;
        fit();
        room.classList.add("open");
        document.body.style.overflow = "hidden";
      };
      const closeRoom = () => { room.classList.remove("open"); document.body.style.overflow = ""; };
      const plateHandlers: Array<[HTMLElement, () => void]> = [];
      root.querySelectorAll<HTMLElement>(".plate").forEach((p) => {
        if (room.contains(p)) return;
        p.classList.add("plate--view");
        const h = () => openRoom(p);
        p.addEventListener("click", h);
        plateHandlers.push([p, h]);
      });
      const onFrameClick = (ev: MouseEvent) => {
        ev.stopPropagation();
        if (frame.classList.contains("is-close")) {
          frame.classList.remove("is-close");
          hint.textContent = FAR;
        } else {
          const r = frame.getBoundingClientRect();
          frame.style.transformOrigin = ((ev.clientX - r.left) / r.width) * 100 + "% " + ((ev.clientY - r.top) / r.height) * 100 + "%";
          frame.classList.add("is-close");
          hint.textContent = CLOSE;
        }
      };
      const onRoomMove = (ev: MouseEvent) => {
        if (!frame.classList.contains("is-close")) return;
        frame.style.transformOrigin = (ev.clientX / innerWidth) * 100 + "% " + (ev.clientY / innerHeight) * 100 + "%";
      };
      const onClose = (ev: MouseEvent) => { ev.stopPropagation(); closeRoom(); };
      const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape" && room.classList.contains("open")) closeRoom(); };
      const onResize = () => { if (room.classList.contains("open")) fit(); };
      frame.addEventListener("click", onFrameClick);
      room.addEventListener("mousemove", onRoomMove);
      room.addEventListener("click", closeRoom);
      closeBtn.addEventListener("click", onClose);
      addEventListener("keydown", onKey);
      addEventListener("resize", onResize);
      cleanups.push(() => {
        plateHandlers.forEach(([p, h]) => p.removeEventListener("click", h));
        frame.removeEventListener("click", onFrameClick);
        room.removeEventListener("mousemove", onRoomMove);
        room.removeEventListener("click", closeRoom);
        closeBtn.removeEventListener("click", onClose);
        removeEventListener("keydown", onKey);
        removeEventListener("resize", onResize);
      });
    }

    return () => {
      document.documentElement.classList.remove("pp-snap");
      document.body.style.overflow = "";
      cleanups.forEach((fn) => fn());
    };
  }, [plates, portrait]);

  const beginReading = () => {
    rootRef.current?.querySelector("#pp-letter")?.scrollIntoView({ behavior: "smooth" });
  };

  const onInvite = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    setDone(true);
    try {
      await fetch("/api/collectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
    } catch { /* the thank-you still shows; a retry can happen from the homepage */ }
  };

  /* ── a single artwork plate (real image, or a painterly placeholder) ── */
  const plate = (art: Artwork | undefined, capLeft: string, field: string, fieldStyle?: CSSProperties, alt = true) => {
    const img = art?.images?.[0];
    const bg = img ? { backgroundImage: `url("${img}")` } : undefined;
    return (
      <div className="story__media">
        <div className="bloom" aria-hidden="true">
          {img ? <div className="paint" style={bg} /> : <div className={`paint ${field}`} style={fieldStyle} />}
        </div>
        <figure className="plate">
          <div className="plate__img">
            {img ? (
              <img src={img} alt={alt ? generateArtworkAlt(art!.title, art!.medium) : ""} loading="lazy" />
            ) : (
              <div className={`paint ${field}`} style={fieldStyle} />
            )}
          </div>
          <figcaption className="plate__cap">
            <span>{capLeft}</span>
            <span className="t">{art ? art.title : "Replace →"}</span>
          </figcaption>
        </figure>
      </div>
    );
  };

  return (
    <div className="pp-root" ref={rootRef}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div id="pp-progress" aria-hidden="true" />
      <a className="pager" href="#pp-contents" aria-live="polite" title="Back to the contents page">
        Page <b id="pp-pageNow">1</b> / <span id="pp-pageTotal">16</span>&nbsp;·&nbsp;
        <span className="contents-link">Contents</span>
      </a>
      <a className="cta" id="pp-walkCta" href="#chapter-four" aria-label="Go to the sign-up — walk the next chapter with Ani">
        <span className="cta__dot" aria-hidden="true" />Walk with me
      </a>

      <div className="rail" id="pp-rail" aria-hidden="true">
        <span className="rail__end rail__end--top">2021</span>
        <span className="rail__line" />
        <span className="rail__fill" id="pp-railFill" />
        <span className="rail__dot" id="pp-railDot"><i className="rail__label" id="pp-railLabel">2021</i></span>
        <span className="rail__end rail__end--bottom">Next</span>
      </div>

      <div className="pp__wrap">

        {/* PAGE 1 · COVER */}
        <header className="spread cover" data-page="1" id="pp-cover">
          <div className="reveal">
            <p className="eyebrow">Ani Muradyan — Contemporary Oil Painting</p>
            <h1 className="cover__title">Painting Path</h1>
            <p className="cover__sub">A journey through inner weight, open space, and transformation — told in three chapters, and one still unwritten.</p>
            {plate(plates.cover, "Cover", "hero-field")}
            <button className="hint" onClick={beginReading}>Begin reading</button>
          </div>
        </header>

        {/* PAGE 2 · A LETTER FROM ANI */}
        <section className="spread letterpage" data-page="2" id="pp-letter">
          <p className="runhead">An Introduction</p>
          <div className="letterpage__grid reveal">
            <div>
              <p className="eyebrow">Before you turn the page</p>
              <h2 className="letterpage__title">You have found your way into a personal space.</h2>
              <div className="letter">
                <p>What you are about to read is not a portfolio. It is a path — the slow becoming of an artist and her art.</p>
                <p>For years I painted while waiting to feel ready to be seen. The canvas held what I could not yet say in words: it carried weight before I understood the weight was mine, then slowly opened into space and breath. Each painting in this book is an expression of the period I was living through when I made it.</p>
                <p>Read it slowly, the way it was lived. Three chapters are written. The fourth is not — and that one, you can witness.</p>
                <p className="letter__sign">— Ani<small>Painter · Yerevan</small></p>
                <a className="btn btn--invite btn--down letter__cta" href="#ch1-title">Witness how it all started<span className="arrow" aria-hidden="true">↓</span></a>
              </div>
            </div>
            <figure className="plate">
              <div className="plate__img">
                {portrait
                  ? <img src={portrait} alt="Ani Muradyan, contemporary oil painter, in her studio" loading="lazy" />
                  : <div className="paint hero-field" />}
              </div>
              <figcaption className="plate__cap"><span>The artist</span><span className="t">Ani Muradyan</span></figcaption>
            </figure>
          </div>
          <p className="folio">— 2 —</p>
        </section>

        {/* PAGE 3 · CONTENTS */}
        <nav className="spread contents" data-page="3" id="pp-contents" aria-label="Contents">
          <div className="reveal" style={{ width: "100%", display: "grid", justifyItems: "center" }}>
            <p className="eyebrow">Contents</p>
            <h2 className="contents__title">Three chapters written. One still to come.</h2>
            <div className="toc">
              <a href="#ch1-title"><span className="no">I</span><span className="t">The Weight Within</span><span className="yr">2021–2023</span><span className="dots" /><span className="pg">4</span></a>
              <a href="#ch2-title"><span className="no">II</span><span className="t">Toward My Own Language</span><span className="yr">After 2023</span><span className="dots" /><span className="pg">8</span></a>
              <a href="#ch3-title"><span className="no">III</span><span className="t">Returning Changed<span className="here"><span className="breath" style={{ width: 6, height: 6 }} />Now</span></span><span className="yr">Current works</span><span className="dots" /><span className="pg">12</span></a>
              <a href="#chapter-four" className="is-future"><span className="no">IV</span><span className="t">Yet to Be Continued</span><span className="yr">Unwritten</span><span className="dots" /><span className="pg">16</span></a>
            </div>
          </div>
          <p className="folio">— 3 —</p>
        </nav>

        {/* ACT ONE */}
        <div className="act act--one">
          <section className="spread titlepage" data-page="4" id="ch1-title" data-when="2021" data-t="0">
            <div className="reveal">
              <p className="titlepage__ghost" aria-hidden="true">01</p>
              <div className="titlepage__meta"><p className="eyebrow">Chapter One</p><span className="titlepage__yr">2021–2023</span></div>
              <h2 className="titlepage__title">The Weight Within</h2>
              <div className="titlepage__kws kw"><span>Early figurative works</span><span>Emotional density</span><span>Inner burden</span><span>Silence</span><span>Solitude</span></div>
              <p className="quote">“The canvas became the place where the weight inside me first became visible.”</p>
              <p className="titlepage__arc">Where it began: the first honest canvases — and the fears I did not yet have words for.</p>
            </div>
            <p className="folio">— 4 —</p>
          </section>

          <section className="spread story" data-page="5" data-when="2021" data-t="0.06">
            <p className="runhead">Chapter One · The Weight Within</p>
            <div className="story__grid reveal">
              {plate(plates.c1a, "Plate I · 1", "c1")}
              <div className="story__copy">
                <p className="when">2021</p>
                <h3 className="story__title">Standing before my own voice</h3>
                <div className="body">
                  <p>This chapter began at a moment when I was still learning how to stand in front of my own voice.</p>
                  <p>Although I had studied art and had been painting for years, I still felt like a student inside. I was not unsure of my love for painting — that had always been clear — but I was unsure whether I was ready to bring my work into the world. I kept waiting for a certain mastery, a moment when I would finally feel prepared enough to be seen.</p>
                </div>
              </div>
            </div>
            <p className="folio">— 5 —</p>
          </section>

          <section className="spread story story--alt" data-page="6" data-when="2022" data-t="0.2">
            <p className="runhead">Chapter One · The Weight Within</p>
            <div className="story__grid reveal">
              {plate(plates.c1b, "Plate I · 2", "c1", { filter: "brightness(1.15) saturate(1.1)" })}
              <div className="story__copy">
                <p className="when">2022</p>
                <h3 className="story__title">What appeared on the canvas</h3>
                <div className="body">
                  <p>The works that followed were heavy, even before I fully understood why. They carried dark colours, quiet figures, women turned inward, ravens, silence, and a kind of emotional weight that seemed to live beneath the surface.</p>
                  <p>At the time, I was surprised by what appeared on the canvas. Only later did I understand that I was painting what I had been carrying inside.</p>
                </div>
              </div>
            </div>
            <p className="folio">— 6 —</p>
          </section>

          <section className="spread story" data-page="7" data-when="2023" data-t="0.36">
            <p className="runhead">Chapter One · The Weight Within</p>
            <div className="story__grid reveal">
              {plate(plates.c1c, "Plate I · 3", "c1", { filter: "hue-rotate(15deg) brightness(0.9)" })}
              <div className="story__copy">
                <p className="when">2023</p>
                <h3 className="story__title">Difficult, but necessary</h3>
                <div className="body">
                  <p>This period was difficult, but necessary. It was the place where the weight inside me first became visible. The canvas became a space where I could release what I could not yet explain in words.</p>
                </div>
              </div>
            </div>
            <div className="bridge reveal">
              <span className="bridge__line" aria-hidden="true" />
              <p className="bridge__say">But weight, once seen, begins to ask for space.</p>
            </div>
            <p className="folio">— 7 —</p>
          </section>
        </div>

        {/* ACT TWO */}
        <div className="act act--two">
          <section className="spread titlepage" data-page="8" id="ch2-title" data-when="2023" data-t="0.42">
            <div className="reveal">
              <p className="titlepage__ghost" aria-hidden="true">02</p>
              <div className="titlepage__meta"><p className="eyebrow">Chapter Two</p><span className="titlepage__yr">After 2023</span></div>
              <h2 className="titlepage__title">Toward My Own Language</h2>
              <div className="titlepage__kws kw"><span>Release</span><span>Space</span><span>Clarity</span><span>Breath</span><span>Minimalist landscapes and figures</span></div>
              <p className="quote">“The heaviness did not disappear by being denied. It transformed into space.”</p>
              <p className="titlepage__arc">Where the weight became space, and I began to speak in my own language.</p>
            </div>
            <p className="folio">— 8 —</p>
          </section>

          <section className="spread story" data-page="9" data-when="2023" data-t="0.5">
            <p className="runhead">Chapter Two · Toward My Own Language</p>
            <div className="story__grid reveal">
              {plate(plates.c2a, "Plate II · 1", "c2")}
              <div className="story__copy">
                <p className="when">Late 2023</p>
                <h3 className="story__title">Space enters</h3>
                <div className="body">
                  <p>Something changed when I understood that I did not have to carry every burden that had once felt like mine.</p>
                  <p>That realization brought space into my life — and then into my paintings. I began to feel breath, choice, trust, and a new kind of inner freedom. My visual language started to change with me. The works became lighter, cleaner, more open. The forms became quieter, but not less emotional.</p>
                </div>
              </div>
            </div>
            <p className="folio">— 9 —</p>
          </section>

          <section className="spread story story--alt" data-page="10" data-when="2024" data-t="0.6">
            <p className="runhead">Chapter Two · Toward My Own Language</p>
            <div className="story__grid reveal">
              {plate(plates.c2b, "Plate II · 2", "c2", { filter: "brightness(1.08) saturate(0.9)" })}
              <div className="story__copy">
                <p className="when">2024</p>
                <h3 className="story__title">Minimalism as maturity</h3>
                <div className="body">
                  <p>For me, minimalism is not emptiness. It is not a lack of feeling. It is a form of maturity. It is the moment when an artist no longer needs to say everything loudly. A single line can carry what ten lines once tried to explain. A quiet field of colour can hold an entire emotional landscape.</p>
                </div>
              </div>
            </div>
            <p className="folio">— 10 —</p>
          </section>

          <section className="spread story" data-page="11" data-when="2024" data-t="0.68">
            <p className="runhead">Chapter Two · Toward My Own Language</p>
            <div className="story__grid reveal">
              {plate(plates.c2c, "Plate II · 3", "c2", { filter: "hue-rotate(-12deg)" })}
              <div className="story__copy">
                <p className="when">2024</p>
                <h3 className="story__title">A landscape is never only a place</h3>
                <div className="body">
                  <p>Although landscapes became more present in my work, I was still painting the inner world of a person. A landscape, for me, is never only a place. It can be a state of mind, a memory, a longing, a pause, or a movement toward something more honest.</p>
                </div>
              </div>
            </div>
            <div className="bridge reveal">
              <span className="bridge__line" aria-hidden="true" />
              <p className="bridge__say">And space, once entered, asks to be crossed.</p>
            </div>
            <p className="folio">— 11 —</p>
          </section>
        </div>

        {/* ACT THREE */}
        <div className="act act--three">
          <section className="spread titlepage" data-page="12" id="ch3-title" data-when="2025" data-t="0.78">
            <div className="reveal">
              <p className="titlepage__ghost" aria-hidden="true">03</p>
              <div className="titlepage__meta"><p className="eyebrow">Chapter Three</p><span className="titlepage__yr">Current Works</span></div>
              <h2 className="titlepage__title">Returning Changed</h2>
              <div className="titlepage__kws kw"><span>Transformation</span><span>Thresholds</span><span>Return</span><span>Maturity</span><span>Joy</span></div>
              <p className="quote">“They move through obstacles, through silence, through distance, and return changed.”</p>
              <p className="titlepage__arc">Where I return changed — more mature, more joyful, closer to true.</p>
              <span className="titlepage__badge"><span className="breath" style={{ width: 7, height: 7 }} />The chapter being lived now</span>
            </div>
            <p className="folio">— 12 —</p>
          </section>

          <section className="spread story" data-page="13" data-when="2025" data-t="0.84">
            <p className="runhead">Chapter Three · Returning Changed</p>
            <div className="story__grid reveal">
              {plate(plates.c3a, "Plate III · 1", "c3")}
              <div className="story__copy">
                <p className="when">2025</p>
                <h3 className="story__title">Leaving the familiar</h3>
                <div className="body">
                  <p>My current work is about transformation.</p>
                  <p>I am interested in the moment when a person steps outside the familiar — outside comfort, habit, safety, and everything they already know. At first, the space is unknown. It may feel empty, uncertain, even fragile. But slowly, something opens. The person begins to see differently. They move through obstacles, through silence, through distance, and return changed.</p>
                </div>
              </div>
            </div>
            <p className="folio">— 13 —</p>
          </section>

          <section className="spread story story--alt" data-page="14" data-when="2025" data-t="0.9">
            <p className="runhead">Chapter Three · Returning Changed</p>
            <div className="story__grid reveal">
              {plate(plates.c3b, "Plate III · 2", "c3", { filter: "brightness(1.07)" })}
              <div className="story__copy">
                <p className="when">2025</p>
                <h3 className="story__title">Quiet passages</h3>
                <div className="body">
                  <p>This journey feels close to my own.</p>
                  <p>I see my paintings as quiet passages. A figure at the edge of a space. A distant horizon. A field of light. A body turned toward something unseen. These are not literal stories, but emotional thresholds — places where the inner life begins to shift.</p>
                </div>
              </div>
            </div>
            <p className="folio">— 14 —</p>
          </section>

          <section className="spread story" data-page="15" data-when="Now" data-t="0.97">
            <p className="runhead">Chapter Three · Returning Changed</p>
            <div className="story__grid reveal">
              {plate(plates.c3c, "Plate III · 3", "c3", { filter: "hue-rotate(10deg) saturate(0.9)" })}
              <div className="story__copy">
                <p className="when">2026 — Now</p>
                <h3 className="story__title">No longer separate</h3>
                <div className="body">
                  <p>In this chapter, I no longer feel separate from painting. Earlier, I used to stand before art with reverence, almost as if it were something outside of me. I still feel that reverence, but now the distance has changed. Painting is no longer only something I do. It has become part of how I understand life, how I move through it, and how I return to myself.</p>
                </div>
              </div>
            </div>
            <div className="bridge reveal">
              <span className="bridge__line" aria-hidden="true" />
              <p className="bridge__say">This is where the printed pages end. The path does not — it is still being painted.</p>
            </div>
            <p className="folio">— 15 —</p>
          </section>
        </div>

        {/* PAGE 16 · CHAPTER FOUR — THE INVITATION */}
        <section className={`spread invite${done ? " invite--done" : ""}`} data-page="16" id="chapter-four" data-when="Next" data-t="1">
          <div className="reveal">
            <div className="titlepage__meta"><p className="eyebrow">Chapter Four</p><span className="titlepage__yr">To be continued</span></div>
            <h2 className="invite__title">Yet to be continued.</h2>
            <div className="invite__text body">
              <p>I have come to a point of being closer to who I truly am — and I came here through truth. Truth is my only compass now. It is what keeps me on this path.</p>
              <p>Somewhere in my studio, a canvas is still white. I do not know yet what it will carry — only that it will be true. When a new work is born, I will send it to you first: the painting, and the story it came from.</p>
              <p>I would be honoured to have you as part of this journey. Join — it will be a true one. That is my only commitment.</p>
            </div>

            <form className="invite__form" onSubmit={onInvite}>
              <input type="email" name="email" required placeholder="Your email" aria-label="Your email address"
                value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="btn btn--invite" type="submit">Walk with me<span className="arrow" aria-hidden="true">→</span></button>
            </form>
            <p className="invite__small">A letter from the studio, only when there is something true to say. No noise, and you may leave the path at any time.</p>

            <div className={`invite__thanks${done ? " show" : ""}`} role="status">
              <span className="breath" aria-hidden="true" />
              <p className="quote" style={{ marginTop: "1.4rem" }}>Welcome to the path.<br />The next chapter will find you.</p>
            </div>

            <div className="invite__secondary">
              <Link href="/artworks" className="btn btn--ghost">View Original Paintings</Link>
              <Link href="/about" className="btn btn--ghost">Read About the Artist</Link>
            </div>
          </div>
          <p className="folio">— 16 —</p>
        </section>

        <footer className="foot">Ani Muradyan · Painting Path</footer>
      </div>

      {/* the viewing room — a painting alone on a dark wall; click to step close */}
      <div className="pp-room" id="pp-room" role="dialog" aria-modal="true" aria-label="Viewing room">
        <button className="pp-room__close" id="pp-roomClose" aria-label="Close viewing room">&times;</button>
        <div className="pp-room__frame" id="pp-roomFrame" />
        <p className="pp-room__cap" id="pp-roomCap" />
        <p className="pp-room__hint" id="pp-roomHint" />
      </div>
    </div>
  );
}
