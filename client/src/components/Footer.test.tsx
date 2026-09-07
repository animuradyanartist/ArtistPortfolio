/**
 * The trust footer's ONE job: surface the business identity and EVERY policy/trust page from every
 * public page, so Google Merchant Center can find the store's contact and policies. Asserted against
 * the exported FOOTER_LINKS constant that drives the render (no DOM harness in this repo) so the
 * guarantee "the footer links to About, Contact, Shipping, Returns, Privacy and Terms" cannot regress.
 */
import { describe, it, expect } from "vitest";
import { FOOTER_LINKS } from "./Footer";

describe("global trust footer links", () => {
  const required = ["/about", "/contact", "/shipping", "/returns", "/privacy", "/terms"];

  it("links to every required policy/trust page", () => {
    const hrefs = FOOTER_LINKS.map((l) => l.href);
    for (const href of required) expect(hrefs).toContain(href);
  });

  it("every link has a non-empty human label", () => {
    for (const l of FOOTER_LINKS) expect(l.label.trim().length).toBeGreaterThan(0);
  });
});
