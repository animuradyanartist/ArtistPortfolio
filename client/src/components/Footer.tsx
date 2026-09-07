import { Link, useLocation } from "wouter";

const EMAIL = "animuradyan.artist@gmail.com";

/**
 * The site's persistent trust footer — the one place every public page surfaces the business
 * identity, contact route and the policy pages (Shipping, Returns, Privacy, Terms). These pages
 * existed as real routes but were reachable from nowhere, which reads to Google Merchant Center as
 * a store hiding its policies. Exported as a constant so the "footer links to every policy page"
 * guarantee is unit-testable without a DOM.
 */
export const FOOTER_LINKS: { href: string; label: string }[] = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/shipping", label: "Shipping" },
  { href: "/returns", label: "Returns" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export default function Footer() {
  const [location] = useLocation();
  // The admin workspace is not a public storefront page; it keeps its own chrome.
  if (location.startsWith("/admin")) return null;

  return (
    <footer className="border-t border-stone-200 bg-[#f5f1ea] mt-16">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 mb-6">
          {FOOTER_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-stone-600 hover:text-stone-900 transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-1 text-sm text-stone-500">
          <p>
            <span className="text-stone-700">Ani Muradyan</span> — contemporary oil painter · Yerevan, Armenia
          </p>
          <p>
            <a href={`mailto:${EMAIL}`} className="underline hover:text-stone-900">{EMAIL}</a>
          </p>
          <p className="text-stone-400">© {new Date().getFullYear()} Ani Muradyan. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
