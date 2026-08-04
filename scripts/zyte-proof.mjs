// PROOF ONLY — not wired into the app, not committed/deployed.
// Verifies that Zyte's residential/browser rendering retrieves the WAF-protected
// Singulart gallery, then parses it with the EXISTING scraper and counts artworks.
//
//   ZYTE_API_KEY=your_key  npx tsx scripts/zyte-proof.mjs
//
// Writes nothing, touches no database. Just fetch → parse → count.
import { parseSingulartPage } from "../server/singulart-scraper.ts";

const KEY = process.env.ZYTE_API_KEY;
if (!KEY) {
  console.error("Set ZYTE_API_KEY (free trial key from https://www.zyte.com).");
  process.exit(1);
}

const BASE = "https://www.singulart.com/en/artist/ani-muradyan-62448";
const auth = "Basic " + Buffer.from(KEY + ":").toString("base64");

async function fetchViaZyte(url) {
  const res = await fetch("https://api.zyte.com/v1/extract", {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    // browserHtml = full browser render (executes the AWS WAF challenge JS);
    // Zyte auto-selects residential IPs for anti-bot targets.
    body: JSON.stringify({ url, browserHtml: true }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Zyte HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text).browserHtml || "";
}

const seen = new Map();
for (const url of [BASE, `${BASE}?page=2`]) {
  const html = await fetchViaZyte(url);
  const arts = parseSingulartPage(html);
  const blocked = html.includes("awswaf") || html.includes("challenge-container");
  console.log(`${url}`);
  console.log(`  html=${html.length}b  on_challenge=${blocked}  artworks=${arts.length}`);
  for (const a of arts) seen.set(a.id, a);
}

console.log(`\nTOTAL UNIQUE ARTWORKS: ${seen.size}`);
console.log(
  "Sample:",
  [...seen.values()].slice(0, 3).map((a) => `${a.title} ($${a.priceUsd}, ${a.widthCm}x${a.heightCm}cm)`),
);
console.log(
  seen.size >= 24
    ? "\n✅ PROOF PASS — Zyte retrieved the gallery past the WAF; all artworks detected."
    : "\n❌ PROOF FAIL — see output above (0 = still blocked / wrong tier).",
);
