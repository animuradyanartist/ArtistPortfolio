/**
 * A PRODUCTION-SAFE $1 PAYMENT TEST — isolated, additive, and off by default.
 *
 * The site owner needs to verify the real Stripe Checkout → webhook → order-marked-paid chain
 * with a genuine $1 payment, but there is no way to create a test artwork without admin/DB
 * access the automation does not have. So this is a self-contained harness that DOES NOT TOUCH
 * the real artwork, reservation, pricing or checkout code at all — the real Buy-Now behaviour
 * is unchanged by construction. It reuses only the things that make the test real: the same
 * `stripeClient`, the same `orders` table, and the same webhook (which matches an order by
 * `metadata.orderId` and skips `markSold` when `artwork_id` is null — so a virtual test item
 * flows through it without any change there either).
 *
 * SAFETY:
 *   • FAILS CLOSED. Both routes 404 unless `ENABLE_TEST_CHECKOUT === "1"`. Merged code is inert
 *     until the owner deliberately turns it on, and turning it off again is instant — no deploy.
 *   • TOKEN-GATED even when enabled: a constant-time comparison against the TEST_CHECKOUT_TOKEN
 *     production secret. The token is never committed; if it is missing the routes fail closed.
 *   • NO SHIPPING LINE, so the total is exactly the $1.00 item — $0.00 shipping without going
 *     anywhere near the shipping engine, and with no way for this to affect a real artwork.
 *   • NOT AN ARTWORK. No database artwork row, so it cannot appear in listings, collections,
 *     the sitemap, search, or public browsing. Its only surface is the noindex test page below.
 */
import type { Express, Request, Response } from "express";
import crypto from "node:crypto";
import { stripeClient, isCheckoutConfigured } from "./stripeClient";
import { createOrder, nextReference } from "./orders";

/** The item under test. One dollar, US dollars, and unmistakably not for sale. */
export const TEST_ITEM = {
  name: "TEST PURCHASE — DO NOT BUY",
  description: "$1.00 production payment test — not a real artwork. Safe to complete.",
  amountMinor: 100,
  currency: "usd",
} as const;

/**
 * The token is a PRODUCTION SECRET, never committed. It is read only from the environment, so
 * nothing in the repository — or in any conversation about the repository — is the real token.
 */
function expectedToken(): string {
  return (process.env.TEST_CHECKOUT_TOKEN ?? "").trim();
}

/**
 * ARMED only when BOTH secrets are set: the flag is exactly "1" AND a token secret exists.
 * Missing either → the routes below 404. Merged code is inert until the owner sets both.
 */
export function testCheckoutEnabled(): boolean {
  return (process.env.ENABLE_TEST_CHECKOUT ?? "").trim() === "1" && expectedToken().length > 0;
}

/**
 * Constant-time token check. Fails closed when no token secret is configured, and never throws
 * on a length mismatch (timingSafeEqual requires equal-length buffers). The token is never
 * logged, echoed in an error, or returned.
 */
export function verifyToken(provided: unknown): boolean {
  const expected = expectedToken();
  if (!expected) return false;
  const p = typeof provided === "string" ? provided : "";
  const a = Buffer.from(expected);
  const b = Buffer.from(p);
  if (a.length !== b.length) {
    // Compare against self so the timing does not leak the expected length.
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function siteBase(req: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol ?? "https";
  return `${proto}://${req.get("host")}`;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function registerTestCheckoutRoutes(app: Express): void {
  // The private test page. Rendered only with the flag on AND the token correct; noindex either
  // way. Nothing links to it.
  app.get("/__test-purchase", (req: Request, res: Response) => {
    if (!testCheckoutEnabled() || !verifyToken(req.query.t)) return res.status(404).type("text/plain").send("Not found");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.type("text/html").send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<meta name="robots" content="noindex,nofollow"><title>TEST PURCHASE — DO NOT BUY</title></head>` +
      `<body style="font-family:system-ui,sans-serif;max-width:540px;margin:4rem auto;padding:0 1.25rem;color:#0f172a">` +
      `<h1 style="font-size:1.6rem">TEST PURCHASE — DO NOT BUY</h1>` +
      `<p style="color:#475569">Production payment test using the real Stripe integration. Completing it charges $1.00 to the card you enter.</p>` +
      `<ul style="line-height:1.9"><li>Item: <strong>$1.00 USD</strong></li><li>Shipping: <strong>$0.00</strong></li>` +
      `<li>Total: <strong>$1.00 USD</strong></li></ul>` +
      `<form method="POST" action="/api/commerce/test-checkout">` +
      `<input type="hidden" name="t" value="${esc(String(req.query.t))}">` +
      `<button type="submit" style="background:#0f172a;color:#fff;border:0;border-radius:8px;` +
      `padding:0.8rem 1.4rem;font-size:1rem;cursor:pointer">Buy Now — $1.00 test</button></form>` +
      `<p style="color:#94a3b8;font-size:0.85rem;margin-top:1.5rem">You will be taken to Stripe's real checkout page.</p>` +
      `</body></html>`,
    );
  });

  // Creates a real order + real Stripe Checkout session. The existing webhook marks it paid.
  app.post("/api/commerce/test-checkout", async (req: Request, res: Response) => {
    if (!testCheckoutEnabled() || !verifyToken(req.body?.t)) return res.status(404).json({ message: "Not found" });
    const stripe = stripeClient();
    if (!stripe || !isCheckoutConfigured()) {
      return res.status(503).json({ code: "checkout-unconfigured", message: "Stripe is not configured." });
    }
    try {
      const reference = await nextReference();
      const order = await createOrder({
        reference,
        status: "checkout_created",
        payment_status: "unpaid",
        item_type: "test",
        artwork_id: null,               // NOT an artwork — the webhook therefore skips markSold.
        buyer_email: "test@animuradyan.com",
        currency: "USD",
        item_price_minor: TEST_ITEM.amountMinor,
        shipping_minor: 0,              // exactly zero, with no shipping engine involved.
        total_minor: TEST_ITEM.amountMinor,
      });
      const base = siteBase(req);
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        client_reference_id: order.reference,
        metadata: { orderId: String(order.id), reference: order.reference, test: "1" },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: TEST_ITEM.currency,
              unit_amount: TEST_ITEM.amountMinor,
              product_data: { name: TEST_ITEM.name, description: TEST_ITEM.description },
            },
          },
          // No shipping line item on purpose → total is exactly $1.00.
        ],
        success_url: `${base}/order/${order.reference}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/__test-purchase?t=${encodeURIComponent(String(req.body.t))}`,
      });
      const { pool } = await import("../db");
      await pool.query(
        `UPDATE orders SET stripe_checkout_session_id = $2, status = 'checkout_created', updated_at = now() WHERE id = $1`,
        [order.id, session.id],
      );
      return res.json({ url: session.url, reference: order.reference });
    } catch (e) {
      return res.status(502).json({
        code: "stripe-unavailable",
        message: "Test checkout could not be started.",
        detail: e instanceof Error ? e.message.slice(0, 200) : undefined,
      });
    }
  });
}
