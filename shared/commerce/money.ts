/**
 * MONEY, IN MINOR UNITS, ALWAYS.
 *
 * Stripe charges in minor units and so does this system, end to end. A price is never a
 * float in this codebase: 2420.00 cannot be represented exactly in binary floating point,
 * and a rounding error in a shipping subtotal is a rounding error in what somebody is
 * charged for a painting.
 *
 * The existing `artworks.price` column is an INTEGER holding whole marketplace units — it
 * predates this module and is NOT touched. `websitePriceMinor` is a new, separate column
 * in minor units. The two never convert into one another.
 */

/** Currencies this system will price a painting in. USD is the default (site-wide direct sale). */
export const SUPPORTED_CURRENCIES = ["EUR", "USD", "GBP"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

// Direct-sale commerce (prints AND originals) is standardised on USD. This is the currency a
// work resolves to when its own `websiteCurrency` is unset or invalid; existing rows that state
// a currency explicitly are unaffected. Was EUR before the originals→USD standardisation.
export const DEFAULT_CURRENCY: Currency = "USD";

/** Every supported currency happens to have 2 decimal places; stated rather than assumed. */
const MINOR_UNITS_PER_MAJOR: Record<Currency, number> = { EUR: 100, USD: 100, GBP: 100 };

export function isCurrency(v: unknown): v is Currency {
  return typeof v === "string" && (SUPPORTED_CURRENCIES as readonly string[]).includes(v);
}

/** Parse an admin-entered major-unit amount ("2420", "2420.50") into minor units. */
export function parseMajorToMinor(input: string | number, currency: Currency): number | null {
  const raw = typeof input === "number" ? String(input) : input.trim().replace(/,/g, "");
  if (!raw || !/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const [whole, frac = ""] = raw.split(".");
  const per = MINOR_UNITS_PER_MAJOR[currency];
  const minor = Number(whole) * per + Number((frac + "00").slice(0, 2));
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Minor units back to a plain major-unit string, for form fields. Never for arithmetic. */
export function minorToMajorString(minor: number, currency: Currency): string {
  const per = MINOR_UNITS_PER_MAJOR[currency];
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minor));
  return `${sign}${Math.floor(abs / per)}.${String(abs % per).padStart(2, "0")}`;
}

/**
 * Display, in the visitor's locale but the artwork's currency.
 *
 * `Intl` is given the minor amount divided by the unit only at the very last step, where the
 * value stops being arithmetic and becomes a string.
 */
export function formatMoney(minor: number, currency: Currency, locale = "en-GB"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(minor / MINOR_UNITS_PER_MAJOR[currency]);
}

/** Sum that refuses to silently produce a non-integer. */
export function sumMinor(parts: readonly number[]): number {
  let total = 0;
  for (const p of parts) {
    if (!Number.isInteger(p)) throw new Error(`money must be an integer minor amount, got ${p}`);
    total += p;
  }
  return total;
}
