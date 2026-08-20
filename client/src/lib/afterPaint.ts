/**
 * "NOT NOW — AFTER THE PAGE HAS PAINTED."
 *
 * Some data a page shows is genuinely secondary: three thumbnails below the fold, a
 * navigation link that only appears when articles exist. Requested on mount, they leave the
 * network at the same instant as the thing the visitor actually came for, and on a slow
 * connection they take their share of it.
 *
 * This returns false on the first render and true once the browser has finished painting and
 * has spare time, so a query gated on it cannot compete with first paint. The timeout is the
 * guarantee: a page that never goes idle still gets its secondary data, just last.
 *
 * Deliberately NOT an IntersectionObserver. Whether something is worth fetching here is a
 * question about priority, not about scroll position, and tying it to the viewport would make
 * the answer depend on the window size.
 */
import { useEffect, useState } from "react";

interface IdleWindow {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
}

export function useAfterPaint(timeoutMs = 2000): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const w = window as unknown as IdleWindow;
    if (typeof w.requestIdleCallback === "function") {
      const handle = w.requestIdleCallback(() => setReady(true), { timeout: timeoutMs });
      return () => w.cancelIdleCallback?.(handle);
    }
    // Safari has no requestIdleCallback. A short timer is not the same thing, but it does the
    // one job that matters: it puts this after the current paint rather than in front of it.
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, [timeoutMs]);

  return ready;
}
