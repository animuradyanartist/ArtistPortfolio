/**
 * "MISSING" AND "UNREACHABLE" ARE DIFFERENT ANSWERS FOR A PRINT TOO — the print PDP's version of
 * shared/artworkAvailability.ts, and of the same bug.
 *
 * Google live-tested https://animuradyan.com/prints/road_through_gold and reported Soft 404. The
 * server got everything right — the title, canonical, `index,follow`, the Product + Offer JSON-LD,
 * and (after this fix) `window.__PRELOADED_PRINT__` carrying the resolved print. Then the app
 * rendered and `#root` said "This print could not be found." The cause was one condition:
 * `if (isError || !data)`. `isError` is set by ANY failed fetch — and Google's renderer obeys
 * robots.txt, which disallows `/api`, so the client's fetch of `/api/commerce/prints/:slug` is
 * BLOCKED during Google's render. A blocked fetch is not "this print does not exist"; it is the
 * network being the network. The correct response is to keep showing the print the server already
 * sent, exactly as the artwork PDP does.
 *
 * A genuinely missing print never reaches this state: the server 404s the whole page for an unknown
 * slug and injects no preload, and a client-side navigation to a deleted print gets no preload
 * either (the preload is slug-gated), so `show` is undefined and the state is "missing".
 *
 * PURE and shared so the page and its tests cannot disagree about which failures mean "no such
 * print" — the same reason artworkAvailability.ts exists.
 */

export type PrintViewState<T> = { show: T | undefined; state: "print" | "loading" | "missing" };

/**
 * Decide what a print PDP should render. `fetched` is the API result (undefined while pending or
 * after a failed/blocked fetch); `preloaded` is the server's own copy embedded in the initial HTML.
 * The print shows whenever EITHER exists; only the absence of both — once loading has settled —
 * is "missing".
 */
export function printViewState<T>(input: {
  fetched: T | undefined;
  preloaded: T | undefined;
  isLoading: boolean;
}): PrintViewState<T> {
  const show = input.fetched ?? input.preloaded;
  if (show) return { show, state: "print" };
  if (input.isLoading) return { show: undefined, state: "loading" };
  return { show: undefined, state: "missing" };
}
