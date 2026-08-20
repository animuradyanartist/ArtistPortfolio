/**
 * WHAT A BUYER SENDS IS CHECKED ON THE SERVER, WHATEVER THE FORM DID.
 *
 * These test the validator directly rather than through the route, because the
 * checkout-configuration gate deliberately runs FIRST — so while Stripe is unconfigured every
 * request is refused before validation is reached. That ordering is the safety property, and
 * it means the validator has to be exercised here.
 */
import { describe, it, expect } from "vitest";
import { validateBuyer, validateArtworkIds, sanitiseAttribution } from "./validate";

const good = {
  name: "Anna Beispiel", email: "anna@example.com", phone: "+49 30 1234567",
  country: "DE", address1: "Hauptstraße 1", address2: "", city: "Berlin",
  region: "", postalCode: "10115",
};

describe("buyer details", () => {
  it("accepts a complete German address", () => {
    const r = validateBuyer(good);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.country).toBe("DE");
  });

  it("normalises the country to upper case", () => {
    const r = validateBuyer({ ...good, country: "de" });
    expect(r.ok && r.value.country).toBe("DE");
  });

  const bad: Array<[string, Record<string, unknown>, string]> = [
    ["a missing name",        { ...good, name: "" },            "name"],
    ["a one-letter name",     { ...good, name: "A" },           "name"],
    ["an unparseable email",  { ...good, email: "nope" },       "email"],
    ["an email with no host", { ...good, email: "a@b" },        "email"],
    ["a missing phone",       { ...good, phone: "" },           "phone"],
    ["a phone of punctuation",{ ...good, phone: "---" },        "phone"],
    ["a country we cannot ship to", { ...good, country: "MN" }, "country"],
    ["a blank country",       { ...good, country: "" },         "country"],
    ["a missing street",      { ...good, address1: "" },        "address1"],
    ["a missing city",        { ...good, city: "" },            "city"],
    ["a missing postal code", { ...good, postalCode: "" },      "postalCode"],
  ];
  for (const [label, body, field] of bad) {
    it(`refuses ${label}`, () => {
      const r = validateBuyer(body);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(Object.keys(r.errors)).toContain(field);
    });
  }

  it("requires a state where a courier genuinely needs one", () => {
    for (const c of ["US", "CA", "AU"]) {
      const r = validateBuyer({ ...good, country: c, region: "", postalCode: "90210" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(Object.keys(r.errors)).toContain("region");
    }
  });

  it("does not demand a state where one is not used", () => {
    expect(validateBuyer({ ...good, country: "DE", region: "" }).ok).toBe(true);
  });

  it("refuses absurdly long values rather than storing them", () => {
    expect(validateBuyer({ ...good, name: "x".repeat(200) }).ok).toBe(false);
    expect(validateBuyer({ ...good, address1: "x".repeat(500) }).ok).toBe(false);
  });

  it("survives a hostile body without throwing", () => {
    for (const b of [null, undefined, "string", 42, [], { name: {} }]) {
      expect(validateBuyer(b).ok).toBe(false);
    }
  });
});

describe("the cart the client sends", () => {
  it("accepts a list of ids", () => {
    const r = validateArtworkIds([40, 79]);
    expect(r.ok && r.value).toEqual([40, 79]);
  });

  it("collapses a double-click rather than rejecting it", () => {
    const r = validateArtworkIds([40, 40, 40]);
    expect(r.ok && r.value).toEqual([40]);
  });

  it("refuses an empty cart, junk ids and absurd lengths", () => {
    expect(validateArtworkIds([]).ok).toBe(false);
    expect(validateArtworkIds(["' OR 1=1"]).ok).toBe(false);
    expect(validateArtworkIds([0]).ok).toBe(false);
    expect(validateArtworkIds([-3]).ok).toBe(false);
    expect(validateArtworkIds(null).ok).toBe(false);
    expect(validateArtworkIds(Array.from({ length: 11 }, (_, i) => i + 1)).ok).toBe(false);
  });
});

describe("attribution keeps campaigns and nothing personal", () => {
  it("keeps only the fields it names", () => {
    const out = sanitiseAttribution({
      source: "google", medium: "organic", campaign: "c", landingPath: "/artworks",
      email: "someone@example.com", ip: "1.2.3.4", cookie: "abc",
    });
    const parsed = JSON.parse(out!);
    expect(parsed).toEqual({ source: "google", medium: "organic", campaign: "c", landingPath: "/artworks" });
    expect(out).not.toMatch(/example\.com|1\.2\.3\.4|abc/);
  });

  it("returns null when there is nothing worth keeping", () => {
    expect(sanitiseAttribution({})).toBeNull();
    expect(sanitiseAttribution(null)).toBeNull();
  });
});
