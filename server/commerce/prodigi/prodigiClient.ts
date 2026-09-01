/**
 * THE PRODIGI FULFILMENT CLIENT — server-only, and it FAILS CLOSED.
 *
 * Mirrors stripeClient's philosophy: with no key set, `prodigiConfigured()` is false and callers
 * answer "fulfilment is not configured" rather than throwing into a paid order. The key is read at
 * CALL TIME (never at import), so adding it to Replit Secrets and restarting is all that's needed —
 * no rebuild.
 *
 * ENVIRONMENT SEPARATION. If PRODIGI_API_KEY is set we talk to LIVE; else if PRODIGI_SANDBOX_API_KEY
 * is set we talk to SANDBOX. A sandbox key can never reach the live API and vice-versa, because the
 * base URL is chosen with the key.
 *
 * THE KEY NEVER LEAVES THIS PROCESS. It is only ever the `X-API-Key` header; it is not logged, not
 * returned by any route, and never sent to the client.
 *
 * Per Prodigi's current API (v4.0): auth is `X-API-Key`; idempotency is a BODY field
 * (`idempotencyKey`), not a header; there is no bulk catalogue endpoint (products are looked up per
 * SKU); callbacks carry no signature (verified by a secret URL token elsewhere) so order state is
 * always re-fetched, never trusted from a payload.
 */

import type {
  ProdigiProduct,
  ProdigiQuoteRequest,
  ProdigiQuoteResponse,
  ProdigiOrderRequest,
  ProdigiOrderResponse,
} from "./prodigiTypes";

const SANDBOX_BASE = "https://api.sandbox.prodigi.com/v4.0";
const LIVE_BASE = "https://api.prodigi.com/v4.0";

export type ProdigiMode = "live" | "sandbox" | "unconfigured";

export function prodigiMode(): ProdigiMode {
  if (process.env.PRODIGI_API_KEY?.trim()) return "live";
  if (process.env.PRODIGI_SANDBOX_API_KEY?.trim()) return "sandbox";
  return "unconfigured";
}

function config(): { baseUrl: string; apiKey: string; mode: ProdigiMode } | null {
  const live = process.env.PRODIGI_API_KEY?.trim();
  if (live && live.length > 10) return { baseUrl: LIVE_BASE, apiKey: live, mode: "live" };
  const sandbox = process.env.PRODIGI_SANDBOX_API_KEY?.trim();
  if (sandbox && sandbox.length > 10) return { baseUrl: SANDBOX_BASE, apiKey: sandbox, mode: "sandbox" };
  return null;
}

/** True once at least one Prodigi key is present. Callers gate real API use on this. */
export function prodigiConfigured(): boolean {
  return config() !== null;
}

export class ProdigiNotConfiguredError extends Error {
  constructor() {
    super("Prodigi is not configured (no PRODIGI_API_KEY / PRODIGI_SANDBOX_API_KEY).");
    this.name = "ProdigiNotConfiguredError";
  }
}

export class ProdigiApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly statusText: string,
    /** W3C trace id Prodigi returns on every response — logged, never the key. */
    readonly traceParent: string | null,
    readonly body: unknown,
  ) {
    super(`Prodigi ${statusCode} ${statusText}`);
    this.name = "ProdigiApiError";
  }
}

/** The SANITIZED diagnostic we may store on the order / log. No key, no request body, no headers. */
export interface SanitizedProdigiError {
  statusCode: number;
  statusText: string;
  /** W3C `traceparent` — the reference Prodigi support looks an incident up by. Carries no secret. */
  traceParent: string | null;
  /** A short, redacted message pulled from the provider's RESPONSE body — never the whole body. */
  providerMessage: string | null;
}

