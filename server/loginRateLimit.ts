/**
 * BRUTE-FORCE PROTECTION FOR THE ADMIN LOGIN.
 *
 * The login endpoint accepted unlimited guesses at one password. Even with a strong secret
 * that is the wrong shape for a public endpoint: it turns "guess the password" into a problem
 * bounded only by bandwidth, and it leaves no trace that anyone tried.
 *
 * TWO LAYERS, because one of them can be lied to.
 *
 *   PER-IP  — the useful signal, but only as trustworthy as the address. It is the layer that
 *             stops one attacker without inconveniencing the owner.
 *   GLOBAL  — a ceiling across all addresses. This exists because IP attribution here is
 *             genuinely unreliable: behind the platform edge many visitors can share an
 *             address, and a distributed attacker can present many. When the per-IP layer is
 *             defeated in either direction, the global one still bounds total guesses.
 *
 * DELIBERATELY IN MEMORY, and honest about what that means. This process may be one of several
 * under autoscale, and counters are per-process, so N instances allow up to N times the
 * attempts; a restart clears the record. That is a real limit, not a hidden one — the
 * alternative is a database round-trip on an unauthenticated endpoint, which hands an attacker
 * a cheap way to make the site do work. Bounded guessing plus a strong secret is the goal, not
 * a distributed lock.
 *
 * COUNTS FAILURES ONLY. A successful login clears the record, so the owner is never locked out
 * by their own typing, and lockout escalates so a persistent guesser gets slower while a
 * fumbled password costs seconds.
 *
 * Pure and injectable (`now`), so the tests do not sleep.
 */

/** Failures from one address before it is locked out. */
export const MAX_ATTEMPTS_PER_IP = 5;
/** Failures across ALL addresses in the window before every login is locked out. */
export const MAX_ATTEMPTS_GLOBAL = 50;
/** Sliding window over which failures are counted. */
export const WINDOW_MS = 15 * 60 * 1000;
/** First lockout; doubles per subsequent lockout for the same address, to a ceiling. */
export const BASE_LOCKOUT_MS = 60 * 1000;
export const MAX_LOCKOUT_MS = 60 * 60 * 1000;

interface Record_ {
  failures: number[];
  lockedUntil: number;
  lockouts: number;
}

const perIp = new Map<string, Record_>();
const globalFailures: number[] = [];

/** Test seam, and a safety valve: forget everything. */
export function resetLoginRateLimit(): void {
  perIp.clear();
  globalFailures.length = 0;
}

function prune(times: number[], now: number): void {
  const cutoff = now - WINDOW_MS;
  let i = 0;
  while (i < times.length && times[i]! <= cutoff) i++;
  if (i > 0) times.splice(0, i);
}

function recordFor(ip: string): Record_ {
  let r = perIp.get(ip);
  if (!r) {
    r = { failures: [], lockedUntil: 0, lockouts: 0 };
    perIp.set(ip, r);
  }
  return r;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds the caller should wait. Rounded up, minimum 1 when blocked. */
  retryAfterSeconds: number;
  /** Which layer refused — for logging, never for the response body. */
  scope: "ip" | "global" | null;
}

/**
 * May this address attempt a login right now?
 *
 * Read-only: it records nothing. Call `recordLoginFailure` / `recordLoginSuccess` after the
 * password is checked, so a correct password is never counted against anyone.
 */
export function checkLoginAllowed(ip: string, now: number = Date.now()): RateLimitDecision {
  const r = recordFor(ip);
  if (r.lockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((r.lockedUntil - now) / 1000)), scope: "ip" };
  }
  prune(r.failures, now);
  prune(globalFailures, now);
  if (globalFailures.length >= MAX_ATTEMPTS_GLOBAL) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(WINDOW_MS / 1000)), scope: "global" };
  }
  return { allowed: true, retryAfterSeconds: 0, scope: null };
}

/** A wrong password. Escalates the lockout when this address crosses the threshold. */
export function recordLoginFailure(ip: string, now: number = Date.now()): void {
  const r = recordFor(ip);
  prune(r.failures, now);
  prune(globalFailures, now);
  r.failures.push(now);
  globalFailures.push(now);
  if (r.failures.length >= MAX_ATTEMPTS_PER_IP) {
    const lockout = Math.min(BASE_LOCKOUT_MS * Math.pow(2, r.lockouts), MAX_LOCKOUT_MS);
    r.lockouts += 1;
    r.lockedUntil = now + lockout;
    r.failures = [];
  }
}

/**
 * A correct password. Forgets this address entirely.
 *
 * The global counter is deliberately NOT cleared: one success does not mean the other
 * addresses that just failed were innocent.
 */
export function recordLoginSuccess(ip: string): void {
  perIp.delete(ip);
}

/**
 * The address to hold responsible.
 *
 * `req.ip` is only meaningful once Express is told how many proxies sit in front of it; the
 * server sets `trust proxy` for that reason. Falls back to the socket address, and finally to
 * a single shared bucket — which is strict rather than lax: an unidentifiable caller shares a
 * counter with every other unidentifiable caller.
 */
export function clientIpOf(req: { ip?: string; socket?: { remoteAddress?: string | null } }): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}
