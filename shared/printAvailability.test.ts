import { describe, it, expect } from "vitest";
import { printViewState } from "./printAvailability";

type P = { id: number; slug: string };
const fetched: P = { id: 19, slug: "road_through_gold" };
const preloaded: P = { id: 19, slug: "road_through_gold" };

describe("printViewState — a blocked fetch is not a missing print", () => {
  it("shows the fetched print when the API answered", () => {
    expect(printViewState({ fetched, preloaded: undefined, isLoading: false })).toEqual({ show: fetched, state: "print" });
  });

  it("SOFT-404 GUARD: a blocked/failed fetch still shows the print when the server preloaded it", () => {
    // Googlebot's renderer blocks /api → fetched is undefined, isLoading settled false. The server's
    // embedded copy must keep the product on the page, NOT render Not-Found.
    expect(printViewState({ fetched: undefined, preloaded, isLoading: false })).toEqual({ show: preloaded, state: "print" });
  });

  it("prefers the fresh fetched row over the preload once it arrives", () => {
    const fresh: P = { id: 19, slug: "road_through_gold" };
    expect(printViewState({ fetched: fresh, preloaded, isLoading: false }).show).toBe(fresh);
  });

  it("is 'loading' only while pending with nothing to show yet", () => {
    expect(printViewState({ fetched: undefined, preloaded: undefined, isLoading: true })).toEqual({ show: undefined, state: "loading" });
  });

  it("is 'missing' only when there is no fetched row AND no preload, once settled", () => {
    expect(printViewState({ fetched: undefined, preloaded: undefined, isLoading: false })).toEqual({ show: undefined, state: "missing" });
  });
})