// Belt-and-suspenders: strip anything URL/token/key-shaped before a provider message is persisted or
// shown in admin, even though the response body should never contain our signed asset URL or key.
const SENSITIVE_IN_MESSAGE = /(https?:\/\/[^\s"'<>]+|(?:token|key|apikey|api[-_]?key|signature|sig)=[^\s"'&<>]+)/gi;

/** Pull ONE short message-like field out of a provider response body. Never dumps the whole body. */
function extractProviderMessage(body: unknown): string | null {
  let msg: string | null = null;
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const err = b.error as Record<string, unknown> | undefined;
    if (typeof b.message === "string") msg = b.message;
    else if (err && typeof err.message === "string") msg = err.message;
    else if (typeof b.detail === "string") msg = b.detail;
    else if (typeof b.title === "string") msg = b.title;
    else if (typeof b.outcome === "string") msg = `outcome: ${b.outcome}`;
  } else if (typeof body === "string") {
    msg = body;
  }
  if (!msg) return null;
  return msg.replace(SENSITIVE_IN_MESSAGE, "[redacted]").replace(/\s+/g, " ").trim().slice(0, 300);
}

/**
 * Turn a caught error into a sanitized Prodigi diagnostic, or null if it is not a `ProdigiApiError`.
 * Keeps ONLY: status code/text, the W3C traceparent, and a short redacted provider message.
 */
export function sanitizeProdigiError(e: unknown): SanitizedProdigiError | null {
  if (!(e instanceof ProdigiApiError)) return null;
  return {
    statusCode: e.statusCode,
    statusText: e.statusText,
    traceParent: e.traceParent,
    providerMessage: extractProviderMessage(e.body),
  };
}

/**
 * A single-line, admin-safe fulfilment-error string. For a Prodigi API error it preserves the status,
 * the traceparent (so support can find the incident) and a short redacted provider message; for any
 * other error it falls back to `name: message`. Safe to store in `fulfilment_error` and show in admin.
 */
export function formatFulfilmentError(e: unknown): string {
  const s = sanitizeProdigiError(e);
  if (s) {
    const parts = [`ProdigiApiError ${s.statusCode} ${s.statusText}`];
    if (s.traceParent) parts.push(`trace=${s.traceParent}`);
    if (s.providerMessage) parts.push(`provider="${s.providerMessage}"`);
    return parts.join(" | ");
  }
  return e instanceof Error ? `${e.name}: ${e.message}` : "Unknown Prodigi error";
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const cfg = config();
  if (!cfg) throw new ProdigiNotConfiguredError();

  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers: {
      "X-API-Key": cfg.apiKey,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const traceParent = res.headers.get("traceparent");
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    // Never include the request body (it may reference assets) or any header in the thrown error.
    throw new ProdigiApiError(res.status, res.statusText, traceParent, parsed);
  }
  return parsed as T;
}

/**
 * The abstraction the rest of the app uses. Nothing else builds a Prodigi URL or sends the key.
 */
export const prodigi = {
  mode: prodigiMode,
  configured: prodigiConfigured,

  /** Per-SKU product details: attributes, variants, and each variant's required print resolution. */
  getProduct(sku: string): Promise<{ product: ProdigiProduct }> {
    return call("GET", `/products/${encodeURIComponent(sku)}`);
  },

  /** Price + shipping for a SKU set to a destination, WITHOUT creating an order. */
  getQuote(req: ProdigiQuoteRequest): Promise<ProdigiQuoteResponse> {
    // Quotes want a lowercase shippingMethod (orders want PascalCase) — normalise so a caller
    // may pass either. This is the one documented casing difference between the two endpoints.
    const body: ProdigiQuoteRequest = req.shippingMethod
      ? { ...req, shippingMethod: req.shippingMethod.toLowerCase() as ProdigiQuoteRequest["shippingMethod"] }
      : req;
    return call("POST", `/quotes`, body);
  },

  /**
   * Create a fulfilment order. `idempotencyKey` is a BODY field (Prodigi's own convention) — the
   * SAME key must be reused on every retry for one internal order, so a duplicate Stripe webhook or
   * a retried timeout returns `alreadyExists` instead of producing twice.
   */
  createOrder(req: ProdigiOrderRequest): Promise<ProdigiOrderResponse> {
    return call("POST", `/orders`, req);
  },

  getOrder(prodigiOrderId: string): Promise<ProdigiOrderResponse> {
    return call("GET", `/orders/${encodeURIComponent(prodigiOrderId)}`);
  },

  /** Cancellation only succeeds before production; the caller must handle a refused cancel. */
  cancelOrder(prodigiOrderId: string): Promise<{ outcome: string }> {
    return call("POST", `/orders/${encodeURIComponent(prodigiOrderId)}/actions/cancel`, {});
  },
};
