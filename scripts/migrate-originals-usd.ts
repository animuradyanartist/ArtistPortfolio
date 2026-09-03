/**
 * ORIGINALS → USD PRICE MIGRATION — auditable, dry-run by default, NOT run automatically.
 *
 * Sets `websiteCurrency = "USD"` and `websitePriceMinor` to the OWNER-APPROVED USD retail price for
 * the 21 currently Merchant-eligible originals. It is the safe, repeatable alternative to editing 21
 * artworks by hand: it reads each row, shows the exact before → after, and only writes with `--apply`.
 *
 * SAFETY:
 *   - Dry-run by default. Prints the plan and changes NOTHING unless you pass `--apply`.
 *   - Touches ONLY websitePriceMinor + websiteCurrency. Never the marketplace `price`, never orders,
 *     never order snapshots (historical orders keep their own currency/amount and are not read here).
 *   - Idempotent: a row already in USD is skipped. A row whose current currency is not EUR is skipped
 *     with a warning (so a hand-edit is never silently overwritten).
 *   - Connects to whatever DATABASE_URL is set when you run it — point it at production deliberately.
 *
 * USAGE (only after the owner has approved the prices in docs/originals-usd-price-plan.md):
 *   tsx scripts/migrate-originals-usd.ts              # dry-run: prints the plan, writes nothing
 *   tsx scripts/migrate-originals-usd.ts --apply      # performs the update
 *
 * The prices below mirror docs/originals-usd-price-plan.md. CONFIRM/EDIT them before `--apply`.
 */
import { storage } from "../server/storage";
import { parseMajorToMinor } from "../shared/commerce/money";

/** id → approved USD retail price (major units). Edit to the final approved figures before applying. */
const APPROVED_USD_MAJOR: Record<number, number> = {
  53: 450, 58: 450, 60: 450, 55: 500, 14: 550, 56: 550,
  48: 750, 50: 750, 43: 900, 44: 900, 40: 1000, 69: 1100, 74: 1100,
  41: 1200, 42: 1200, 70: 1300, 71: 1300, 72: 1300, 73: 1300, 51: 1550, 62: 1650,
};

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`\nOriginals → USD migration — ${apply ? "APPLY (writing changes)" : "DRY RUN (no writes)"}\n`);

  let planned = 0, skipped = 0, applied = 0;
  for (const [idStr, usdMajor] of Object.entries(APPROVED_USD_MAJOR)) {
    const id = Number(idStr);
    const a = await storage.getArtwork(id);
    if (!a) { console.log(`  id=${id}  SKIP — not found`); skipped++; continue; }

    const newMinor = parseMajorToMinor(usdMajor, "USD");
    if (newMinor == null) { console.log(`  id=${id}  SKIP — bad USD price ${usdMajor}`); skipped++; continue; }

    const curCurrency = a.websiteCurrency ?? "(none)";
    const curMinor = a.websitePriceMinor ?? null;

    if (curCurrency === "USD") { console.log(`  id=${id} "${a.title}"  SKIP — already USD`); skipped++; continue; }
    if (curCurrency !== "EUR") {
      console.log(`  id=${id} "${a.title}"  SKIP — current currency is ${curCurrency}, not EUR (won't overwrite a hand-edit)`);
      skipped++; continue;
    }

    console.log(`  id=${id} "${a.title}"  ${curMinor} ${curCurrency} → ${newMinor} USD  ($${usdMajor})`);
    planned++;

    if (apply) {
      await storage.updateArtwork(id, { websitePriceMinor: newMinor, websiteCurrency: "USD" } as never);
      applied++;
    }
  }

  console.log(`\n${apply ? `Applied ${applied} update(s).` : `Would update ${planned} row(s).`} Skipped ${skipped}.`);
  if (!apply && planned > 0) console.log("Re-run with --apply to write these changes.\n");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
