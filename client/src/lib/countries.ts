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

/** `en-GB` → GB. Returns null rather than a default, so nothing is assumed on her behalf. */
export function guessCountry(): string | null {
  try {
    for (const tag of navigator.languages ?? [navigator.language]) {
      const region = new Intl.Locale(tag).maximize().region;
      if (region && COUNTRY_NAME[region]) return region;
    }
  } catch { /* older browser */ }
  return null;
}

/**
 * Countries in the order a person reads them — by NAME, not by ISO code.
 *
 * Sorting by code put "United Arab Emirates, Armenia, Austria, Australia" at the top of the
 * list, which looks like no order at all to somebody trying to find their own country.
 * `localeCompare` so accented names land where a reader expects them.
 */
export function countryOptions(codes?: readonly string[]): Array<{ code: string; name: string }> {
  const list = (codes && codes.length ? codes : Object.keys(COUNTRY_NAME))
    .filter((c) => COUNTRY_NAME[c])
    .map((code) => ({ code, name: COUNTRY_NAME[code]! }));
  return list.sort((a, b) => a.name.localeCompare(b.name));
}
