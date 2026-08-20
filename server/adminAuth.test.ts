/**
 * THE ADMIN BOUNDARY — the difference between "the owner" and "anyone on the internet".
 *
 * Until this was fixed, the password was a string literal in a PUBLIC repository, on a login
 * endpoint with no throttling, guarding thirty-odd routes including the one that publishes an
 * article. Everything below pins a property that failure depended on.
 *
 * The unauthenticated cases matter most. A boundary that only works when you hold the right
 * password is not a boundary — the interesting question is what happens when you do not, or
 * when the server was deployed without a credential at all. An empty expected value must never
 * match an empty submission.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import express from "express";
import session from "express-session";
import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import { registerRoutes } from "./routes";
import { loginAdmin, MIN_ADMIN_PASSWORD_LENGTH } from "./auth";
import {
  checkLoginAllowed,
  recordLoginFailure,
  recordLoginSuccess,
  resetLoginRateLimit,
  MAX_ATTEMPTS_PER_IP,
  MAX_ATTEMPTS_GLOBAL,
  WINDOW_MS,
  BASE_LOCKOUT_MS,
} from "./loginRateLimit";

// A deliberate, throwaway value used only inside this suite. It is not the production
// password and must never be one — the real credential lives only in ADMIN_PASSWORD.
const TEST_PASSWORD = "test-only-not-a-real-password";

let server: Server;
let origin: string;
const savedAdminPassword = process.env.ADMIN_PASSWORD;

beforeAll(async () => {
  const app = express();
  // registerRoutes() mounts neither of these — server/index.ts does, and tests never import it.
  app.use(express.json());
  app.use(
    session({
      secret: "test-session-secret-not-production",
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, httpOnly: true },
    }),
  );
  server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  origin = `http://127.0.0.1:${addr.port}`;
}, 30_000);

afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(() => {
  resetLoginRateLimit();
  process.env.ADMIN_PASSWORD = TEST_PASSWORD;
});

afterEach(() => {
  resetLoginRateLimit();
  if (savedAdminPassword === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = savedAdminPassword;
});

/** Node's fetch does not keep a cookie jar; the session cookie is threaded by hand. */
const cookieFrom = (res: Response): string => (res.headers.get("set-cookie") ?? "").split(";")[0]!;

const login = (password: unknown) =>
  fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });

describe("the credential comes from the environment, and nothing else", () => {
  it("accepts the configured password", () => {
    expect(loginAdmin(TEST_PASSWORD)).toBe(true);
  });

  it("rejects a wrong password", () => {
    expect(loginAdmin("wrong")).toBe(false);
    expect(loginAdmin(TEST_PASSWORD + "x")).toBe(false);
    expect(loginAdmin(TEST_PASSWORD.slice(0, -1))).toBe(false);
  });

  it("FAILS CLOSED when ADMIN_PASSWORD is unset — including for an empty submission", () => {
    delete process.env.ADMIN_PASSWORD;
    expect(loginAdmin("")).toBe(false);
    expect(loginAdmin("anything")).toBe(false);
    // The specific bug this shape prevents: an unset expected value matching an unset guess.
    expect(loginAdmin(undefined as unknown as string)).toBe(false);
  });

  it("FAILS CLOSED when ADMIN_PASSWORD is blank or too short to be deliberate", () => {
    process.env.ADMIN_PASSWORD = "   ";
    expect(loginAdmin("   ")).toBe(false);
    process.env.ADMIN_PASSWORD = "short";
    expect(loginAdmin("short")).toBe(false);
    expect("short".length).toBeLessThan(MIN_ADMIN_PASSWORD_LENGTH);
  });

  it("accepts a secret of exactly the minimum length, and refuses one character less", () => {
    // The boundary is a real decision, not an incidental constant: the owner's password sits
    // exactly on it. Derived from the constant so the two cannot drift apart, and asserted on
    // the value as well, so changing the floor is a visible edit rather than a silent one.
    expect(MIN_ADMIN_PASSWORD_LENGTH).toBe(10);

    const atMinimum = "a".repeat(MIN_ADMIN_PASSWORD_LENGTH);
    process.env.ADMIN_PASSWORD = atMinimum;
    expect(loginAdmin(atMinimum)).toBe(true);
    expect(loginAdmin(atMinimum + "x")).toBe(false);

    const oneShort = "a".repeat(MIN_ADMIN_PASSWORD_LENGTH - 1);
    process.env.ADMIN_PASSWORD = oneShort;
    // The correct value, still refused — the floor fails closed rather than bending.
    expect(loginAdmin(oneShort)).toBe(false);
  });

  it("carries no credential literal in the source it is defined in", () => {
    // A password in the file is a password in the repository, and this repository is public.
    const src = fs.readFileSync(path.resolve(process.cwd(), "server/auth.ts"), "utf8");
    expect(src).not.toMatch(/artist123/);
    expect(src).toMatch(/process\.env\.ADMIN_PASSWORD/);
  });

  it("does not fall back to a hardcoded session secret", () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), "server/index.ts"), "utf8");
    expect(src).not.toMatch(/fallback-secret-key-change-in-production/);
  });
});

