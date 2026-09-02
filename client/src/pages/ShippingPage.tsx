import { useEffect } from "react";
import { Link } from "wouter";
import { updateCanonicalUrl, updateMetaDescription } from "@/lib/seo";
import { Eyebrow } from "@/components/editorial";

const EMAIL = "animuradyan.artist@gmail.com";

/**
 * /shipping — a trust page for buyers and for Google Merchant Center's site check. Every statement
 * matches how the site actually behaves: prints are made to order, shipping is quoted per destination
 * at checkout, originals ship from the Yerevan studio. Kept in sync with renderShippingHtml (SSR).
 */
export default function ShippingPage() {
  useEffect(() => {
    document.title = "Shipping — Ani Muradyan";
    updateCanonicalUrl("/shipping");
    updateMetaDescription(
      "How fine-art prints and original paintings by Ani Muradyan are shipped worldwide. Prints are made to order; shipping is calculated at checkout by destination.",
    );
  }, []);

  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      <section className="px-6 pt-20 md:pt-28 pb-16 max-w-2xl mx-auto">
        <Eyebrow>Information</Eyebrow>
        <h1 className="font-playfair text-4xl md:text-5xl text-stone-900 mb-6">Shipping</h1>
        <p className="text-base text-stone-700 leading-relaxed mb-8">
          Fine-art prints and original paintings by Ani Muradyan ship worldwide.
        </p>

        <h2 className="font-playfair text-2xl text-stone-900 mt-8 mb-3">Fine-art prints</h2>
        <p className="text-stone-700 leading-relaxed mb-4">
          Every print is <strong>made to order</strong> — produced individually for you on archival
          Hahnemühle fine-art paper or stretched canvas with archival pigment inks. Nothing is held in stock.
        </p>
        <p className="text-stone-700 leading-relaxed mb-4">
          Prints are usually produced within a few business days and then shipped with tracked delivery.
          Total delivery time depends on your destination.
        </p>
        <p className="text-stone-700 leading-relaxed mb-4">
          Shipping is <strong>calculated at checkout</strong> for your specific destination, so the exact
          cost is shown before you pay.
        </p>

        <h2 className="font-playfair text-2xl text-stone-900 mt-8 mb-3">Original paintings</h2>
        <p className="text-stone-700 leading-relaxed mb-4">
          Original works ship from the artist's studio in Yerevan, Armenia, carefully packed. For an
          original, please <Link href="/contact" className="underline hover:text-stone-900">contact the artist</Link> to
          arrange shipping to your country.
        </p>

        <h2 className="font-playfair text-2xl text-stone-900 mt-8 mb-3">Questions about an order</h2>
        <p className="text-stone-700 leading-relaxed mb-8">
          Email <a href={`mailto:${EMAIL}`} className="underline hover:text-stone-900">{EMAIL}</a> with your
          order number and we'll help.
        </p>

        <p className="text-sm text-stone-600">
          <Link href="/prints" className="underline hover:text-stone-900">Browse fine-art prints</Link>
          {" · "}
          <Link href="/returns" className="underline hover:text-stone-900">Returns &amp; refunds</Link>
        </p>
      </section>
    </div>
  );
}
