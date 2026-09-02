import { useEffect } from "react";
import { updateCanonicalUrl, updateMetaDescription } from "@/lib/seo";
import { Eyebrow } from "@/components/editorial";

const EMAIL = "animuradyan.artist@gmail.com";

/**
 * /privacy — factual privacy page. Every processor named is one the site actually uses: Stripe for
 * payments, Google Analytics + Microsoft Clarity for analytics (both declared in index.html). No
 * invented registration/legal language. Kept in sync with renderPrivacyHtml (SSR).
 */
export default function PrivacyPage() {
  useEffect(() => {
    document.title = "Privacy — Ani Muradyan";
    updateCanonicalUrl("/privacy");
    updateMetaDescription(
      "How animuradyan.com handles your personal information: order and contact data only, Stripe for payments, and never sold.",
    );
  }, []);

  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      <section className="px-6 pt-20 md:pt-28 pb-16 max-w-2xl mx-auto">
        <Eyebrow>Information</Eyebrow>
        <h1 className="font-playfair text-4xl md:text-5xl text-stone-900 mb-6">Privacy</h1>
        <p className="text-base text-stone-700 leading-relaxed mb-8">
          This site collects the minimum needed to fulfil your order and answer your messages, and never
          sells your personal information.
        </p>

        <h2 className="font-playfair text-2xl text-stone-900 mt-8 mb-3">What we collect</h2>
        <p className="text-stone-700 leading-relaxed mb-4">
          When you place an order: your name, email address, shipping address, and the items ordered. When
          you use the contact form: your name, email address, and message.
        </p>

        <h2 className="font-playfair text-2xl text-stone-900 mt-8 mb-3">Payments</h2>
        <p className="text-stone-700 leading-relaxed mb-4">
          Payments are processed securely by <strong>Stripe</strong>. Your full card details are entered on
          Stripe's systems and are never seen or stored by this site.
        </p>

        <h2 className="font-playfair text-2xl text-stone-900 mt-8 mb-3">Fulfilment</h2>
        <p className="text-stone-700 leading-relaxed mb-4">
          To make and deliver a print, your name and shipping address are shared with the printing and
          shipping partners who produce and post your order. They use this information only to fulfil your order.
        </p>

        <h2 className="font-playfair text-2xl text-stone-900 mt-8 mb-3">Analytics</h2>
        <p className="text-stone-700 leading-relaxed mb-4">
          This site uses Google Analytics and Microsoft Clarity to understand how the site is used and to
          improve it. These services may set cookies in your browser.
        </p>

        <h2 className="font-playfair text-2xl text-stone-900 mt-8 mb-3">Your choices</h2>
        <p className="text-stone-700 leading-relaxed mb-4">
          To ask what personal data we hold, or to have it corrected or deleted, email{" "}
          <a href={`mailto:${EMAIL}`} className="underline hover:text-stone-900">{EMAIL}</a>.
        </p>

        <h2 className="font-playfair text-2xl text-stone-900 mt-8 mb-3">Contact</h2>
        <p className="text-stone-700 leading-relaxed">
          Ani Muradyan · Yerevan, Armenia ·{" "}
          <a href={`mailto:${EMAIL}`} className="underline hover:text-stone-900">{EMAIL}</a>
        </p>
      </section>
    </div>
  );
}
