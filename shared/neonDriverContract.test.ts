/**
 * THE DRIVER BUG THAT TERMINATED THE SERVER, PINNED SO IT CANNOT RETURN.
 *
 * Production crashed repeatedly with
 *   TypeError: Cannot set property message of #<ErrorEvent> which has only a getter
 *   command finished with error [npm run start]: exit status 1
 * then restarted and crashed the same way again.
 *
 * @neondatabase/serverless 0.10.4's Pool rewrote a connection failure IN PLACE:
 *   s && (o.message = "Connection terminated due to connection timeout")
 * Under the WebSocket driver that failure is a `ws` ErrorEvent, whose `message` is a getter
 * with no setter. Assigning to it inside the driver's strict-mode bundle throws, inside the
 * pool's own connect callback, where nothing catches it — so a slow connection did not fail a
 * query, it killed the process and every in-flight request with it.
 *
 * `connectionTimeoutMillis: 2000` against a serverless endpoint that cold-starts is what made
 * that path ordinary rather than exceptional.
 *
 * These tests do not mock the driver. They assert against the SHIPPED bundle and the SHIPPED
 * ws class, because the thing that broke production was the interaction between two real
 * packages, and a mock of either would have agreed with itself and proved nothing.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const fs = require_('node:fs') as typeof import('node:fs');
// Read from disk rather than resolve(): 1.x narrows "exports", so the bundle and its
// package.json are deliberately not importable subpaths. The point is to inspect the SHIPPED
// artifact, which is exactly what production runs.
const pkgDir = new URL('../node_modules/@neondatabase/serverless/', import.meta.url);
const bundle: string = fs.readFileSync(new URL('index.js', pkgDir), 'utf8');
const driverVersion: string = JSON.parse(fs.readFileSync(new URL('package.json', pkgDir), 'utf8')).version;
// ws narrows "exports" too, so its event classes are not importable. The source it ships is
// read instead — still the shipped artifact, and the declaration is the fact that matters.
const wsEventTarget: string = fs.readFileSync(
  new URL('../node_modules/ws/lib/event-target.js', import.meta.url), 'utf8',
);

/** An object shaped exactly as ws declares ErrorEvent: message readable, not writable. */
function getterOnlyMessage(text: string): { readonly message: string } {
  return Object.create(Object.defineProperty({}, 'message', {
    get: () => text,
    configurable: true,
  })) as { readonly message: string };
}

describe('the ws ErrorEvent that the pool receives', () => {
  it('is declared by ws with a message GETTER and no setter — the precondition', () => {
    expect(wsEventTarget).toMatch(/class ErrorEvent extends Event/);
    // A getter exists...
    expect(wsEventTarget).toMatch(/get message\(\)/);
    // ...and nothing anywhere in the file defines a setter for it.
    expect(wsEventTarget).not.toMatch(/set message\s*\(/);
  });

  it('throws the EXACT production error when written to in strict mode', () => {
    'use strict';
    const ev = getterOnlyMessage('socket hang up');
    expect(() => {
      // Precisely what 0.10.4 did on a connection timeout.
      (ev as { message: string }).message = 'Connection terminated due to connection timeout';
    }).toThrow(/Cannot set property message/);
  });

  it('accepts being WRAPPED instead, losing nothing', () => {
    const ev = getterOnlyMessage('socket hang up');
    const wrapped = new Error('Connection terminated due to connection timeout', { cause: ev });
    expect(wrapped.message).toBe('Connection terminated due to connection timeout');
    expect(wrapped.cause).toBe(ev);
  });
});

describe('the installed driver must be one that wraps, not mutates', () => {
  it('does NOT assign to .message on the connection-timeout path', () => {
    // 0.10.4:  s&&(o.message="Connection terminated due to connection timeout")
    expect(bundle.replace(/\s/g, '')).not.toMatch(/s&&\(o\.message=/);
    expect(bundle).not.toMatch(/\.message\s*=\s*["']Connection terminated due to connection timeout["']/);
  });

  it('constructs a new Error on that path instead', () => {
    // 1.1.0:  s&&(o=new Error("Connection terminated due to connection timeout",{cause:o}))
    expect(bundle).toMatch(/new Error\(\s*["']Connection terminated due to connection timeout["']/);
  });

  it('is at least 1.0.0 — the floor is load-bearing, not cosmetic', () => {
    expect(Number(driverVersion.split('.')[0])).toBeGreaterThanOrEqual(1);
  });
});

describe('a pool error can no longer become an uncaught exception', () => {
  it('server/db.ts registers an error listener on the pool', () => {
    // Node rethrows an `error` event that has no listener. Without this line a dropped idle
    // connection — routine for a serverless endpoint — terminates the process.
    const src: string = fs.readFileSync(new URL('../server/db.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/pool\.on\(\s*["']error["']/);
  });

  it('does not use a two-second connection timeout against a cold serverless endpoint', () => {
    const src: string = fs.readFileSync(new URL('../server/db.ts', import.meta.url), 'utf8');
    const m = src.match(/connectionTimeoutMillis:\s*(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(5000);
  });
});