describe("the login endpoint", () => {
  it("authenticates with the right password and refuses the wrong one", async () => {
    const bad = await login("definitely-not-the-password");
    expect(bad.status).toBe(401);

    const good = await login(TEST_PASSWORD);
    expect(good.status).toBe(200);
    expect((await good.json()).authenticated).toBe(true);
  });

  it("returns 401, not 500, when the server has no credential configured", async () => {
    delete process.env.ADMIN_PASSWORD;
    const res = await login(TEST_PASSWORD);
    expect(res.status).toBe(401);
    // A probe must not be able to tell "unconfigured" from "wrong password".
    expect((await res.json()).message).toBe("Invalid password");
  });

  it("issues a NEW session id on login, so a planted session cannot be promoted", async () => {
    // Session fixation: an id the visitor already held must not become the admin id.
    const first = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong-on-purpose" }),
    });
    const before = cookieFrom(first as unknown as Response);

    const res = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(before ? { cookie: before } : {}) },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    });
    expect(res.status).toBe(200);
    const after = cookieFrom(res as unknown as Response);
    expect(after).toBeTruthy();
    if (before) expect(after).not.toBe(before);
  });
});

describe("admin routes stay owner-only", () => {
  it("refuses the article publish route without a session", async () => {
    // The single most consequential route: it is what puts writing in front of the public.
    const res = await fetch(`${origin}/api/admin/blog/1/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ live: true }),
    });
    expect(res.status).toBe(401);
  });

  it("refuses article edit and admin listing without a session", async () => {
    const patch = await fetch(`${origin}/api/admin/blog/1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "nope" }),
    });
    expect(patch.status).toBe(401);

    const list = await fetch(`${origin}/api/admin/blog`);
    expect(list.status).toBe(401);
  });

  it("refuses destructive artwork and gallery routes without a session", async () => {
    const del = await fetch(`${origin}/api/artworks/1`, { method: "DELETE" });
    expect(del.status).toBe(401);

    const create = await fetch(`${origin}/api/gallery-photos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: "data:image/png;base64,AAAA" }),
    });
    expect(create.status).toBe(401);
  });

  it("a forged cookie does not authenticate", async () => {
    const res = await fetch(`${origin}/api/admin/blog`, {
      headers: { cookie: "connect.sid=s%3Aforged.forgedsignature" },
    });
    expect(res.status).toBe(401);
  });
});

describe("brute force is bounded", () => {
  const IP = "203.0.113.7";

  it("locks an address out after repeated failures, and says how long to wait", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < MAX_ATTEMPTS_PER_IP; i++) {
      expect(checkLoginAllowed(IP, t0).allowed).toBe(true);
      recordLoginFailure(IP, t0);
    }
    const blocked = checkLoginAllowed(IP, t0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.scope).toBe("ip");
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("recovers once the lockout expires", () => {
    const t0 = 2_000_000;
    for (let i = 0; i < MAX_ATTEMPTS_PER_IP; i++) recordLoginFailure(IP, t0);
    expect(checkLoginAllowed(IP, t0).allowed).toBe(false);
    expect(checkLoginAllowed(IP, t0 + BASE_LOCKOUT_MS + 1).allowed).toBe(true);
  });

  it("escalates: the second lockout is longer than the first", () => {
    const t0 = 3_000_000;
    for (let i = 0; i < MAX_ATTEMPTS_PER_IP; i++) recordLoginFailure(IP, t0);
    const first = checkLoginAllowed(IP, t0).retryAfterSeconds;

    const t1 = t0 + BASE_LOCKOUT_MS + 1;
    for (let i = 0; i < MAX_ATTEMPTS_PER_IP; i++) recordLoginFailure(IP, t1);
    const second = checkLoginAllowed(IP, t1).retryAfterSeconds;

    expect(second).toBeGreaterThan(first);
  });

  it("a correct password clears that address, so the owner cannot lock themselves out", () => {
    const t0 = 4_000_000;
    for (let i = 0; i < MAX_ATTEMPTS_PER_IP - 1; i++) recordLoginFailure(IP, t0);
    recordLoginSuccess(IP);
    for (let i = 0; i < MAX_ATTEMPTS_PER_IP - 1; i++) {
      expect(checkLoginAllowed(IP, t0).allowed).toBe(true);
      recordLoginFailure(IP, t0);
    }
  });

  it("a GLOBAL ceiling still holds when every attempt claims a different address", () => {
    // This is the layer that survives bad IP attribution — one attacker with many addresses,
    // or a platform edge that makes everyone look like one.
    const t0 = 5_000_000;
    for (let i = 0; i < MAX_ATTEMPTS_GLOBAL; i++) recordLoginFailure(`198.51.100.${i % 250}.${i}`, t0);
    const fresh = checkLoginAllowed("192.0.2.99", t0);
    expect(fresh.allowed).toBe(false);
    expect(fresh.scope).toBe("global");
  });

  it("forgets failures older than the window", () => {
    const t0 = 6_000_000;
    for (let i = 0; i < MAX_ATTEMPTS_PER_IP - 1; i++) recordLoginFailure(IP, t0);
    expect(checkLoginAllowed(IP, t0 + WINDOW_MS + 1).allowed).toBe(true);
  });

  it("the endpoint itself answers 429 with Retry-After once locked out", async () => {
    for (let i = 0; i < MAX_ATTEMPTS_PER_IP + 1; i++) await login("wrong-guess");
    const res = await login(TEST_PASSWORD); // even the RIGHT password is refused while locked
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });
});
