/**
 * WHICH CODE IS ACTUALLY RUNNING — the question this site could not answer.
 *
 * On 2026-08-17, verifying that a published article survives a Replit republish, every
 * available signal failed to establish the one fact the test depended on: whether pressing
 * Publish had deployed anything at all. `/api/health` reported the database was connected
 * and 54 artworks existed — true both before and after a deploy, and equally true if no
 * deploy happened. The response headers name Google's frontend, not a build. And the
 * client bundle is content-hashed, so a server-only change rebuilds to a byte-identical
 * filename. "It republished" was something only the owner could attest to, by reading a
 * panel, which makes every deploy-dependent claim an act of trust rather than a
 * measurement.
 *
 * WHY NOT UPTIME. The obvious fix — report when the process started — does not work here.
 * Replit Autoscale scales to zero and cold-starts on the next request, so a fresh start
 * time is routine and proves nothing about the code. The marker has to come from BUILD
 * time, not boot time.
 *
 * SO: the mtime of the running bundle. In production `npm run build` writes dist/index.js
 * with esbuild, and this module is bundled into it, so `import.meta.url` resolves to that
 * file and its mtime is the instant the build produced it. It moves on EVERY rebuild —
 * including one whose output is byte-identical — which is exactly the property the
 * content-hashed client bundle lacks. Nobody has to remember to bump anything.
 *
 * `MARKER` is the deliberate half: a name for the release being shipped, useful when you
 * want to confirm a SPECIFIC commit reached production rather than merely a recent one.
 * Change it when that matters; leaving it stale costs nothing, because `builtAt` is the
 * part that cannot lie.
 */
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Name of the release being shipped. Optional; `builtAt` is the load-bearing field. */
export const MARKER = "2026-08-17 blog-persistence-cycle-2";

/**
 * When the running bundle was written, read ONCE at import — a later read would drift if
 * something ever touched the file, and the value is meant to describe this process.
 * Unreadable is reported as null rather than guessed at: a health endpoint that invents a
 * build time is worse than one that admits it does not know.
 */
export const BUILT_AT: string | null = (() => {
  try {
    return statSync(fileURLToPath(import.meta.url)).mtime.toISOString();
  } catch {
    return null;
  }
})();

export const buildInfo = { marker: MARKER, builtAt: BUILT_AT } as const;
