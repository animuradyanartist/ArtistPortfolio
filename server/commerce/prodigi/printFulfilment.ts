/**
 * PRINT FULFILMENT — the bridge from a VERIFIED-PAID print order to a Prodigi fulfilment order.
 *
 * THE ONE INVARIANT: this is only ever called from the Stripe `paid` webhook path, after the order
 * is genuinely marked paid. It never runs on a client redirect and never before payment. That
 * ordering is enforced by the caller; this module refuses to be the thing that says "paid".
 *
 * FAILS CLOSED. With no Prodigi key, `createPrintFulfilment` returns `pending_unconfigured` — the
 * paid order is untouched and simply waits; nothing 500s, nothing is lost.
 *
 * IDEMPOTENT. The internal order's stable `idempotencyKey` is passed to Prodigi as a body field and
 * reused on every retry. A duplicate Stripe webhook or a retried timeout therefore returns Prodigi
 * `alreadyExists` and reconciles to the existing order instead of producing twice.
 *
 * Dependency-injected (`ProdigiPort`, `configured`) so the whole decision logic is unit-tested with
 * a mock now — real Prodigi behaviour is verified against the sandbox only once a key exists.
 */

import { prodigi as realProdigi, prodigiConfigured, sanitizeProdigiError, formatFulfilmentError } from "./prodigiClient";
import { requiredAttributesForSku } from "@shared/commerce/prodigiProducts";
import type {
  ProdigiOrderRequest,
  ProdigiOrderResponse,
  ProdigiShippingMethod,
} from "./prodigiTypes";

/** The minimal port the fulfilment logic needs — the real `prodigi` object satisfies it. */
export interface ProdigiPort {
  createOrder(req: ProdigiOrderRequest): Promise<ProdigiOrderResponse>;
}

export interface InternalPrintOrder {
  reference: string;
  /** Stable per internal order; reused verbatim on every retry. */
  idempotencyKey: string;
  recipient: { name: string; email?: string; phone?: string };
  ship: {
    line1: string;
    line2?: string;
    city: string;
    region?: string;
    postalCode: string;
    country: string;
  };
  variant: {
    prodigiSku: string;
    printReadyAssetUrl: string;
    copies?: number;
    md5Hash?: string;
    /** Frame colour / wrap etc. — only the attributes the SKU requires. */
    attributes?: Record<string, string>;
  };
  callbackUrl?: string;
  shippingMethod?: ProdigiShippingMethod;
}

export type FulfilmentState =
  | "created"
  | "already_exists"
  | "pending_unconfigured"
  | "failed";

export interface FulfilmentTracking {
  carrier: string | null;
  number: string | null;
  url: string | null;
}

export interface FulfilmentOutcome {
  state: FulfilmentState;
  prodigiOrderId: string | null;
  /** Our internal fulfilment status, mapped from Prodigi's stage/details. */
  fulfilmentStatus: string | null;
  tracking: FulfilmentTracking | null;
  error: string | null;
}

/**
 * Build the Prodigi order body from an internal paid order. Pure; unit-tested.
 *
 * CANONICAL ATTRIBUTE SOURCE (mirrors the quote builder): the SKU registry supplies REQUIRED catalogue
 * attributes (canvas `wrap`), merged with the order's own attributes (e.g. a frame colour). This is the
 * single serialization boundary for a fulfilment item, so a canvas order ALWAYS carries its wrap in the
 * body Prodigi receives — regardless of what the upstream snapshot/mapper carried. Paper adds nothing.
 */
