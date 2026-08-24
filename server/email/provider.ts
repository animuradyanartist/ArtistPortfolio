/**
 * THE TRANSACTIONAL EMAIL TRANSPORT — Resend, over its REST API.
 *
 * Resend was chosen over Postmark/SendGrid for this project because it is purpose-built for
 * transactional mail, has first-class HTML support, verifies a sending domain with a few DNS
 * records, and its free tier comfortably covers low-volume original-art sales. We call the REST
 * endpoint directly with `fetch` rather than adding the SDK, so there is no new dependency and
 * the same code runs on both the Render and Replit deploy paths.
 *
 * SAFETY:
 *   • The API key is read from `process.env.RESEND_API_KEY` at call time and is NEVER logged,
 *     echoed, or returned. If it is missing the mailer fails soft (skipped), so a site with no
 *     email configured still functions — it just records that an email was not sent.
 *   • Retries on network errors and 5xx/429 with a small backoff; 4xx (bad request) is returned
 *     immediately, never hammered.
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendResult {
  ok: boolean;
  id?: string;        // Resend message id, for support/debugging
  error?: string;     // short, non-sensitive
  skipped?: boolean;  // true when email is not configured (not a failure)
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** True only when a Resend API key is present. */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

/**
 * The branded sender. Uses the animuradyan.com domain once it is verified in Resend; overridable
 * by env without a code change. Replies go to the address she actually reads.
 */
export function emailFrom(): string {
  return process.env.EMAIL_FROM?.trim() || "Ani Muradyan <studio@animuradyan.com>";
}
export function emailReplyTo(): string {
  return process.env.EMAIL_REPLY_TO?.trim() || "animuradyan.artist@gmail.com";
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendEmail(msg: OutgoingEmail): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, skipped: true, error: "email-not-configured" };

  const body = JSON.stringify({
    from: emailFrom(),
    to: [msg.to],
    reply_to: emailReplyTo(),
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  });

  let lastError = "send-failed";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body,
      });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { id?: string };
        return { ok: true, id: data?.id };
      }
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      lastError = `resend-${res.status}${detail ? `: ${detail}` : ""}`;
      // 4xx other than rate-limiting will not succeed on retry.
      if (res.status < 500 && res.status !== 429) return { ok: false, error: lastError };
    } catch (e) {
      lastError = e instanceof Error ? e.message.slice(0, 200) : "network-error";
    }
    if (attempt < 3) await delay(attempt * 500);
  }
  return { ok: false, error: lastError };
}
