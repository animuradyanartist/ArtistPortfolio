/**
 * THE STRIPE CLIENT, AND THE ONE SECRET IT NEEDS.
 *
 * FAILS CLOSED AND STAYS QUIET. With `STRIPE_SECRET_KEY` unset, `stripeClient()` returns null
 * and the commerce routes answer "payment is not configured" — the site keeps working, the
 * artwork pages keep rendering, marketplace links keep working, and nothing 500s. That is
 * what lets the entire system be built and tested before the key exists.
 *
 * READ AT CALL TIME, never at import, so adding the secret to Replit Secrets and restarting
 * is all that is required. No rebuild, no code change, no per-artwork setup.
 *
 * THE SECRET NEVER LEAVES THIS PROCESS. It is not logged, not returned by any route, and not
 * exposed to the client — the browser only ever receives a Checkout Session URL that Stripe
 * itself issued.
 *
 * ── WHY A SECOND SECRET IS UNAVOIDABLE, stated plainly ───────────────────────────────────
 *
 * `STRIPE_WEBHOOK_SECRET` cannot be obtained the way the brief hopes. A webhook signing
 * secret is returned by Stripe EXACTLY ONCE, in the response to the API call that creates the
 * endpoint, and is never readable again. So a server could, in principle, create its own
 * endpoint on first boot and keep the secret — but it would have to persist it somewhere
 * itself, and a secret this process writes to its own database is a secret in a place the
 * owner cannot rotate and an attacker with database access can read. That is worse than
 * asking for it.
 *
 * `bootstrapWebhookEndpoint()` below therefore does the part that CAN be automated: once the
 * live key exists, it creates the endpoint at the right URL with the right events, and prints
 * the signing secret to the server log ONCE for the owner to copy. She adds one value; she
 * does not have to find the dashboard, choose events, or type a URL.
 *
 * Refusing to verify signatures instead is not an option: an unverified webhook endpoint is a
 * public URL that marks paintings sold on request.
 */
import Stripe from "stripe";

let cached: { key: string; client: Stripe } | null = null;

export function stripeSecretKey(): string | null {
  const k = process.env.STRIPE_SECRET_KEY?.trim();
  return k && k.length > 20 ? k : null;
}

export function stripeClient(): Stripe | null {
  const key = stripeSecretKey();
  if (!key) return null;
  if (cached && cached.key === key) return cached.client;
  const client = new Stripe(key, { apiVersion: "2025-10-29.clover" as Stripe.LatestApiVersion });
  cached = { key, client };
  return client;
}

export function stripeWebhookSecret(): string | null {
  const s = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  return s && s.startsWith("whsec_") ? s : null;
}

/** Test-mode keys start `sk_test_`. Shown in Admin so she can see which mode she is in. */
export function stripeMode(): "live" | "test" | "unconfigured" {
  const k = stripeSecretKey();
  if (!k) return "unconfigured";
  return k.startsWith("sk_test_") ? "test" : "live";
}

/**
 * Create the webhook endpoint for this site, once, and report its signing secret.
 *
 * Idempotent by URL: if an endpoint for this exact URL already exists, it is left alone and
 * no secret is printed, because Stripe will not show it again anyway.
 */
export async function bootstrapWebhookEndpoint(publicBaseUrl: string): Promise<
  | { created: true; secret: string; endpointId: string }
  | { created: false; reason: "no-key" | "already-exists" | "error"; detail?: string }
> {
  const stripe = stripeClient();
  if (!stripe) return { created: false, reason: "no-key" };

  const url = `${publicBaseUrl.replace(/\/+$/, "")}/api/commerce/stripe/webhook`;
  try {
    const existing = await stripe.webhookEndpoints.list({ limit: 100 });
    if (existing.data.some((e) => e.url === url)) {
      return { created: false, reason: "already-exists" };
    }
    const created = await stripe.webhookEndpoints.create({
      url,
      enabled_events: [
        "checkout.session.completed",
        "checkout.session.expired",
        "checkout.session.async_payment_succeeded",
        "checkout.session.async_payment_failed",
      ],
      description: "animuradyan.com — direct artwork sales",
    });
    return { created: true, secret: created.secret ?? "", endpointId: created.id };
  } catch (e) {
    return { created: false, reason: "error", detail: e instanceof Error ? e.message : "unknown" };
  }
}
