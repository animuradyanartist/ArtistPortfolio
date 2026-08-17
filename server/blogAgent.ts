/**
 * THE AGENT'S SCOPED CREDENTIAL — a key that can write drafts and cannot publish.
 *
 * Career OS needs to put an article in front of Ani. It must never be able to put one in
 * front of the public. Until now the only credential this server had was the admin
 * session, which can do everything — handing that to an agent would make "the owner
 * approves every article" a promise rather than a property.
 *
 * So this is a SECOND, deliberately smaller credential, and the boundary is enforced by
 * which routes accept it rather than by what the agent is told to do:
 *
 *   requireBlogAgent  → POST /api/agent/blog        create a draft
 *                     → PATCH /api/agent/blog/:id   revise its OWN, still-unpublished draft
 *
 * There is no agent publish route. Not a disabled one, not a guarded one — none exists,
 * so there is nothing to reach. Publishing lives behind `requireAdminAuth` alone.
 *
 * FAILS CLOSED. With `BLOG_AGENT_TOKEN` unset the agent path is shut, not open: an
 * unconfigured server refuses the agent rather than accepting anybody. The comparison is
 * constant-time, and the token is never logged, echoed, or returned in an error.
 */
import type { RequestHandler } from "express";
import { timingSafeEqual } from "crypto";

/** Long enough that guessing is hopeless; rejected below if someone sets something short. */
const MIN_TOKEN_LENGTH = 32;

export function blogAgentConfigured(): boolean {
  const t = process.env.BLOG_AGENT_TOKEN?.trim() ?? "";
  return t.length >= MIN_TOKEN_LENGTH;
}

/**
 * Accept the agent's bearer token, or refuse. Never reveals whether the token was absent,
 * wrong, or the server unconfigured beyond a single 401 — a probe learns nothing.
 */
export const requireBlogAgent: RequestHandler = (req, res, next) => {
  const expected = process.env.BLOG_AGENT_TOKEN?.trim() ?? "";
  if (expected.length < MIN_TOKEN_LENGTH) {
    // Unconfigured is CLOSED. An empty expected value must never match an empty header.
    return res.status(401).json({ message: "Unauthorized" });
  }
  const header = req.header("authorization") ?? "";
  const provided = header.replace(/^Bearer\s+/i, "").trim();
  if (!provided || provided.length !== expected.length) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
      return res.status(401).json({ message: "Unauthorized" });
    }
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

/**
 * What the agent is allowed to say about a post — PURE, so the rule is testable without a
 * server. Anything not on this list is dropped rather than rejected: an agent sending an
 * extra field should not fail, it should simply not get that field.
 *
 * `status` is absent by construction. So is `publishedAt`. The agent cannot express going
 * live even as a wish.
 */
const AGENT_WRITABLE = [
  "title", "slug", "excerpt", "body", "coverImage", "coverImageAlt",
  "sourceNote", "evidence", "decisionRef", "expectedOutcome", "measurementHorizonDays",
] as const;

export function agentFields(body: unknown): Record<string, unknown> {
  const src = (body ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of AGENT_WRITABLE) {
    if (src[k] !== undefined) out[k] = src[k];
  }
  return out;
}

/**
 * May the agent revise this post?
 *
 * Only its own, and only while it is still a draft. Once Ani has published something, the
 * agent has no business rewriting it underneath her — a live page changing without the
 * owner acting is the same failure as publishing without her, arriving one step later.
 */
export function agentMayEdit(post: { origin: string; status: string } | undefined): { ok: boolean; reason?: string } {
  if (!post) return { ok: false, reason: "Post not found" };
  if (post.origin !== "career_os") return { ok: false, reason: "This draft was not written by Career OS" };
  if (post.status !== "draft") return { ok: false, reason: "This post is published — only the owner can change it" };
  return { ok: true };
}
