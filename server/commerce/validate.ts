/**
 * WHAT A BUYER SENT US, CHECKED BEFORE IT IS BELIEVED.
 *
 * Everything here runs on the server. The same shapes are checked in the browser for a kind
 * error message, but that check is a courtesy — this one is the rule.
 */
import { zoneFor } from "@shared/commerce/zones";

export interface BuyerDetails {
  name: string; email: string; phone: string;
  country: string; address1: string; address2: string | null;
  city: string; region: string | null; postalCode: string;
}

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Deliberately permissive: enough to catch a typo, never enough to reject a real address. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Regions that genuinely need a state/province for a parcel to arrive. */
const REGION_REQUIRED = new Set(["US", "CA", "AU"]);

export function validateBuyer(body: unknown): Validated<BuyerDetails> {
  const b = (body ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const name = str(b.name);
  const email = str(b.email);
  const phone = str(b.phone);
  const country = str(b.country).toUpperCase();
  const address1 = str(b.address1);
  const address2 = str(b.address2);
  const city = str(b.city);
  const region = str(b.region);
  const postalCode = str(b.postalCode);

  if (name.length < 2 || name.length > 120) errors.name = "Please give your full name.";
  if (!EMAIL.test(email) || email.length > 200) errors.email = "Please give a valid email address.";
  // Phone is OPTIONAL — neither Prodigi (it sends phoneNumber only when present) nor our own
  // shipping requires it, and Etsy-style guest checkout does not collect it. If a buyer DOES give a
  // number we sanity-check it isn't junk; a blank phone is always accepted.
  if (phone && phone.replace(/[^\d]/g, "").length < 6) errors.phone = "That phone number looks too short — leave it blank if you'd rather not give one.";
  if (phone.length > 40) errors.phone = "That phone number is too long.";
  if (!country || !zoneFor(country)) errors.country = "Please choose a destination we can ship to.";
  if (address1.length < 3 || address1.length > 200) errors.address1 = "Please give a street address.";
  if (city.length < 1 || city.length > 120) errors.city = "Please give a city.";
  if (postalCode.length < 2 || postalCode.length > 20) errors.postalCode = "Please give a postal code.";
  if (REGION_REQUIRED.has(country) && region.length < 2) {
    errors.region = "Please give a state or province.";
  }
  if (address2.length > 200) errors.address2 = "This line is too long.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { name, email, phone, country, address1, address2: address2 || null, city,
      region: region || null, postalCode },
  };
}

/**
 * The cart, as ids only.
 *
 * The client is never trusted with a price, so a cart is a list of integers. Duplicates are
 * collapsed rather than rejected: an original is quantity one by definition, and a duplicated
 * id is a double-click, not an attempt to buy two.
 */
export function validateArtworkIds(raw: unknown, max = 10): Validated<number[]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, errors: { items: "Your cart is empty." } };
  }
  if (raw.length > max) {
    return { ok: false, errors: { items: `A single order may hold at most ${max} works.` } };
  }
  const ids: number[] = [];
  for (const v of raw) {
    const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
    if (!Number.isInteger(n) || n <= 0) return { ok: false, errors: { items: "Unrecognised item." } };
    if (!ids.includes(n)) ids.push(n);
  }
  return { ok: true, value: ids };
}

/** UTM and landing path only. Never a referrer chain, never anything identifying. */
export function sanitiseAttribution(raw: unknown): string | null {
  const a = (raw ?? {}) as Record<string, unknown>;
  const keep = ["source", "medium", "campaign", "term", "content", "landingPath", "artworkPath"];
  const out: Record<string, string> = {};
  for (const k of keep) {
    const v = str(a[k]);
    if (v) out[k] = v.slice(0, 200);
  }
  return Object.keys(out).length ? JSON.stringify(out) : null;
}
