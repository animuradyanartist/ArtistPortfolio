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
import { verifyCallbackToken, parseCallbackOrderId, applyRefetchedOrder, customerLifecycleForFulfilment } from "./prodigiCallback";
import { prodigi, prodigiConfigured } from "./prodigiClient";
import { getOrderByProdigiOrderId, setPrintFulfilment, setOrderStatus, getOrder } from "../orders";
import { sendPreparingStatusEmail, sendShippedEmail } from "../../email";
import type { ProdigiOrderResponse } from "./prodigiTypes";
import type { OrderStatus } from "@shared/commerce/orderStatus";

export interface CallbackOrder {
  id: number;
  fulfilment_status: string | null;
  /** The customer-facing lifecycle status (paid → preparing → shipped …). Drives the lifecycle move. */
  status?: string | null;
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
  /**
   * PRINT LIFECYCLE: advance the customer-facing status to `target` and send the matching once-only
   * email. Idempotent (setOrderStatus is canTransition-guarded; the email is dedupe-guarded), so a
   * duplicate callback that somehow reaches here still sends nothing. Optional so a caller that only
   * cares about fulfilment status can omit it.
   */
  advanceLifecycle?: (
    orderId: number, target: OrderStatus, email: "preparing" | "shipped",
  ) => Promise<{ statusChanged: boolean; email: string | null }>;
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
  if (!decision.apply) {
    // No forward fulfilment change (duplicate / out-of-order) → persist nothing, send nothing.
    return { status: 200, body: { received: true, applied: false, fulfilmentStatus: decision.fulfilmentStatus } };
  }

  // 1) Persist Prodigi's fulfilment status + real tracking (carrier / number / url).
  await deps.persist(order.id, {
    fulfilmentStatus: decision.fulfilmentStatus,
    carrier: decision.tracking?.carrier ?? null,
    trackingNumber: decision.tracking?.number ?? null,
    trackingUrl: decision.tracking?.url ?? null,
  });

  // 2) PRINT customer lifecycle — Prodigi drives it. Advance the customer status + send the matching
  //    once-only email ONLY on a genuine forward customer transition (created adds nothing; a repeat
  //    or out-of-order state yields no move here because decision.apply already gated it forward).
  const lc = customerLifecycleForFulfilment(order.status, decision.fulfilmentStatus);
  let lifecycle: { advancedTo: string | null; email: string | null } | undefined;
  if (lc.status && lc.email && deps.advanceLifecycle) {
    const res = await deps.advanceLifecycle(order.id, lc.status, lc.email);
    lifecycle = { advancedTo: res.statusChanged ? lc.status : null, email: res.email };
  }

  return {
    status: 200,
    body: { received: true, applied: true, fulfilmentStatus: decision.fulfilmentStatus, ...(lifecycle ? { lifecycle } : {}) },
  };
}

/** The production dependency wiring — real token, real DB, real Prodigi client. */
export const productionCallbackDeps: CallbackDeps = {
  verifyToken: verifyCallbackToken,
  getOrderByProdigiId: async (id) => {
    const o = await getOrderByProdigiOrderId(id);
    return o ? { id: o.id, fulfilment_status: o.fulfilment_status, status: o.status } : null;
  },
  configured: prodigiConfigured,
  getProdigiOrder: (id) => prodigi.getOrder(id),
  persist: (orderId, update) =>
    setPrintFulfilment(orderId, {
      fulfilmentStatus: update.fulfilmentStatus,
      carrier: update.carrier,
      trackingNumber: update.trackingNumber,
      trackingUrl: update.trackingUrl,
    }),
  advanceLifecycle: async (orderId, target, emailKind) => {
    // Advance the customer status (canTransition-guarded; stamps shipped_at). Tracking was already
    // persisted above, so the shipped email carries Prodigi's real carrier/number/url.
    const moved = await setOrderStatus(orderId, target);
    if (!moved.ok) return { statusChanged: false, email: null };
    const fresh = await getOrder(orderId);
    if (!fresh || fresh.payment_status !== "paid") return { statusChanged: true, email: null };
    const res = emailKind === "preparing" ? await sendPreparingStatusEmail(fresh) : await sendShippedEmail(fresh);
    return { statusChanged: true, email: res.status };
  },
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
