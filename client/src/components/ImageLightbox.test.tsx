/**
 * The fullscreen viewer's visual shell. Rendered server-side (the repo has no DOM harness) so we
 * can assert exactly what it puts on screen: which image, which accessible controls, and — the
 * load-bearing security property — that it renders ONLY the public URLs it was handed and never a
 * master / crop-source / signed fulfilment URL.
 *
 * Escape-to-close, focus-trap and portal come from the Radix dialog `ImageLightbox` wraps this in;
 * the click-to-open / navigate / zoom behaviour is the pure logic covered in lib/lightbox.test.ts.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LightboxStage } from "./ImageLightbox";
import { resetView } from "@/lib/lightbox";

const PUBLIC = [
  "/img/artwork/42/0",
  "https://animuradyan.com/img/artwork/42/1",
  "https://cdn.example.com/prodigi-mockup.jpg", // a public Prodigi presentation mockup
];

const noop = () => {};
const render = (images: string[], index = 0) =>
  renderToStaticMarkup(
    <LightboxStage
      images={images}
      index={index}
      scale={resetView().scale}
      pan={resetView().pan}
      title="Endless Horizon"
      alt={(src, i) => `Endless Horizon – view ${i + 1}`}
      onClose={noop} onPrev={noop} onNext={noop}
      onZoomIn={noop} onZoomOut={noop} onResetZoom={noop}
    />,
  );

describe("LightboxStage — what the viewer shows", () => {
  it("renders the current public image with its alt text", () => {
    const html = render(PUBLIC, 0);
    expect(html).toContain('src="/img/artwork/42/0"');
    expect(html).toContain('alt="Endless Horizon – view 1"');
  });

  it("shows the image WHOLE (object-contain), never stretched/cropped", () => {
    expect(render(PUBLIC)).toContain("object-contain");
  });

  it("exposes accessible zoom + close controls", () => {
    const html = render(PUBLIC);
    expect(html).toContain('aria-label="Close viewer"');
    expect(html).toContain('aria-label="Zoom in"');
    expect(html).toContain('aria-label="Zoom out"');
    expect(html).toContain('aria-label="Reset zoom"');
  });

  it("shows prev/next controls and a counter when there are several images", () => {
    const html = render(PUBLIC, 1);
    expect(html).toContain('aria-label="Previous image"');
    expect(html).toContain('aria-label="Next image"');
    expect(html).toContain("2 / 3"); // 1-based counter for index 1 of 3
  });

  it("shows NO prev/next (and no counter) for a single image", () => {
    const html = render([PUBLIC[0]], 0);
    expect(html).not.toContain('aria-label="Previous image"');
    expect(html).not.toContain('aria-label="Next image"');
    expect(html).not.toMatch(/\d+ \/ \d+/);
  });

  it("renders ONLY the public URLs it was given — never a master/private/signed source", () => {
    const html = render(PUBLIC, 2);
    // The shown image is exactly the public URL passed in.
    expect(html).toContain('src="https://cdn.example.com/prodigi-mockup.jpg"');
    // Nothing resembling a private/master/fulfilment asset can appear — the component has no such input.
    expect(html).not.toMatch(/master|printReady|print-ready|X-Amz-|Signature=|data:image|blob:/i);
  });

  it("is safe with an out-of-range index (wraps rather than blanking)", () => {
    const html = render(PUBLIC, 9); // 9 % 3 = 0
    expect(html).toContain('src="/img/artwork/42/0"');
  });
});
