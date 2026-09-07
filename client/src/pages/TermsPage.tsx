import { useEffect } from "react";
import { Link } from "wouter";
import { updateCanonicalUrl, updateMetaDescription } from "@/lib/seo";
import { Eyebrow } from "@/components/editorial";

const EMAIL = "animuradyan.artist@gmail.com";

/**
 * /terms — Terms & Conditions. Every clause describes how the site actually behaves (originals are
 * unique studio works; prints are made to order by fulfilment partners; prices are USD; payment is
 * Stripe; shipping is quoted at checkout; returns follow /returns). Kept in sync with
 * renderTermsHtml (the server-rendered, crawlable version). Nothing legal/business is invented.
 */
export default function TermsPage() {
  useEffect(() => {
    document.title = "Terms & Conditions — Ani Muradyan";
    updateCanonicalUrl("/terms");
    updateMetaDescription(
      "Terms of sale and use for animuradyan.com: original paintings and made-to-order fine-art prints, USD pricing, Stripe payments, shipping, returns, and copyright.",
    );
  }, []);

  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      <section className="px-6 pt-20 md:pt-28 pb-16 max-w-2xl mx-auto">
        <Eyebrow>Information</Eyebrow>
        <h1 className="font-playfair text-4xl md:text-5xl text-stone-900 mb-6">Terms &amp; Conditions</h1>
        <p className="text-base text-stone-700 leading-relaxed mb-8">
          These terms govern your use of animuradyan.com and any purchase of an original painting or
          fine-art print from Ani Muradyan. By using the site or placing an order you agree to them.
        </p>

        <h2 className="font-playfair text-2xl text-stone-900 mt-8 mb-3">Using this site</h2>
        <p className="text-stone-700 leading-relaxed mb-4">
          This is the personal website of the Armenian contemporary artist Ani Muradyan. You may browse
          it and buy the works offered for sale. The content is provided as-is for that purpose.
        </p>

        <h2 className="font-playfair text-2xl text-stone-900 mt-8 mb-3">Artworks &amp; prints</h2>
        <p className="text-stone-700 leading-relaxed mb-4">
          Original paintings are unique, one-of-a-kind works; once one is sold it is no longer available.
          Fine-art prints are <strong>made to order</strong> — produced individually for you by professional
          printing partners on archival Hahnemühle fine-art paper or stretched canvas, and are open
          editions, so buying a print never affects the uniqueness of the original.
        </p>

        <h2 className="font-playfair text-2xl text-stone-900 mt-8 mb-3">Prices &amp; payment</h2>
        <p className="text-stone-700 leading-relaxed mb-4">
          Prices are shown in US dollars (USD) and are the amount charged for the item. Payment is
          processed securely by <strong>Stripe</strong>; your full card details are entered on Stripe's
          systems and are never seen or stored by this site. An order is confirmed once payment is completed.
        </p>

        <h2 className="font-playfair text-2xl text-stone-900 mt-8 mb-3">Shipping</h2>
        <p className="text-stone-700 leading-relaxed mb-4">
          Shipping is <strong>calculated at checkout</strong> for your destination, so the exact cost is
          shown before you pay. Prints are produced within a few business days and then shipped with tracked
          delivery; originals are packed and shipped from the studio in Yerevan, Armenia. See the{" "}
          <Link href="/shipping" className="underline hover:text-stone-900">Shipping</Link> page for details.
        </p>

        <h2 className="font-playfair text-2xl text-stone-900 mt-8 mb-3">Returns &amp; refunds</h2>
        <p className="text-stone-700 leading-relaxed mb-4">
          Damaged, defective, or not-as-described items are replaced or refunded. Made-to-order prints are
          generally not eligible for change-of-mind returns once in production; an original bought and
          delivered within the EU carries a 14-day right to change your mind. Full terms are on the{" "}
          <Link href="/returns" className="underline hover:text-stone-900">Returns &amp; Refunds</Link> page,
          which forms part of these terms.
        </p>

        <h2 className="font-playfair text-2xl text-stone-900 mt-8 mb-3">Intellectual property</h2>
        <p className="text-stone-700 leading-relaxed mb-4">
          All images, paintings, prints, text and other content on this site are the intellectual property
          of Ani Muradyan and are protected by copyright. Buying a work transfers the physical piece, not the
          copyright: it may not be reproduced, resold as a reproduction, or used commercially without written
          permission.
        </p>

        <h2 className="font-playfair text-2xl text-stone-900 mt-8 mb-3">Limitation of liability</h2>
        <p className="text-stone-700 leading-relaxed mb-4">
          The site is provided without warranties beyond those required by law. To the extent permitted by
          law, liability for any claim relating to a purchase is limited to the amount paid for the item
          concerned. Nothing here limits your statutory consumer rights.
        </p>

        <h2 className="font-playfair text-2xl text-stone-900 mt-8 mb-3">Contact</h2>
        <p className="text-stone-700 leading-relaxed mb-4">
          Questions about these terms or an order — email{" "}
          <a href={`mailto:${EMAIL}`} className="underline hover:text-stone-900">{EMAIL}</a> (Ani Muradyan,
          Yerevan, Armenia).
        </p>

        <p className="text-sm text-stone-600">
          <Link href="/shipping" className="underline hover:text-stone-900">Shipping</Link>
          {" · "}
          <Link href="/returns" className="underline hover:text-stone-900">Returns</Link>
          {" · "}
          <Link href="/privacy" className="underline hover:text-stone-900">Privacy</Link>
          {" · "}
          <Link href="/contact" className="underline hover:text-stone-900">Contact</Link>
        </p>
      </section>
    </div>
  );
}
