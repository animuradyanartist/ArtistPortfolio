import { useEffect } from "react";
import { Link } from "wouter";
import { updateCanonicalUrl, updateMetaDescription } from "@/lib/seo";
import { Eyebrow } from "@/components/editorial";

const EMAIL = "animuradyan.artist@gmail.com";

/**
 * /returns — buyer + Google Merchant Center trust page. Grounded in the real model: prints are made
 * to order (no change-of-mind returns once in production), damaged/defective items are replaced or
 * refunded (the order lifecycle supports refunds/cancellations). Kept in sync with renderReturnsHtml.
 */
export default function ReturnsPage() {
  useEffect(() => {
    document.title = "Returns & Refunds — Ani Muradyan";
    updateCanonicalUrl("/returns");
    updateMetaDescription(
      "Returns and refunds for made-to-order fine-art prints by Ani Muradyan. Damaged or defective items are replaced or refunded within 14 days.",
    );
  }, []);

  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      <section className="px-6 pt-20 md:pt-28 pb-16 max-w-2xl mx-auto">
        <Eyebrow>Information</Eyebrow>
        <h1 className="font-playfair text-4xl md:text-5xl text-stone-900 mb-6">Returns &amp; Refunds</h1>
        <p className="text-base text-stone-700 leading-relaxed mb-8">
          We stand behind every piece. Returns work differently for made-to-order fine-art prints and for
          unique original paintings, so each is set out separately below.
        </p>

        <h2 className="font-playfair text-2xl text-stone-900 mt-8 mb-3">Fine-art prints</h2>
        <p className="text-stone-700 leading-relaxed mb-4">
          If a print arrives damaged, defective, or materially different from what was ordered, we
          will make it right with a <strong>free replacement or a full refund</strong>. Email{" "}
          <a href={`mailto:${EMAIL}`} className="underline hover:text-stone-900">{EMAIL}</a> within 14 days
          of delivery with your order number and a photo of the issue.
        </p>
        <p className="text-stone-700 leading-relaxed mb-4">
          Prints are produced individually to order and are not held in stock, so we are generally unable
          to accept change-of-mind returns or exchanges once production has begun. If you need to change
          or cancel an order, contact us as soon as possible and we will do our best before it goes to production.
        </p>

        <h2 className="font-playfair text-2xl text-stone-900 mt-8 mb-3">Original paintings</h2>
        <p className="text-stone-700 leading-relaxed mb-4">
          Original paintings are unique, finished works — not made to order. For an original bought online
          and delivered within the EU, you have a <strong>14-day right to change your mind</strong> from the
          day it arrives: you may return it for a full refund of the item price, without giving a reason.
        </p>
        <p className="text-stone-700 leading-relaxed mb-4">
          For a change-of-mind return you arrange and <strong>pay the return shipping</strong>. Because an
          original is large and its shipping can be significant, the exact shipping cost is shown at checkout
          before you buy, and we will estimate the likely return cost on request — so you know the cost before
          you order. Please return the work unused, in its original condition and packaging, so it arrives safely.
        </p>
        <p className="text-stone-700 leading-relaxed mb-4">
          If an original arrives <strong>damaged, defective, or not as described</strong>, we put it right at
          no cost to you — email{" "}
          <a href={`mailto:${EMAIL}`} className="underline hover:text-stone-900">{EMAIL}</a> within 14 days of
          delivery with your order number and photos.
        </p>

        <h2 className="font-playfair text-2xl text-stone-900 mt-8 mb-3">How refunds are issued</h2>
        <p className="text-stone-700 leading-relaxed mb-8">
          Approved refunds are returned to your original payment method.
        </p>

        <p className="text-sm text-stone-600">
          <Link href="/shipping" className="underline hover:text-stone-900">Shipping</Link>
          {" · "}
          <Link href="/contact" className="underline hover:text-stone-900">Contact</Link>
        </p>
      </section>
    </div>
  );
}
