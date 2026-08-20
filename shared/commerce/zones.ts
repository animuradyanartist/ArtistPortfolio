/**
 * WHERE A PAINTING CAN GO, AS DATA.
 *
 * The brief asks for country→zone mapping that is configuration rather than scattered
 * conditionals, and this is that file. Adding a country is an edit here and nowhere else.
 *
 * A country ABSENT from this table is not an error and not a zero — it is a destination this
 * system declines to quote, which shipping.ts turns into "Shipping quote required". That is
 * the conservative direction: an unlisted country charged at a guessed rate is a painting
 * shipped at a loss.
 */

export const SHIPPING_ZONES = [
  "AM",        // domestic Armenia
  "NEARBY",    // Georgia and the immediate region
  "EU",        // European Union / continental Europe
  "UK",
  "EU_NON_EU", // Switzerland, Norway and other non-EU Europe
  "NA",        // USA / Canada
  "GCC",       // UAE and the Gulf
  "ROW",       // everywhere else this system is willing to quote
] as const;
export type ShippingZone = (typeof SHIPPING_ZONES)[number];

export const ZONE_LABEL: Record<ShippingZone, string> = {
  AM: "Armenia",
  NEARBY: "Neighbouring region",
  EU: "European Union",
  UK: "United Kingdom",
  EU_NON_EU: "Non-EU Europe",
  NA: "USA & Canada",
  GCC: "Gulf states",
  ROW: "Rest of world",
};

/** ISO-3166-1 alpha-2 → zone. The only place a country is classified. */
export const COUNTRY_ZONE: Readonly<Record<string, ShippingZone>> = Object.freeze({
  AM: "AM",
  GE: "NEARBY", TR: "NEARBY",

  AT: "EU", BE: "EU", BG: "EU", HR: "EU", CY: "EU", CZ: "EU", DK: "EU", EE: "EU",
  FI: "EU", FR: "EU", DE: "EU", GR: "EU", HU: "EU", IE: "EU", IT: "EU", LV: "EU",
  LT: "EU", LU: "EU", MT: "EU", NL: "EU", PL: "EU", PT: "EU", RO: "EU", SK: "EU",
  SI: "EU", ES: "EU", SE: "EU",

  GB: "UK",
  CH: "EU_NON_EU", NO: "EU_NON_EU", IS: "EU_NON_EU", LI: "EU_NON_EU", RS: "EU_NON_EU",

  US: "NA", CA: "NA",

  AE: "GCC", SA: "GCC", QA: "GCC", KW: "GCC", BH: "GCC", OM: "GCC",

  AU: "ROW", NZ: "ROW", JP: "ROW", SG: "ROW", KR: "ROW", HK: "ROW", IL: "ROW", ZA: "ROW",
});

export function zoneFor(countryCode: string | null | undefined): ShippingZone | null {
  if (!countryCode) return null;
  return COUNTRY_ZONE[countryCode.trim().toUpperCase()] ?? null;
}

/** Countries the shop will quote, for the destination selector. */
export function supportedCountries(): string[] {
  return Object.keys(COUNTRY_ZONE).sort();
}

/**
 * EU membership, for the duties note only.
 *
 * Armenia is outside the EU customs union, so a shipment into it is an import everywhere in
 * this table. This flag only decides the WORDING of a factual warning — it is not a tax
 * engine and nothing is ever collected on the strength of it. See PART 10.
 */
export function isLikelyImportDutiable(zone: ShippingZone): boolean {
  return zone !== "AM";
}
