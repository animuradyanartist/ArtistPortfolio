/**
 * SUBTLE "SAVE TO PINTEREST" ACTION for artwork + print PDPs.
 *
 * Deliberately minimal: a small Pinterest glyph + "Save" label styled like the site's other quiet
 * uppercase links — never a large red button, never promotional. It renders a real anchor whose
 * href IS the Pinterest create-Pin URL (built from the exact page URL + main public image +
 * factual description), so:
 *   • it works with JavaScript disabled and is crawlable/testable (the URL is in the DOM), and
 *   • on click it opens Pinterest's standard Save flow in a centred popup, falling back to the
 *     anchor's normal new-tab navigation when a popup is blocked or on mobile.
 *
 * NO Pinterest SDK, NO tracking pixel, NO cookie is added by this component. The only analytics is
 * one lightweight GA4 event on the site's existing gtag (`pinterest_save_click`).
 */
import { BASE_URL } from "@/lib/seo";
import { toAbsolutePinImage, buildPinterestSaveUrl } from "@/lib/pinterest";
import { trackPinterestSaveClick } from "@/lib/commerceAnalytics";

interface PinterestSaveProps {
  /** Absolute canonical URL of this PDP — the exact page the Pin links back to. */
  pageUrl: string;
  /** The work's title (used for the description fallback + the accessible label). */
  title: string;
  /** Short, factual description built from existing metadata. No invented marketing claims. */
  description?: string | null;
  /** The main product image shown on the page (a first-party /img ref or an absolute URL). */
  imageUrl?: string | null;
  /** Which PDP this is — drives the analytics `item_type`. */
  itemType: "original" | "print";
  itemId: number | string;
  itemName: string;
  /** Source original artwork id — a print passes `data.artworkId`; an original omits it. */
  artworkId?: number | null;
  /** Optional style override; defaults to the quiet uppercase link style used across the PDPs. */
  className?: string;
}

/** Pinterest brand mark, single-colour (currentColor) so it inherits the link's stone tones. */
function PinterestGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className={className}>
      <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z" />
    </svg>
  );
}

export function PinterestSave({
  pageUrl,
  title,
  description,
  imageUrl,
  itemType,
  itemId,
  itemName,
  artworkId,
  className,
}: PinterestSaveProps) {
  const media = toAbsolutePinImage(imageUrl, BASE_URL);
  const pinUrl = buildPinterestSaveUrl({ url: pageUrl, media, description: description ?? title });

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    trackPinterestSaveClick({ itemId, itemName, itemType, artworkId, pageLocation: pageUrl });
    // Open Pinterest's Save flow in a centred popup. If the browser blocks it (or is mobile and
    // returns no handle), we do NOT preventDefault — the anchor then opens Pinterest in a new tab.
    if (typeof window !== "undefined" && typeof window.open === "function") {
      const w = 750;
      const h = 650;
      const left = Math.round((window.screenX ?? 0) + Math.max(0, ((window.outerWidth || 1024) - w) / 2));
      const top = Math.round((window.screenY ?? 0) + Math.max(0, ((window.outerHeight || 768) - h) / 2));
      const popup = window.open(pinUrl, "pinterest-save", `popup,width=${w},height=${h},left=${left},top=${top}`);
      if (popup) {
        popup.opener = null; // sever the reference; the popup cannot script this window back
        popup.focus?.();
        e.preventDefault();
      }
    }
  };

  return (
    <a
      href={pinUrl}
      onClick={onClick}
      target="_blank"
      rel="nofollow noopener noreferrer"
      aria-label={`Save “${title}” to Pinterest`}
      title="Save to Pinterest"
      className={
        className ??
        "inline-flex items-center gap-2 text-[11px] tracking-[0.2em] uppercase text-stone-500 hover:text-stone-900 transition-colors"
      }
    >
      <PinterestGlyph className="h-3.5 w-3.5" />
      Save
    </a>
  );
}
