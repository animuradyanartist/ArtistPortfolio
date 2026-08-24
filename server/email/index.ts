/**
 * ORDER EMAILS — the public surface the webhook and admin routes call.
 *
 * Every send goes through `dispatch`, which:
 *   1. does nothing but record a `skipped` row when email is unconfigured or there is no buyer
 *      address (so a site without Resend keys still works, and Admin sees why nothing was sent);
 *   2. ensures the order has its stable, unguessable tracking token and builds the Track URL;
 *   3. for once-only emails, CLAIMS a dedupe slot before sending — a Stripe webhook retry can
 *      never produce a second confirmation;
 *   4. sends, then records sent/failed with the provider id or error;
 *   5. NEVER throws. An email problem must not fail a webhook or an admin action.
 */
import type { OrderRow } from "../commerce/orders";
import { ensureTrackingToken } from "../commerce/orders";
import { emailConfigured, sendEmail } from "./provider";
import { claimOrderEmail, finishOrderEmail, releaseOrderEmailClaim, logOrderEmail } from "./emailLog";
import {
  toModel, buildConfirmationEmail, buildShippedEmail, buildDeliveredEmail,
  buildPreparingEmail, buildUpdateEmail, type EmailContent,
} from "./render";

export { listOrderEmails } from "./emailLog";
export { emailConfigured } from "./provider";

export type EmailKind = "order_confirmation" | "shipped" | "delivered" | "preparing" | "delay" | "manual";
export interface EmailDispatchResult { status: "sent" | "failed" | "skipped"; reason?: string; id?: string }

export function emailBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL?.trim() || "https://animuradyan.com").replace(/\/+$/, "");
}
export function buildTrackUrl(token: string): string {
  return `${emailBaseUrl()}/track/${token}`;
}

async function dispatch(
  order: OrderRow, kind: EmailKind, build: (m: ReturnType<typeof toModel>) => EmailContent,
  opts: { once: boolean; dedupeKind?: string },
): Promise<EmailDispatchResult> {
  try {
    const to = order.buyer_email?.trim() || null;
    if (!emailConfigured()) {
      await logOrderEmail(order.id, kind, to, null, "skipped", null, "email-not-configured");
      return { status: "skipped", reason: "email-not-configured" };
    }
    if (!to) {
      await logOrderEmail(order.id, kind, null, null, "skipped", null, "no-buyer-email");
      return { status: "skipped", reason: "no-buyer-email" };
    }

    const token = await ensureTrackingToken(order.id);
    const trackUrl = token ? buildTrackUrl(token) : `${emailBaseUrl()}/order/${encodeURIComponent(order.reference)}`;
    const model = toModel(order, emailBaseUrl(), trackUrl);
    const content = build(model);

    const dedupeKey = opts.once ? `${order.id}:${opts.dedupeKind ?? kind}` : null;
    const claim = await claimOrderEmail(order.id, kind, to, content.subject, dedupeKey);
    if (!claim.claimed) return { status: "skipped", reason: "already-sent" };

    const result = await sendEmail({ to, subject: content.subject, html: content.html, text: content.text });
    if (result.ok) {
      await finishOrderEmail(claim.id!, "sent", result.id ?? null, null);
      return { status: "sent", id: result.id };
    }
    // Failure: free a once-only slot so a later retry/resend can still get through, and keep a
    // standalone failed history row. Repeatable emails just resolve their own row as failed.
    if (dedupeKey) {
      await releaseOrderEmailClaim(claim.id!);
      await logOrderEmail(order.id, kind, to, content.subject, "failed", null, result.error ?? "send-failed");
    } else {
      await finishOrderEmail(claim.id!, "failed", null, result.error ?? "send-failed");
    }
    return { status: "failed", reason: result.error };
  } catch (e) {
    const reason = e instanceof Error ? e.message.slice(0, 200) : "dispatch-error";
    try { await logOrderEmail(order.id, kind, order.buyer_email ?? null, null, "failed", null, reason); } catch { /* ignore */ }
    return { status: "failed", reason };
  }
}

/** A. Payment confirmed — once per order, from the webhook. */
export function sendOrderConfirmation(order: OrderRow): Promise<EmailDispatchResult> {
  return dispatch(order, "order_confirmation", buildConfirmationEmail, { once: true });
}
/** Admin resend of the confirmation — deliberately repeatable. */
export function resendConfirmation(order: OrderRow): Promise<EmailDispatchResult> {
  return dispatch(order, "order_confirmation", buildConfirmationEmail, { once: false });
}
/** C. Shipped — once per order, auto on the transition to shipped. */
export function sendShippedEmail(order: OrderRow): Promise<EmailDispatchResult> {
  return dispatch(order, "shipped", buildShippedEmail, { once: true });
}
/** D. Delivered — once per order, auto on the transition to delivered. */
export function sendDeliveredEmail(order: OrderRow): Promise<EmailDispatchResult> {
  return dispatch(order, "delivered", buildDeliveredEmail, { once: true });
}
/** B. Preparing — optional, admin-initiated (not automatic), so repeatable. */
export function sendPreparingEmail(order: OrderRow): Promise<EmailDispatchResult> {
  return dispatch(order, "preparing", buildPreparingEmail, { once: false });
}
/** E. A hand-written buyer update (delay note or general message). Repeatable. */
export function sendManualUpdate(
  order: OrderRow, opts: { subject: string; message: string; kind?: "delay" | "manual" },
): Promise<EmailDispatchResult> {
  const kind = opts.kind ?? "manual";
  return dispatch(
    order, kind,
    (m) => buildUpdateEmail(m, {
      subject: opts.subject,
      message: opts.message,
      eyebrow: kind === "delay" ? "An update on your order" : undefined,
    }),
    { once: false },
  );
}
