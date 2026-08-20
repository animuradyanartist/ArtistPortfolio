/**
 * COUNTRY NAMES, AND A GUESS AT WHERE THE VISITOR IS.
 *
 * The guess reads the browser's own locale. No IP lookup, no third-party geolocation service,
 * no request that tells somebody else who is looking at a painting — and per PART 5 nothing
 * about eligibility or price depends on it. It only decides which option is preselected in a
 * control the visitor can change.
 */
export const COUNTRY_NAME: Record<string, string> = {
  AM: "Armenia", GE: "Georgia", TR: "Türkiye",
  AT: "Austria", BE: "Belgium", BG: "Bulgaria", HR: "Croatia", CY: "Cyprus", CZ: "Czechia",
  DK: "Denmark", EE: "Estonia", FI: "Finland", FR: "France", DE: "Germany", GR: "Greece",
  HU: "Hungary", IE: "Ireland", IT: "Italy", LV: "Latvia", LT: "Lithuania", LU: "Luxembourg",
  MT: "Malta", NL: "Netherlands", PL: "Poland", PT: "Portugal", RO: "Romania", SK: "Slovakia",
  SI: "Slovenia", ES: "Spain", SE: "Sweden",
  GB: "United Kingdom", CH: "Switzerland", NO: "Norway", IS: "Iceland", LI: "Liechtenstein",
  RS: "Serbia", US: "United States", CA: "Canada",
  AE: "United Arab Emirates", SA: "Saudi Arabia", QA: "Qatar", KW: "Kuwait", BH: "Bahrain", OM: "Oman",
  AU: "Australia", NZ: "New Zealand", JP: "Japan", SG: "Singapore", KR: "South Korea",
  HK: "Hong Kong", IL: "Israel", ZA: "South Africa",
};

/**
 * TIME ZONE → COUNTRY, for the countries this shop quotes.
 *
 * The browser's time zone is a far better signal than its language: a German living in Berlin
 * with an English-language browser reports `en-GB` but `Europe/Berlin`. Language says what
 * somebody reads; the zone says where their clock is, which is much closer to where a parcel
 * would go.
 *
 * It costs nothing and tells nobody: `Intl` answers locally, so no IP lookup and no request to
 * a third party that would reveal who is looking at a painting.
 */
const ZONE_COUNTRY: Readonly<Record<string, string>> = Object.freeze({
  "Asia/Yerevan": "AM", "Asia/Tbilisi": "GE", "Europe/Istanbul": "TR",
  "Europe/Vienna": "AT", "Europe/Brussels": "BE", "Europe/Sofia": "BG", "Europe/Zagreb": "HR",
  "Asia/Nicosia": "CY", "Europe/Nicosia": "CY", "Europe/Prague": "CZ", "Europe/Copenhagen": "DK",
  "Europe/Tallinn": "EE", "Europe/Helsinki": "FI", "Europe/Paris": "FR", "Europe/Berlin": "DE",
  "Europe/Busingen": "DE", "Europe/Athens": "GR", "Europe/Budapest": "HU", "Europe/Dublin": "IE",
  "Europe/Rome": "IT", "Europe/Riga": "LV", "Europe/Vilnius": "LT", "Europe/Luxembourg": "LU",
  "Europe/Malta": "MT", "Europe/Amsterdam": "NL", "Europe/Warsaw": "PL", "Europe/Lisbon": "PT",
  "Atlantic/Madeira": "PT", "Europe/Bucharest": "RO", "Europe/Bratislava": "SK",
  "Europe/Ljubljana": "SI", "Europe/Madrid": "ES", "Atlantic/Canary": "ES", "Europe/Stockholm": "SE",
  "Europe/London": "GB", "Europe/Zurich": "CH", "Europe/Oslo": "NO", "Atlantic/Reykjavik": "IS",
  "Europe/Vaduz": "LI", "Europe/Belgrade": "RS",
  "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US",
  "America/Los_Angeles": "US", "America/Phoenix": "US", "America/Anchorage": "US",
  "Pacific/Honolulu": "US", "America/Detroit": "US",
  "America/Toronto": "CA", "America/Vancouver": "CA", "America/Edmonton": "CA",
  "America/Winnipeg": "CA", "America/Halifax": "CA",
  "Asia/Dubai": "AE", "Asia/Riyadh": "SA", "Asia/Qatar": "QA", "Asia/Kuwait": "KW",
  "Asia/Bahrain": "BH", "Asia/Muscat": "OM",
  "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Australia/Brisbane": "AU",
  "Australia/Perth": "AU", "Australia/Adelaide": "AU",
  "Pacific/Auckland": "NZ", "Asia/Tokyo": "JP", "Asia/Singapore": "SG", "Asia/Seoul": "KR",
  "Asia/Hong_Kong": "HK", "Asia/Jerusalem": "IL", "Africa/Johannesburg": "ZA",
});

/**
 * WHERE IS THIS VISITOR, PROBABLY?
 *
 * Time zone first, then the locale's region. Returns null when neither is a country this shop
 * quotes — the caller decides what to do about that, and per the brief nothing about ELIGIBILITY
 * or price ever depends on the answer. It only chooses which country is preselected in a
 * control the visitor can always change, and it is never trusted at checkout: the order is
 * priced from the address actually typed into the form.
 */
export function guessCountry(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const byZone = zone ? ZONE_COUNTRY[zone] : undefined;
    if (byZone && COUNTRY_NAME[byZone]) return byZone;
  } catch { /* no Intl.DateTimeFormat */ }
  try {
    for (const tag of navigator.languages ?? [navigator.language]) {
      const region = new Intl.Locale(tag).maximize().region;
      if (region && COUNTRY_NAME[region]) return region;
    }
  } catch { /* older browser */ }
  return null;
}

/**
 * THE COUNTRY A PRICE IS SHOWN FOR WHEN NOTHING COULD BE INFERRED.
 *
 * The alternative was showing "Choose a country" and no estimate at all, which asks a visitor
 * to do administration before they are allowed to know what something costs. A stated default
 * with the country named in the sentence — "Shipping to Germany — estimated €403.92" — tells
 * them what they came to find out and is obviously changeable.
 *
 * Germany because it is the largest destination market in the zone she ships to most; the
 * figure is labelled estimated either way, and checkout recomputes from the real address.
 */
export const FALLBACK_COUNTRY = "DE";

/** The country to show an estimate for: inferred, else the stated default. */
export function displayCountry(saved?: string | null): string {
  if (saved && COUNTRY_NAME[saved]) return saved;
  return guessCountry() ?? FALLBACK_COUNTRY;
}

export function countryOptions(codes?: readonly string[]): Array<{ code: string; name: string }> {
  const list = (codes && codes.length ? codes : Object.keys(COUNTRY_NAME))
    .filter((c) => COUNTRY_NAME[c])
    .map((code) => ({ code, name: COUNTRY_NAME[code]! }));
  return list.sort((a, b) => a.name.localeCompare(b.name));
}
