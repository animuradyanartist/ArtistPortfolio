/**
 * PROMO CODES IS A REAL, REACHABLE ADMIN SECTION.
 *
 * These guard the exact regression of "the tab was added but isn't visible / doesn't open":
 *   1. Promo Codes is in the admin navigation data the sidebar renders (under Commerce).
 *   2. The component the tab mounts (AdminPromoCodes) renders its list shell.
 *   3. Its create/edit form shows every field the spec requires (incl. currency only for fixed).
 * The API-reachability half is proven in server/commerce/promoAdminRoutes.test.ts.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ADMIN_NAV } from "./AdminShell";
import AdminPromoCodes, { PromoForm, type Draft } from "./AdminPromoCodes";

describe("Promo Codes appears in the admin navigation", () => {
  it("is a TAB under the Commerce group, keyed 'promo-codes'", () => {
    const commerce = ADMIN_NAV.find((g) => g.heading === "Commerce");
    expect(commerce, "there should be a Commerce nav group").toBeTruthy();
    const tab = commerce?.tabs?.find((t) => t.key === "promo-codes");
    // AdminPage renders <AdminPromoCodes/> for exactly this key; the sidebar renders ADMIN_NAV.
    expect(tab).toBeTruthy();
    expect(tab?.label).toBe("Promo Codes");
  });

  it("the whole nav still exposes every existing section (nothing was dropped)", () => {
    const labels = ADMIN_NAV.flatMap((g) => [...(g.tabs ?? []).map((t) => t.label), ...(g.routes ?? []).map((r) => r.label)]);
    for (const expected of ["Homepage", "Artworks", "Prints", "Articles", "Orders", "Promo Codes"]) {
      expect(labels).toContain(expected);
    }
  });
});

describe("selecting the tab renders AdminPromoCodes", () => {
  it("mounts and shows the list shell (heading + create button)", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <AdminPromoCodes />
      </QueryClientProvider>,
    );
    expect(html).toContain("Promo codes");
    expect(html).toContain("New promo code");
  });
});

const draft = (over: Partial<Draft> = {}): Draft => ({
  code: "SAVE10", discountType: "percentage", amount: "10", currency: "EUR",
  appliesTo: "all", active: true, validFrom: "", expiresAt: "", ...over,
});
const form = (d: Draft) =>
  renderToStaticMarkup(<PromoForm draft={d} errors={{}} saving={false} onChange={() => {}} onCancel={() => {}} onSave={() => {}} />);

describe("the create/edit form has every required field", () => {
  it("percentage: Code, type, value, applies-to, active, valid-from, expiry — and NO currency", () => {
    const html = form(draft({ discountType: "percentage" }));
    expect(html).toContain(">Code<");
    expect(html).toContain(">Discount type<");
    expect(html).toContain("Percentage");
    expect(html).toContain("Fixed amount");
    expect(html).toContain("Percent (1–100)");
    expect(html).toContain(">Applies to<");
    expect(html).toContain("All products");
    expect(html).toContain("Originals only");
    expect(html).toContain("Prints only");
    expect(html).toContain("Active");
    expect(html).toContain("Valid from");
    expect(html).toContain("Expires");
    expect(html).toContain(">Save<");
    expect(html).not.toContain(">Currency<"); // currency is hidden for a percentage
  });

  it("fixed: the Currency selector appears with the store currencies", () => {
    const html = form(draft({ discountType: "fixed" }));
    expect(html).toContain(">Currency<");
    expect(html).toContain(">EUR<");
    expect(html).toContain(">USD<");
    expect(html).toContain(">Amount<");
  });
});
