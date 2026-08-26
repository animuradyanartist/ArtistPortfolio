/**
 * THE PRODIGI CALLBACK HTTP HANDLER — the routed shell around the pure `prodigiCallback` module.
 *
 * Prodigi signs nothing, so the callback URL carries a SECRET TOKEN and this rejects anything
 * without it (constant-time compare, never logged). The posted body is a HINT only: when the
 * provider is configured the handler re-`GET`s the order from Prodigi and applies THAT state,
 * never the payload. When the provider is NOT configured it can neither verify nor trust the
 * payload, so it does nothing — it never falsely marks an order complete.
 *
 * The core is a dependency-injected function so the whole control flow is unit-tested without a
 * live server, database or Prodigi account.
 */

import type { Express } from "express";
import { verifyCallbackToken, parseCallbackOrderId, applyRefetchedOrder } from "./prodigiCallback";
import { prodigi, prodigiConfigured } from "./prodigiClient";
import { getOrderByProdigiOrderId, setPrintFulfilment } from "../orders";
import type { ProdigiOrderResponse } from "./prodigiTypes";

export interface CallbackOrder {
  id: number;
  fulfilment_status: string | null;
}

export interface CallbackDeps {
  verifyToken: (token: string | undefined) => boolean;
  getOrderByProdigiId: (prodigiOrderId: string) => Promise<CallbackOrder | null>;
  configured: () => boolean;
  getProdigiOrder: (prodigiOrderId: string) => Promise<ProdigiOrderResponse>;
  persist: (
    orderId: number,
    update: { fulfilmentStatus: string; carrier: string | null; trackingNumber: string | null; trackingUrl: string | null },
  ) => Promise<void>;
}

export interface CallbackResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Process one callback. Returns the HTTP status + JSON body to send. Never throws for an expected
 * condition (bad token, unmatched, unconfigured); a genuinely unexpected error propagates so the
 * route can 500 and let Prodigi retry.
 */
export async function processProdigiCallback(
  deps: CallbackDeps,
  input: { token: string | undefined; body: unknown },
): Promise<CallbackResult> {
  if (!deps.verifyToken(input.token)) {
    return { status: 401, body: { received: false } };
  }

  const prodigiOrderId = parseCallbackOrderId(input.body);
  if (!prodigiOrderId) {
    // Token was valid but the body carries no order id we can act on. Acknowledge so Prodigi does
    // not retry a payload we will never be able to use; nothing is changed.
    return { status: 200, body: { received: true, ignored: "no-order-id" } };
  }

  const order = await deps.getOrderByProdigiId(prodigiOrderId);
  if (!order) {
    return { status: 200, body: { received: true, unmatched: true } };
  }

  if (!deps.configured()) {
    // We cannot re-fetch to verify, and the payload is untrusted — so we do NOTHING. An order is
    // never marked complete on an unverifiable callback.
    return { status: 200, body: { received: true, deferred: "provider-unconfigured" } };
  }

  const refetched = await deps.getProdigiOrder(prodigiOrderId);
  const decision = applyRefetchedOrder(order.fulfilment_status, refetched);
  if (decision.apply) {
    await deps.persist(order.id, {
      fulfilmentStatus: decision.fulfilmentStatus,
      carrier: decision.tracking?.carrier ?? null,
      trackingNumber: decision.tracking?.number ?? null,
      trackingUrl: decision.tracking?.url ?? null,
    });
  }
  return { status: 200, body: { received: true, applied: decision.apply, fulfilmentStatus: decision.fulfilmentStatus } };
}

/** The production dependency wiring — real token, real DB, real Prodigi client. */
export const productionCallbackDeps: CallbackDeps = {
  verifyToken: verifyCallbackToken,
  getOrderByProdigiId: (id) => getOrderByProdigiOrderId(id),
  configured: prodigiConfigured,
  getProdigiOrder: (id) => prodigi.getOrder(id),
  persist: (orderId, update) =>
    setPrintFulfilment(orderId, {
      fulfilmentStatus: update.fulfilmentStatus,
      carrier: update.carrier,
      trackingNumber: update.trackingNumber,
      trackingUrl: update.trackingUrl,
    }),
};

export function registerProdigiCallbackRoute(app: Express, deps: CallbackDeps = productionCallbackDeps): void {
  app.post("/api/commerce/prodigi/callback/:token", async (req, res) => {
    try {
      const result = await processProdigiCallback(deps, { token: req.params.token, body: req.body });
      return res.status(result.status).json(result.body);
    } catch {
      // Unexpected (e.g. Prodigi unreachable mid-refetch). 500 → Prodigi retries; no state moved.
      return res.status(500).json({ received: false });
    }
  });
}
