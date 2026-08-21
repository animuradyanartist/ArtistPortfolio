/**
 * "MISSING" AND "UNREACHABLE" ARE DIFFERENT ANSWERS, AND ONLY ONE OF THEM IS A 404.
 *
 * Google live-tested https://animuradyan.com/artworks/blue-drift-40 on 21 August 2026. The
 * server got everything right — `<title>Blue Drift`, the canonical, `index, follow`, the
 * VisualArtwork JSON-LD, and `window.__PRELOADED_ARTWORK__` carrying the complete row for
 * id 40. Then the app rendered, and `#root` said:
 *
 *     <h1>Artwork not found</h1>
 *     The piece you're looking for doesn't exist or has been removed.
 *
 * That rendered DOM is what Google indexes, so it called the URL a SOFT 404 — on a painting
 * the server had already found and handed to the client.
 *
 * The cause was one condition: `if (error || !artwork)`. `error` is set by ANY failed fetch —
 * a 500, a timeout, a dropped connection during a redeploy — not only by a 404. So a single
 * transient API failure did not degrade the page, it INVERTED it: a valid painting became a
 * page that tells search engines, and people, that the painting does not exist. And it did so
 * while `window.__PRELOADED_ARTWORK__` sat on the page proving otherwise.
 *
 * This module names the one case that genuinely means "there is no such painting". Everything
 * else is the network being the network, and the correct response to the network being the
 * network is to keep showing the work the server already sent.
 *
 * PURE and shared so the page, the tests and any future caller cannot disagree about which
 * failures are 404s — the same reason `artworkAddress.ts` exists.
 */

/** Thrown ONLY when the server said, definitively, that this artwork does not exist. */
export class ArtworkMissingError extends Error {
  readonly artworkMissing = true as const;
  constructor(param: string) {
    super(`No artwork exists at "${param}"`);
    this.name = "ArtworkMissingError";
  }
}

/**
 * Does this failure mean the painting is absent, or merely that we could not reach it?
 *
 * Only a 404 means absent. 410 Gone would too, but nothing serves one today and inventing
 * that branch now would be a guess rather than a rule.
 */
export function isMissingResponse(status: number): boolean {
  return status === 404;
}

/** A thrown value that means "no such artwork" — the only thing that may render not-found. */
export function meansArtworkMissing(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { artworkMissing?: boolean }).artworkMissing === true);
}

/**
 * WHAT THE PAGE SHOULD SHOW, decided in one place.
 *
 * `missing` is reserved for a definitive 404. `artwork` is whatever we can legitimately
 * display — the fetched row, or failing that the one the server preloaded for this exact URL.
 * A page that HAS a painting to show never shows "not found", whatever the network did.
 */
export function artworkViewState<T>(input: {
  fetched: T | undefined;
  preloaded: T | undefined;
  error: unknown;
  isLoading: boolean;
}): { show: T | undefined; state: "artwork" | "loading" | "missing" } {
  if (meansArtworkMissing(input.error)) return { show: undefined, state: "missing" };
  const show = input.fetched ?? input.preloaded;
  if (show) return { show, state: "artwork" };
  if (input.isLoading) return { show: undefined, state: "loading" };
  // No data, not loading, and the failure was not a 404: we could not reach the artwork.
  // There is nothing to render, so not-found is the only honest remaining answer — but it is
  // now the LAST branch rather than the first, and unreachable whenever a preload exists.
  return { show: undefined, state: "missing" };
}