export function buildProdigiOrderRequest(o: InternalPrintOrder): ProdigiOrderRequest {
  const attributes = { ...requiredAttributesForSku(o.variant.prodigiSku), ...(o.variant.attributes ?? {}) };
  return {
    shippingMethod: o.shippingMethod ?? "Standard",
    idempotencyKey: o.idempotencyKey,
    merchantReference: o.reference,
    ...(o.callbackUrl ? { callbackUrl: o.callbackUrl } : {}),
    recipient: {
      name: o.recipient.name,
      ...(o.recipient.email ? { email: o.recipient.email } : {}),
      ...(o.recipient.phone ? { phoneNumber: o.recipient.phone } : {}),
      address: {
        line1: o.ship.line1,
        ...(o.ship.line2 ? { line2: o.ship.line2 } : {}),
        townOrCity: o.ship.city,
        ...(o.ship.region ? { stateOrCounty: o.ship.region } : {}),
        postalOrZipCode: o.ship.postalCode,
        countryCode: o.ship.country,
      },
    },
    items: [
      {
        sku: o.variant.prodigiSku,
        copies: o.variant.copies ?? 1,
        // fine art is centre-cropped to fill; never stretched. (Our masters already match ratio,
        // so fill == fit here — but fill is the safe default if a size is ever slightly off.)
        sizing: "fillPrintArea",
        ...(Object.keys(attributes).length ? { attributes } : {}),
        assets: [
          {
            printArea: "default",
            url: o.variant.printReadyAssetUrl,
            ...(o.variant.md5Hash ? { md5Hash: o.variant.md5Hash } : {}),
          },
        ],
        merchantReference: o.reference,
      },
    ],
  };
}

/** Map Prodigi's two-level status to our single internal fulfilment status. Pure; unit-tested. */
export function mapProdigiStatus(resp: ProdigiOrderResponse): string {
  const stage = resp.order?.status?.stage;
  const details = resp.order?.status?.details ?? {};
  if (stage === "Cancelled") return "cancelled";
  if (stage === "Complete") return "complete";
  if (details.shipping === "InProgress" || details.shipping === "Complete") return "shipped";
  if (details.inProduction === "InProgress" || details.inProduction === "Complete") return "inproduction";
  return "created";
}

/** Carrier can be a string or the documented { name, service } object — normalise to a name. */
function carrierName(carrier: string | { name?: string; service?: string } | undefined): string | null {
  if (!carrier) return null;
  if (typeof carrier === "string") return carrier;
  return carrier.name ?? null;
}

export function extractTracking(resp: ProdigiOrderResponse): FulfilmentTracking | null {
  const shipment = resp.order?.shipments?.find((s) => s.tracking?.number || s.tracking?.url);
  if (!shipment) return null;
  return {
    carrier: carrierName(shipment.carrier),
    number: shipment.tracking?.number ?? null,
    url: shipment.tracking?.url ?? null,
  };
}

/**
 * Create (or reconcile) the Prodigi fulfilment for a paid print order. The ONLY entry point.
 */
export async function createPrintFulfilment(
  order: InternalPrintOrder,
  deps: { prodigi?: ProdigiPort; configured?: () => boolean } = {},
): Promise<FulfilmentOutcome> {
  const configured = deps.configured ?? prodigiConfigured;
  if (!configured()) {
    // No key: the paid order simply waits. Never a failure, never a lost order.
    return { state: "pending_unconfigured", prodigiOrderId: null, fulfilmentStatus: "pending", tracking: null, error: null };
  }
  const client = deps.prodigi ?? realProdigi;
  try {
    const resp = await client.createOrder(buildProdigiOrderRequest(order));
    const id = resp.order?.id ?? null;
    const state: FulfilmentState = resp.outcome === "alreadyExists" ? "already_exists" : "created";
    return {
      state,
      prodigiOrderId: id,
      fulfilmentStatus: mapProdigiStatus(resp),
      tracking: extractTracking(resp),
      error: null,
    };
  } catch (e) {
    // A paid order whose fulfilment failed stays paid + fulfilment_status 'failed', visible in admin.
    // Preserve the SANITIZED provider diagnostic (status + traceparent + a short redacted message)
    // instead of collapsing a ProdigiApiError to "ProdigiApiError: Prodigi 500 …", which threw away
    // the response body and the trace id support needs. Never logs the key, request body, or headers.
    const error = formatFulfilmentError(e);
    const diag = sanitizeProdigiError(e);
    if (diag) {
      console.warn(
        `[prodigi][fulfilment-failed] order=${order.reference} status=${diag.statusCode} ${diag.statusText}` +
        (diag.traceParent ? ` trace=${diag.traceParent}` : "") +
        (diag.providerMessage ? ` provider="${diag.providerMessage}"` : ""),
      );
    }
    return { state: "failed", prodigiOrderId: null, fulfilmentStatus: "failed", tracking: null, error };
  }
}
