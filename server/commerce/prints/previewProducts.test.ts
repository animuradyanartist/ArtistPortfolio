import { describe, it, expect, afterEach } from "vitest";
import { isPrintPreviewMode, getPreviewCatalogue, getPreviewDetail, getPreviewSlugForArtwork } from "./previewProducts";

const set = (v?: string) => {
  if (v === undefined) delete process.env.PRINT_PREVIEW_MODE;
  else process.env.PRINT_PREVIEW_MODE = v;
};
afterEach(() => set(undefined));

describe("E. production/default is fail-closed — preview needs an explicit flag", () => {
  it("isPrintPreviewMode is OFF by default and for any non-true value", () => {
    set(undefined); expect(isPrintPreviewMode()).toBe(false);
    set(""); expect(isPrintPreviewMode()).toBe(false);
    set("false"); expect(isPrintPreviewMode()).toBe(false);
    set("yes"); expect(isPrintPreviewMode()).toBe(false);
    set("0"); expect(isPrintPreviewMode()).toBe(false);
  });

  it("isPrintPreviewMode is ON only for 'true' / '1'", () => {
    set("true"); expect(isPrintPreviewMode()).toBe(true);
    set("1"); expect(isPrintPreviewMode()).toBe(true);
    set("TRUE"); expect(isPrintPreviewMode()).toBe(true);
  });

  it("with the flag OFF, the preview surface returns NOTHING (no demo products leak to production)", async () => {
    set(undefined);
    expect(await getPreviewCatalogue()).toEqual([]);
    expect(await getPreviewDetail("road-to-tuscany")).toBeNull();
    expect(await getPreviewSlugForArtwork(69)).toBeNull();
  });
});
