/**
 * THE COMMERCE ROUTES.
 *
 * One rule governs all of them: the browser supplies IDENTITY (which artwork, which country,
 * who is buying) and the server supplies FACTS (whether it is for sale, what it costs, what
 * shipping is, what the total is). No route below reads a price, a total or an availability
 * from the request body, and the checkout route re-reads every row from the database
 * immediately before it asks Stripe for anything.
 */
import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { hasDatabase } from "../db";
import { purchasability, REASON_LABEL } from "@shared/commerce/purchasable";
import { formatMoney, type Currency } from "@shared/commerce/money";
import { zoneFor, ZONE_LABEL, supportedCountries, isLikelyImportDutiable } from "@shared/commerce/zones";
import { priceOrder, toShippable, currencyOf } from "./pricing";
import { shippingProvider } from "./providers";
import { validateBuyer, validateArtworkIds, sanitiseAttribution } from "./validate";
import { stripeClient, stripeMode, isCheckoutConfigured, checkoutBlockedReason } from "./stripeClient";
import { reserveArtwork, releaseReservation, markSold, releaseExpiredReservations, RESERVATION_MINUTES } from "./reservation";
import {
  createOrder, getOrder, getOrderByReference, getOrderBySession, nextReference,
  markOrderPaid, markOrderCancelled, markOrderFailed, claimStripeEvent,
} from "./orders";
import { clientIpOf } from "../loginRateLimit";

/**
 * A small fixed-window limiter for the endpoints that cost money or create rows.
 *
 * Separate from the login limiter on purpose: locking a would-be buyer out of checkout
 * because somebody else guessed passwords would be its own kind of failure.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 20;
const WINDOW_MS = 5 * 60 * 1000;

function rateLimited(req: Request, res: Response, key: string): boolean {
  const id = `${key}:${clientIpOf(req)}`;
  const now = Date.now();
  const b = buckets.get(id);
  if (!b || b.resetAt <= now) {
    buckets.set(id, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  b.count += 1;
  if (b.count > LIMIT) {
    res.setHeader("Retry-After", String(Math.ceil((b.resetAt - now) / 1000)));
    res.status(429).json({ message: "Too many requests. Please try again shortly." });
    return true;
  }
  return false;
}

/** Never leak the whole row to the public — only what a purchase surface needs. */
function publicArtwork(a: Awaited<ReturnType<typeof storage.getArtwork>>) {
  if (!a) return null;
  return { id: a.id, title: a.title, dimensions: a.dimensions, medium: a.medium, year: a.year };
}

function siteBaseUrl(req: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol ?? "https";
  return `${proto}://${req.get("host")}`;
}

