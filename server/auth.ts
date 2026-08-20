/**
 * ADMIN AUTHENTICATION — the boundary between "anyone on the internet" and "the owner".
 *
 * This file used to compare the submitted password to a string literal written in the source.
 * The repository is public and that literal has been in its history since the first commit, so
 * the password was readable by anyone, on an unthrottled endpoint, guarding thirty-odd routes
 * including `POST /api/admin/blog/:id/publish`. The old value is not a secret and can never be
 * one again: `ADMIN_PASSWORD` must be set to a NEW password, not the one this replaced.
 *
 * THE SECRET LIVES IN THE ENVIRONMENT, and nowhere else. No default, no fallback, no
 * "change me" placeholder — those are how a development shortcut reaches production wearing
 * the costume of a real credential.
 *
 * UNCONFIGURED IS CLOSED. If `ADMIN_PASSWORD` is missing or too short, every login fails,
 * including an empty one. The failure mode of a missing credential must be "nobody gets in",
 * never "everybody does" — an empty expected value must not match an empty submission.
 *
 * The comparison hashes both sides first. That is NOT password storage hashing (the secret is
 * already a secret in the environment; bcrypt would protect a database we do not have here).
 * It exists so `timingSafeEqual` always receives two equal-length buffers, which is what makes
 * it constant-time, and so a wrong guess cannot be distinguished from a wrong LENGTH.
 */
import { Request, Response, NextFunction } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';

// Extend the session interface to include admin authentication
declare module 'express-session' {
  interface SessionData {
    isAdminAuthenticated?: boolean;
  }
}

/**
 * Long enough that a value typed in by hand is a deliberate password rather than a leftover.
 * Also the reason a blank or placeholder variable cannot accidentally authenticate anyone.
 *
 * TEN, set by the owner. The number that actually protects this endpoint is not this one — it
 * is the attempt limiter in loginRateLimit.ts. The secret lives in an environment variable, not
 * in a stealable password hash, so there is no offline attack to lengthen the password against;
 * the realistic threat is online guessing, and that is bounded to five attempts per address
 * before a doubling lockout, under a global ceiling. Against that budget the difference between
 * ten and twelve characters is not what decides the outcome.
 *
 * It remains a floor, not a suggestion: below it every login fails, including an empty one.
 */
export const MIN_ADMIN_PASSWORD_LENGTH = 10;

/** Is a usable admin credential configured in this process? Presence only — never the value. */
export function isAdminPasswordConfigured(): boolean {
  return (process.env.ADMIN_PASSWORD?.trim() ?? '').length >= MIN_ADMIN_PASSWORD_LENGTH;
}

// Authentication middleware for admin routes
export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session?.isAdminAuthenticated === true) {
    next();
  } else {
    res.status(401).json({
      message: 'Unauthorized: Admin authentication required',
      authenticated: false
    });
  }
}

/**
 * Does this password match the configured admin credential?
 *
 * Read from `process.env` at CALL time, not module load, so a test (and a restart-free secret
 * rotation) sees the current value rather than one frozen at import.
 */
export function loginAdmin(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD?.trim() ?? '';
  // Unconfigured is closed — checked before anything is compared.
  if (expected.length < MIN_ADMIN_PASSWORD_LENGTH) return false;

  const provided = typeof password === 'string' ? password : '';
  if (provided.length === 0) return false;

  // Equal-length digests: constant-time, and no length oracle.
  const a = createHash('sha256').update(provided, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/**
 * Authenticate and mark the session.
 *
 * REGENERATES THE SESSION ID on success. A visitor arrives with a session id already in hand
 * (the store issues one before login), so promoting that same id to "admin" means an id an
 * attacker could have planted becomes an authenticated id — session fixation. A new id at the
 * moment privilege changes is the standard defence and costs one round-trip to the store.
 *
 * Async because `regenerate` is. On any store error this resolves false rather than throwing,
 * so a failed regenerate reads as a failed login instead of an unhandled 500 that leaves the
 * old session marked authenticated.
 */
export async function authenticateAdminSession(req: Request, password: string): Promise<boolean> {
  if (!loginAdmin(password)) return false;
  if (!req.session) return false;

  return await new Promise<boolean>((resolve) => {
    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regeneration error:', err);
        return resolve(false);
      }
      req.session.isAdminAuthenticated = true;
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Session save error:', saveErr);
          return resolve(false);
        }
        resolve(true);
      });
    });
  });
}

// Helper function to logout admin
export function logoutAdminSession(req: Request): void {
  req.session.isAdminAuthenticated = false;
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction error:', err);
    }
  });
}
