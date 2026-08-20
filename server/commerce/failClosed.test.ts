/**
 * WITH PAYMENT UNCONFIGURED, NOTHING MAY HAPPEN.
 *
 * No Buy button, no order row, no reservation, no Stripe call. The website price stays
 * visible — it is true and useful — but the action that cannot complete is withheld rather
 * than offered and then refused after somebody has typed their address.
 *
 * The half-configured case is the dangerous one and is tested hardest: with a secret key but
 * no webhook secret, a card CAN be charged and NOTHING can confirm it. The order would sit
 * unpaid, the hold would lapse on schedule, and the painting would go quietly back on sale
 * with the money already taken. That must be refused exactly as hard as no key at all.
 */
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { checkoutBlockedReason, isCheckoutConfigured, stripeMode } from "./stripeClient";

const KEY = "sk_test_" + "x".repeat(40);
const WH = "whsec_" + "y".repeat(32);

const set = (k?: string | null, w?: string | null) => {
  if (k === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = k ?? "";
  if (w === undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = w ?? "";
};

afterEach(() => set(undefined, undefined));

describe("the gate", () => {
  it("is closed with no secrets at all", () => {
    set(undefined, undefined);
    expect(checkoutBlockedReason()).toBe("no-secret-key");
    expect(isCheckoutConfigured()).toBe(false);
  });

  it("is CLOSED with a secret key but no webhook secret — money we could not reconcile", () => {
    set(KEY, undefined);
    expect(checkoutBlockedReason()).toBe("no-webhook-secret");
    expect(isCheckoutConfigured()).toBe(false);
  });

  it("is closed with a webhook secret but no key", () => {
    set(undefined, WH);
    expect(checkoutBlockedReason()).toBe("no-secret-key");
  });

  it("is closed on values that are present but not credible", () => {
    set("", ""); expect(isCheckoutConfigured()).toBe(false);
    set("   ", "   "); expect(isCheckoutConfigured()).toBe(false);
    set("sk_test_short", WH); expect(isCheckoutConfigured()).toBe(false);
    set(KEY, "not-a-signing-secret"); expect(isCheckoutConfigured()).toBe(false);
  });

  it("opens only when both are present and credible", () => {
    set(KEY, WH);
    expect(checkoutBlockedReason()).toBeNull();
    expect(isCheckoutConfigured()).toBe(true);
    expect(stripeMode()).toBe("test");
  });

  it("is read at call time, so adding a secret and restarting is enough", () => {
    set(undefined, undefined);
    expect(isCheckoutConfigured()).toBe(false);
    set(KEY, WH);
    expect(isCheckoutConfigured()).toBe(true);   // no re-import, no rebuild
  });
});

/**
 * The ORDER of the checks is the safety property, so it is asserted against the source itself.
 * A future edit that moves the gate below the order INSERT would still pass every behavioural
 * test above while creating rows and holding paintings for a shop that cannot take payment.
 */
describe("the gate runs before anything can be created", () => {
  const src = fs.readFileSync(path.join(__dirname, "routes.ts"), "utf8");
  const checkout = src.slice(src.indexOf('app.post("/api/commerce/checkout"'), src.indexOf('app.post("/api/commerce/stripe/webhook"'));

  it("checks configuration before creating an order", () => {
    expect(checkout.indexOf("checkoutBlockedReason()")).toBeGreaterThan(-1);
    expect(checkout.indexOf("checkoutBlockedReason()")).toBeLessThan(checkout.indexOf("createOrder("));
  });

  it("checks configuration before reserving an artwork", () => {
    expect(checkout.indexOf("checkoutBlockedReason()")).toBeLessThan(checkout.indexOf("reserveArtwork("));
  });

  it("checks configuration before calling Stripe", () => {
    expect(checkout.indexOf("checkoutBlockedReason()")).toBeLessThan(checkout.indexOf("sessions.create("));
  });

  it("checks configuration before even pricing the order", () => {
    expect(checkout.indexOf("checkoutBlockedReason()")).toBeLessThan(checkout.indexOf("priceOrder("));
  });
});

/**
 * The public surfaces must GATE on the flag, not merely receive it. The first version returned
 * `stripeConfigured` from the API, declared it in the panel's type, and never read it — so a
 * live Buy button was rendered with no Stripe at all.
 */
describe("the public surfaces gate on it", () => {
  const read = (f: string) => fs.readFileSync(path.resolve(__dirname, "..", "..", f), "utf8");

  it("the artwork panel hides Buy now unless checkout is enabled", () => {
    const s = read("client/src/components/PurchasePanel.tsx");
    expect(s).toMatch(/shipping\?\.ok && data\.checkoutEnabled/);
  });

  it("the cart hides its Buy button unless checkout is enabled", () => {
    expect(read("client/src/pages/CartPage.tsx")).toMatch(/data\?\.checkoutEnabled/);
  });

  it("the checkout page refuses to render the address form", () => {
    expect(read("client/src/pages/CheckoutPage.tsx")).toMatch(/checkoutEnabled === false/);
  });

  it("the server tells them, on both surfaces that drive a Buy button", () => {
    const s = read("server/commerce/routes.ts");
    expect(s.match(/checkoutEnabled: isCheckoutConfigured\(\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