export function registerCommerceRoutes(app: Express): void {
  // ── What a visitor may be told about one work, including shipping to a country ─────────
  app.get("/api/commerce/quote", async (req, res) => {
    try {
      const artworkId = Number.parseInt(String(req.query.artworkId ?? ""), 10);
      const country = String(req.query.country ?? "").trim().toUpperCase();
      if (!Number.isInteger(artworkId)) return res.status(400).json({ message: "artworkId is required" });

      const artwork = await storage.getArtwork(artworkId);
      if (!artwork) return res.status(404).json({ message: "Not found" });

      const p = purchasability({
        id: artwork.id, availability: artwork.availability,
        directSaleEnabled: artwork.directSaleEnabled === true,
        websitePriceMinor: artwork.websitePriceMinor ?? null,
        websiteCurrency: artwork.websiteCurrency ?? null,
        shippingEnabled: artwork.shippingEnabled !== false,
        reservedUntil: artwork.reservedUntil ?? null,
        hasCommitment: artwork.hasCommitment ?? false,
        commitmentUntil: artwork.commitmentUntil ?? null,
      });

      const currency = currencyOf(artwork);
      const base = {
        artwork: publicArtwork(artwork),
        purchasable: p.purchasable,
        reasons: p.reasons,
        priceMinor: artwork.websitePriceMinor ?? null,
        currency,
        priceFormatted: artwork.websitePriceMinor ? formatMoney(artwork.websitePriceMinor, currency) : null,
        supportedCountries: supportedCountries(),
        // ONE FLAG, and it means "a customer may safely be offered a Buy button" — not
        // merely "a key exists". The UI must never have to reason about which half is missing.
        checkoutEnabled: isCheckoutConfigured(),
      };

      // A country is optional — the page renders a price before it knows where you are.
      if (!country) return res.json({ ...base, shipping: null });

      const quote = await shippingProvider().quote(toShippable(artwork), country);
      const zone = zoneFor(country);
      return res.json({
        ...base,
        shipping: quote.ok
          ? {
              ok: true, amountMinor: quote.amountMinor,
              amountFormatted: formatMoney(quote.amountMinor, currency),
              estimated: quote.estimated, zone: quote.zone, zoneLabel: zone ? ZONE_LABEL[zone] : null,
              totalMinor: (artwork.websitePriceMinor ?? 0) + quote.amountMinor,
              totalFormatted: artwork.websitePriceMinor
                ? formatMoney(artwork.websitePriceMinor + quote.amountMinor, currency) : null,
              dutiesMayApply: zone ? isLikelyImportDutiable(zone) : true,
            }
          : { ok: false, reason: quote.reason, detail: quote.detail },
      });
    } catch {
      return res.status(500).json({ message: "Could not price this work right now." });
    }
  });

  // ── The cart, revalidated from the database. The client's copy is display only. ────────
  app.post("/api/commerce/cart/validate", async (req, res) => {
    try {
      const ids = validateArtworkIds((req.body ?? {}).artworkIds);
      if (!ids.ok) return res.status(400).json({ message: "Invalid cart", errors: ids.errors });
      const country = String((req.body ?? {}).country ?? "").trim().toUpperCase();

      const artworks = (await Promise.all(ids.value.map((id) => storage.getArtwork(id))))
        .filter((a): a is NonNullable<typeof a> => Boolean(a));

      const now = new Date();
      const items = artworks.map((a) => {
        const p = purchasability({
          id: a.id, availability: a.availability,
          directSaleEnabled: a.directSaleEnabled === true,
          websitePriceMinor: a.websitePriceMinor ?? null,
          websiteCurrency: a.websiteCurrency ?? null,
          shippingEnabled: a.shippingEnabled !== false,
          reservedUntil: a.reservedUntil ?? null,
          hasCommitment: a.hasCommitment ?? false,
          commitmentUntil: a.commitmentUntil ?? null,
        }, now);
        const currency = currencyOf(a);
        return {
          id: a.id, title: a.title, dimensions: a.dimensions, year: a.year, medium: a.medium,
          imageUrl: `/img/artwork/${a.id}/0`,
          priceMinor: a.websitePriceMinor ?? null, currency,
          priceFormatted: a.websitePriceMinor ? formatMoney(a.websitePriceMinor, currency) : null,
          purchasable: p.purchasable,
          // Plain words, because this is shown to a buyer, not to an operator.
          unavailableReason: p.purchasable ? null
            : p.reasons.includes("reserved") ? "Currently held by another checkout"
            : p.reasons.includes("committed") ? "Promised to a gallery or collector"
            : p.reasons.includes("not-available") ? "No longer available"
            : "Not available for direct purchase",
        };
      });

      // Ids that resolved to nothing at all, so the client can drop them.
      const missing = ids.value.filter((id) => !artworks.some((a) => a.id === id));
      const purchasable = artworks.filter((_, i) => items[i]!.purchasable);

      let totals: unknown = null;
      if (country && purchasable.length) {
        const priced = await priceOrder(purchasable, country, now);
        totals = priced.ok
          ? {
              ok: true, currency: priced.currency,
              itemsMinor: priced.itemsMinor, shippingMinor: priced.shippingMinor, totalMinor: priced.totalMinor,
              itemsFormatted: formatMoney(priced.itemsMinor, priced.currency),
              shippingFormatted: formatMoney(priced.shippingMinor, priced.currency),
              totalFormatted: formatMoney(priced.totalMinor, priced.currency),
              shippingEstimated: priced.shippingEstimated,
              dutiesMayApply: zoneFor(country) ? isLikelyImportDutiable(zoneFor(country)!) : true,
            }
          : { ok: false, error: priced.error };
      }

      return res.json({ items, missing, country: country || null, totals, checkoutEnabled: isCheckoutConfigured() });
    } catch {
      return res.status(500).json({ message: "Could not check your cart right now." });
    }
  });

  // ── Checkout: reserve, then ask Stripe. Nothing is trusted from the client. ────────────
  app.post("/api/commerce/checkout", async (req, res) => {
    if (rateLimited(req, res, "checkout")) return;
    try {
      // THE GATE, BEFORE ANYTHING ELSE HAPPENS.
      //
      // Placed above the database check, the validation, the pricing, the order INSERT and the
      // reservation, so that with payment unconfigured this route cannot create a row, cannot
      // hold a painting, and cannot reach Stripe. Nothing below it runs.
      const blocked = checkoutBlockedReason();
      if (blocked) {
        return res.status(503).json({
          code: "checkout-unconfigured",
          reason: blocked,
          message: "Online payment is not available yet. Please use the enquiry link to buy this work.",
        });
      }

      if (!hasDatabase) return res.status(503).json({ message: "Checkout is unavailable." });

      const stripe = stripeClient();
      if (!stripe) {
        return res.status(503).json({ code: "checkout-unconfigured", message: "Online payment is not available yet." });
      }

      const ids = validateArtworkIds((req.body ?? {}).artworkIds);
      if (!ids.ok) return res.status(400).json({ message: "Invalid cart", errors: ids.errors });

      const buyer = validateBuyer((req.body ?? {}).buyer);
      if (!buyer.ok) return res.status(400).json({ message: "Please check your details", errors: buyer.errors });

      // FRESH ROWS. Everything above this line is what the client claims; everything below is
      // what the database says. Between the page load and this moment a work may have sold.
      const artworks = (await Promise.all(ids.value.map((id) => storage.getArtwork(id))))
        .filter((a): a is NonNullable<typeof a> => Boolean(a));
      if (artworks.length !== ids.value.length) {
        return res.status(409).json({ message: "One of these works is no longer listed.", code: "missing" });
      }

      const priced = await priceOrder(artworks, buyer.value.country);
      if (!priced.ok) {
        const e = priced.error;
        if (e.kind === "not-purchasable") {
          return res.status(409).json({
            code: "not-purchasable", artworkId: e.artworkId,
            message: e.reasons.includes("reserved")
              ? "Somebody is checking out with this work right now. Please try again in a few minutes."
              : "This work is no longer available.",
            detail: e.reasons.map((r) => REASON_LABEL[r]),
          });
        }
        if (e.kind === "shipping-unavailable") {
          return res.status(409).json({
            code: "shipping-required",
            message: "We cannot quote shipping for this order automatically. Please contact us for a quote.",
            detail: e.quote.ok ? null : e.quote.detail,
          });
        }
        return res.status(409).json({ code: e.kind, message: "This order cannot be completed." });
      }

      // v1 ships ONE work per checkout so a reservation failure cannot leave a half-held cart.
      // The cart supports several; the safest release of that is a follow-up, and the code
      // path below is written to extend rather than be replaced.
      if (artworks.length > 1) {
        return res.status(409).json({
          code: "single-item-checkout",
          message: "For now each original is purchased in its own order. Please check out one work at a time.",
        });
      }
      const artwork = artworks[0]!;

      const reference = await nextReference();
      const order = await createOrder({
        reference,
        status: "pending",
        payment_status: "unpaid",
        buyer_name: buyer.value.name, buyer_email: buyer.value.email, buyer_phone: buyer.value.phone,
        ship_country: buyer.value.country, ship_address1: buyer.value.address1,
        ship_address2: buyer.value.address2, ship_city: buyer.value.city,
        ship_region: buyer.value.region, ship_postal_code: buyer.value.postalCode,
        item_type: "artwork", artwork_id: artwork.id,
        artwork_snapshot: JSON.stringify({
          id: artwork.id, title: artwork.title, dimensions: artwork.dimensions,
          medium: artwork.medium, year: artwork.year, image: `/img/artwork/${artwork.id}/0`,
        }),
        item_price_minor: priced.itemsMinor,
        currency: priced.currency,
        shipping_minor: priced.shippingMinor,
        total_minor: priced.totalMinor,
        shipping_basis: priced.shippingBasis,
        shipping_calculation: JSON.stringify(priced.lines.map((l) => ({
          artworkId: l.artwork.id,
          quote: l.shipping.ok
            ? { amountMinor: l.shipping.amountMinor, zone: l.shipping.zone, estimated: l.shipping.estimated,
                parcel: l.shipping.parcel, breakdown: l.shipping.breakdown, basis: l.shipping.basis }
            : { refused: l.shipping.reason },
        }))),
        attribution: sanitiseAttribution((req.body ?? {}).attribution),
      } as never);

      // THE HOLD, before Stripe is told anything. If somebody else got here first this fails
      // and no session is created, so the loser never sees a payment page for a sold work.
      const held = await reserveArtwork(artwork.id, order.id, RESERVATION_MINUTES);
      if (!held.ok) {
        await markOrderCancelled(order.id);
        return res.status(409).json({
          code: "reserved",
          message: held.reason === "already-reserved"
            ? "Somebody is checking out with this work right now. Please try again in a few minutes."
            : "This work is no longer available.",
        });
      }

      const base = siteBaseUrl(req);
      try {
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          // Stripe's own expiry is set to match the hold, so an abandoned session and an
          // abandoned reservation lapse together rather than drifting apart.
          expires_at: Math.floor(Date.now() / 1000) + RESERVATION_MINUTES * 60,
          customer_email: buyer.value.email,
          client_reference_id: order.reference,
          // The link back to our own row. The webhook trusts THIS, never the amounts.
          metadata: { orderId: String(order.id), reference: order.reference, artworkId: String(artwork.id) },
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: priced.currency.toLowerCase(),
                unit_amount: priced.itemsMinor,
                product_data: {
                  name: artwork.title,
                  description: [artwork.medium, artwork.dimensions, artwork.year].filter(Boolean).join(" · "),
                },
              },
            },
            {
              quantity: 1,
              price_data: {
                currency: priced.currency.toLowerCase(),
                unit_amount: priced.shippingMinor,
                product_data: { name: `Shipping to ${buyer.value.country}` },
              },
            },
          ],
          success_url: `${base}/order/${order.reference}?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${base}/artworks`,
        });

        await import("../db").then(({ pool }) => pool.query(
          `UPDATE orders SET stripe_checkout_session_id = $2, status = 'checkout_created',
                  reserved_at = now(), reservation_expires_at = now() + ($3 || ' minutes')::interval,
                  updated_at = now()
            WHERE id = $1`,
          [order.id, session.id, String(RESERVATION_MINUTES)],
        ));

        return res.json({ url: session.url, reference: order.reference });
      } catch (e) {
        // Stripe refused or was unreachable. The hold must not outlive the attempt, or a
        // transient outage would take a painting off sale for half an hour.
        await releaseReservation(artwork.id, order.id);
        await markOrderCancelled(order.id);
        return res.status(502).json({
          code: "stripe-unavailable",
          message: "Payment could not be started just now. Nothing has been charged — please try again.",
          detail: e instanceof Error ? e.message.slice(0, 200) : undefined,
        });
      }
    } catch {
      return res.status(500).json({ message: "Checkout could not be started." });
    }
  });

  // ── The webhook. The only thing in this system that may say "paid". ───────────────────
  app.post("/api/commerce/stripe/webhook", async (req, res) => {
    const stripe = stripeClient();
    const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!stripe || !secret) return res.status(503).json({ received: false });

    const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
    const signature = req.headers["stripe-signature"];
    if (!raw || typeof signature !== "string") return res.status(400).json({ received: false });

    let event;
    try {
      event = stripe.webhooks.constructEvent(raw, signature, secret);
    } catch {
      // An unverified body is not a payment notification; it is a stranger.
      return res.status(400).json({ received: false });
    }

    // IDEMPOTENCY, claimed before any work. A duplicate delivery stops here.
    const first = await claimStripeEvent(event.id, event.type);
    if (!first) return res.json({ received: true, duplicate: true });

    try {
      const session = event.data.object as { id: string; metadata?: Record<string, string> | null;
        payment_intent?: string | null; payment_status?: string };
      const orderId = Number.parseInt(session.metadata?.orderId ?? "", 10);
      const order = Number.isInteger(orderId) ? await getOrder(orderId) : await getOrderBySession(session.id);
      if (!order) return res.json({ received: true, unmatched: true });

      switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded": {
          // `completed` fires for unpaid sessions too when the method is asynchronous.
          if (session.payment_status && session.payment_status !== "paid") break;
          const wasFirst = await markOrderPaid(order.id, session.payment_intent ?? null);
          if (wasFirst && order.artwork_id) await markSold(order.artwork_id, order.id);
          break;
        }
        case "checkout.session.expired": {
          if (order.artwork_id) await releaseReservation(order.artwork_id, order.id);
          await markOrderCancelled(order.id);
          break;
        }
        case "checkout.session.async_payment_failed": {
          if (order.artwork_id) await releaseReservation(order.artwork_id, order.id);
          await markOrderFailed(order.id);
          break;
        }
      }
      return res.json({ received: true });
    } catch {
      // Stripe retries a non-2xx. Returning 500 here is correct: the event is claimed, but a
      // failure mid-way should be retried rather than silently dropped.
      return res.status(500).json({ received: false });
    }
  });

  // ── Confirmation. Reads OUR state, never the redirect's word for it. ──────────────────
  app.get("/api/commerce/order/:reference", async (req, res) => {
    try {
      const order = await getOrderByReference(String(req.params.reference));
      if (!order) return res.status(404).json({ message: "Not found" });
      const currency = (order.currency as Currency) ?? "EUR";
      return res.json({
        reference: order.reference,
        status: order.status,
        paymentStatus: order.payment_status,
        artwork: order.artwork_snapshot ? JSON.parse(order.artwork_snapshot) : null,
        itemsFormatted: order.item_price_minor != null ? formatMoney(order.item_price_minor, currency) : null,
        shippingFormatted: order.shipping_minor != null ? formatMoney(order.shipping_minor, currency) : null,
        totalFormatted: order.total_minor != null ? formatMoney(order.total_minor, currency) : null,
        ship: {
          name: order.buyer_name, country: order.ship_country, city: order.ship_city,
          address1: order.ship_address1, address2: order.ship_address2,
          region: order.ship_region, postalCode: order.ship_postal_code,
        },
        carrier: order.shipping_carrier, tracking: order.tracking_number,
        createdAt: order.created_at,
      });
    } catch {
      return res.status(500).json({ message: "Could not load this order." });
    }
  });

  // ── The sweeper, reachable so expiry never depends on a process staying up ────────────
  app.post("/api/commerce/maintenance/release-expired", async (req, res) => {
    if (rateLimited(req, res, "sweep")) return;
    const result = await releaseExpiredReservations();
    return res.json(result);
  });
}
