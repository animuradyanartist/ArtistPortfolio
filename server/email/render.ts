/**
 * THE EMAILS, AS THEY LOOK.
 *
 * These are written to feel like buying a painting from Ani — quiet, warm, gallery-grade — and
 * NOT like an e-commerce receipt. The palette, the Playfair/Poppins pairing and the tiny tracked
 * uppercase labels are the same language as the site: cream paper (#f5f1ea), espresso ink
 * (#26221c), warm stone greys, hairline rules, square edges. No badges, no green ticks, no
 * "Only 1 left!".
 *
 * Everything is table-based with inline styles for mail-client reality, has a plain-text twin,
 * and is mobile-responsive (a 600px card that goes fluid). We never fabricate a delivery date:
 * a timeframe appears only when it is actually known.
 */
import type { OrderRow } from "../commerce/orders";
import { formatMoney, type Currency } from "@shared/commerce/money";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@shared/commerce/orderStatus";

// ── brand ──
const CREAM = "#f5f1ea";
const PAPER = "#ffffff";
const INK = "#26221c";
const STONE_900 = "#1c1917";
const STONE_700 = "#44403c";
const STONE_500 = "#78716c";
const STONE_400 = "#a8a29e";
const STONE_300 = "#d6d3d1";
const SAGE = "#9c9d95";
const SUPPORT_EMAIL = "animuradyan.artist@gmail.com";
const INSTAGRAM = "https://www.instagram.com/animoria.art/";
const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
const SANS = "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export interface EmailContent { subject: string; html: string; text: string }

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function fmtDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  try {
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d));
  } catch { return null; }
}

// ── the view model every template reads ──
interface Model {
  reference: string;
  firstName: string;
  artworkTitle: string | null;
  artworkMeta: string | null;
  artworkImage: string | null;
  currency: Currency;
  itemPrice: string | null;
  shipping: string | null;
  hasShipping: boolean;
  total: string | null;
  destination: string | null;
  statusLabel: string;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedDate: string | null;
  expectedDispatch: string | null;
  estimatedDelivery: string | null;
  customerMessage: string | null;
  trackUrl: string;
}

function firstNameOf(name: string | null): string {
  const token = (name ?? "").trim().split(/\s+/)[0];
  return token || "there";
}

function absoluteImage(image: string | null | undefined, baseUrl: string): string | null {
  if (!image) return null;
  if (/^https?:\/\//i.test(image)) return image;
  const path = image.startsWith("/") ? image : `/${image}`;
  return `${baseUrl}${path}${path.includes("?") ? "" : "?w=800"}`;
}

export function toModel(order: OrderRow, baseUrl: string, trackUrl: string): Model {
  const currency = ((order.currency as Currency) || "EUR");
  const snap = order.artwork_snapshot ? safeParse(order.artwork_snapshot) : null;
  const s = (snap ?? {}) as { title?: string; dimensions?: string; medium?: string; year?: number; image?: string };
  const metaBits = [s.dimensions, s.medium, s.year ? String(s.year) : null].filter(Boolean) as string[];
  const city = order.ship_city?.trim();
  const country = order.ship_country?.trim();
  return {
    reference: order.reference,
    firstName: firstNameOf(order.buyer_name),
    artworkTitle: s.title ?? null,
    artworkMeta: metaBits.length ? metaBits.join(" · ") : null,
    artworkImage: absoluteImage(s.image, baseUrl),
    currency,
    itemPrice: order.item_price_minor != null ? formatMoney(order.item_price_minor, currency) : null,
    shipping: order.shipping_minor != null ? formatMoney(order.shipping_minor, currency) : null,
    hasShipping: (order.shipping_minor ?? 0) > 0,
    total: order.total_minor != null ? formatMoney(order.total_minor, currency) : null,
    destination: city && country ? `${city}, ${country}` : (country || city || null),
    statusLabel: ORDER_STATUS_LABEL[order.status as OrderStatus] ?? order.status,
    carrier: order.shipping_carrier,
    trackingNumber: order.tracking_number,
    trackingUrl: order.tracking_url,
    shippedDate: fmtDate(order.shipped_at),
    expectedDispatch: fmtDate(order.expected_dispatch_at),
    estimatedDelivery: fmtDate(order.estimated_delivery_at),
    customerMessage: order.customer_message,
    trackUrl,
  };
}

function safeParse(s: string): unknown { try { return JSON.parse(s); } catch { return null; } }

// ── shared pieces ──
function eyebrow(text: string): string {
  return `<div style="font-family:${SANS};font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:${STONE_500};padding-bottom:14px">${esc(text)}</div>`;
}
function heading(text: string): string {
  return `<h1 style="margin:0 0 18px;font-family:${SERIF};font-weight:500;font-size:28px;line-height:1.2;color:${STONE_900}">${esc(text)}</h1>`;
}
function para(text: string): string {
  return `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.7;color:${STONE_700}">${text}</p>`;
}
function button(label: string, href: string): string {
  // Bulletproof-ish table button, square edges, espresso ink.
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px">
    <tr><td bgcolor="${INK}" style="background:${INK}">
      <a href="${esc(href)}" target="_blank"
         style="display:inline-block;padding:14px 30px;font-family:${SANS};font-size:12px;
                letter-spacing:0.18em;text-transform:uppercase;color:${CREAM};text-decoration:none">${esc(label)}</a>
    </td></tr>
  </table>`;
}
function rule(): string {
  return `<div style="border-top:1px solid ${STONE_300};font-size:0;line-height:0;height:1px;margin:26px 0">&nbsp;</div>`;
}
function artworkBlock(m: Model): string {
  const img = m.artworkImage
    ? `<img src="${esc(m.artworkImage)}" width="600" alt="${esc(m.artworkTitle ?? "Artwork")}" style="width:100%;max-width:536px;height:auto;display:block;border:1px solid ${STONE_300}" />`
    : "";
  const title = m.artworkTitle
    ? `<div style="font-family:${SERIF};font-style:italic;font-size:20px;color:${STONE_900};padding-top:16px">${esc(m.artworkTitle)}</div>`
    : "";
  const meta = m.artworkMeta
    ? `<div style="font-family:${SANS};font-size:13px;color:${STONE_500};padding-top:6px">${esc(m.artworkMeta)}</div>`
    : "";
  if (!img && !title) return "";
  return `<div style="padding:6px 0 8px">${img}${title}${meta}</div>`;
}
function summaryRow(label: string, value: string, opts?: { strong?: boolean }): string {
  const valStyle = opts?.strong
    ? `font-family:${SANS};font-size:15px;color:${STONE_900};font-weight:600;text-align:right`
    : `font-family:${SANS};font-size:14px;color:${STONE_700};text-align:right`;
  return `<tr>
    <td style="padding:9px 0;border-bottom:1px solid ${STONE_300};font-family:${SANS};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${STONE_500}">${esc(label)}</td>
    <td style="padding:9px 0;border-bottom:1px solid ${STONE_300};${valStyle}">${value}</td>
  </tr>`;
}
function summaryTable(rows: string[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px">${rows.join("")}</table>`;
}
function infoNote(text: string): string {
  return `<div style="background:${CREAM};padding:16px 18px;font-family:${SANS};font-size:14px;line-height:1.65;color:${STONE_700};margin:6px 0 4px">${text}</div>`;
}

/** The one layout: cream canvas, 600px white card, wordmark header, warm footer. */
function layout(preheader: string, inner: string): string {
  const year = 2026;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>Ani Muradyan</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400;1,500&family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  @media only screen and (max-width:620px){
    .card{width:100% !important}
    .pad{padding-left:22px !important;padding-right:22px !important}
    h1{font-size:24px !important}
  }
  body{margin:0;padding:0;background:${CREAM}}
  a{color:${INK}}
</style>
</head>
<body style="margin:0;padding:0;background:${CREAM}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${CREAM}">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM}">
  <tr><td align="center" style="padding:32px 12px">
    <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${PAPER};border:1px solid ${STONE_300}">
      <!-- header -->
      <tr><td class="pad" style="padding:30px 40px 10px;text-align:center;border-bottom:1px solid ${STONE_300}">
        <div style="font-family:${SERIF};font-size:24px;font-weight:600;color:${STONE_900};letter-spacing:0.01em">Ani Muradyan</div>
        <div style="font-family:${SANS};font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:${SAGE};padding-top:6px">Contemporary oil painter · Yerevan</div>
      </td></tr>
      <!-- body -->
      <tr><td class="pad" style="padding:34px 40px 12px">${inner}</td></tr>
      <!-- footer -->
      <tr><td class="pad" style="padding:24px 40px 30px;border-top:1px solid ${STONE_300}">
        <div style="font-family:${SANS};font-size:13px;line-height:1.7;color:${STONE_500}">
          Questions about your order? Simply reply to this email, or write to
          <a href="mailto:${SUPPORT_EMAIL}" style="color:${STONE_700}">${SUPPORT_EMAIL}</a>.
        </div>
        <div style="font-family:${SANS};font-size:12px;line-height:1.7;color:${STONE_400};padding-top:14px">
          Ani Muradyan · Yerevan, Armenia · <a href="${INSTAGRAM}" style="color:${STONE_400}">Instagram</a><br>
          © ${year} Ani Muradyan. All rights reserved.
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── text twin helpers ──
function textFooter(): string {
  return `\n\nQuestions about your order? Reply to this email or write to ${SUPPORT_EMAIL}.\nAni Muradyan · Yerevan, Armenia\n© 2026 Ani Muradyan.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

/** A. Payment confirmed / order confirmation. */
export function buildConfirmationEmail(m: Model): EmailContent {
  const rows = [
    summaryRow("Order", esc(m.reference)),
    m.itemPrice ? summaryRow("Artwork", esc(m.itemPrice)) : "",
    m.hasShipping && m.shipping ? summaryRow("Shipping", esc(m.shipping)) : summaryRow("Shipping", "Included"),
    m.total ? summaryRow("Total paid", esc(m.total), { strong: true }) : "",
    summaryRow("Payment", "Confirmed"),
    m.destination ? summaryRow("Shipping to", esc(m.destination)) : "",
  ].filter(Boolean);

  const dispatch = m.expectedDispatch
    ? infoNote(`I expect to dispatch your painting around <strong>${esc(m.expectedDispatch)}</strong>. You'll get an email with tracking the moment it's on its way.`)
    : infoNote(`Each painting is prepared and crated by hand, so dispatch usually takes a few days. I'll email you with tracking the moment it's on its way — no delivery date is promised until the courier gives me one.`);

  const inner = [
    eyebrow("Payment confirmed"),
    heading(`Thank you, ${m.firstName}.`),
    para(`Your painting is now yours. I'll prepare it with care here in my Yerevan studio, and keep you updated at every step from here to your door.`),
    artworkBlock(m),
    summaryTable(rows),
    `<div style="font-family:${SANS};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${STONE_500};padding:18px 0 8px">What happens next</div>`,
    dispatch,
    para(`You can follow your order at any time using the button below.`),
    button("Track your order", m.trackUrl),
    rule(),
    para(`With warmth,<br><span style="font-family:${SERIF};font-style:italic;font-size:17px;color:${STONE_900}">Ani</span>`),
  ].join("");

  const text =
`Thank you, ${m.firstName}.

Your painting is now yours. I'll prepare it with care here in my Yerevan studio and keep you updated at every step.

Order: ${m.reference}
${m.itemPrice ? `Artwork: ${m.itemPrice}\n` : ""}Shipping: ${m.hasShipping && m.shipping ? m.shipping : "Included"}
${m.total ? `Total paid: ${m.total}\n` : ""}Payment: Confirmed
${m.destination ? `Shipping to: ${m.destination}\n` : ""}
${m.expectedDispatch ? `Expected dispatch: around ${m.expectedDispatch}.` : "Each painting is crated by hand; dispatch usually takes a few days. I'll email tracking the moment it's on its way."}

Track your order: ${m.trackUrl}

With warmth,
Ani${textFooter()}`;

  return { subject: `Thank you for your purchase — order ${m.reference}`, html: layout(`Payment confirmed for order ${m.reference}. Thank you.`, inner), text };
}

/** C. Shipped. */
export function buildShippedEmail(m: Model): EmailContent {
  const rows = [
    summaryRow("Order", esc(m.reference)),
    m.carrier ? summaryRow("Carrier", esc(m.carrier)) : "",
    m.trackingNumber ? summaryRow("Tracking", esc(m.trackingNumber)) : "",
    m.shippedDate ? summaryRow("Shipped", esc(m.shippedDate)) : "",
    m.estimatedDelivery ? summaryRow("Estimated delivery", esc(m.estimatedDelivery)) : "",
  ].filter(Boolean);

  const carrierLink = m.trackingUrl
    ? para(`You can <a href="${esc(m.trackingUrl)}" target="_blank" style="color:${INK}">track it directly with ${esc(m.carrier ?? "the carrier")}</a>, or use your order page below.`)
    : para(`Follow its journey on your order page below.`);

  const inner = [
    eyebrow("On its way"),
    heading(`It's on its way, ${m.firstName}.`),
    para(m.artworkTitle
      ? `<span style="font-family:${SERIF};font-style:italic">${esc(m.artworkTitle)}</span> has left the studio and is now with the courier.`
      : `Your painting has left the studio and is now with the courier.`),
    artworkBlock(m),
    summaryTable(rows),
    carrierLink,
    m.estimatedDelivery ? "" : infoNote(`Delivery times vary by destination and customs. I'll let you know if anything changes — and any import duties are payable to the courier on delivery.`),
    button("Track your order", m.trackUrl),
  ].join("");

  const text =
`It's on its way, ${m.firstName}.

${m.artworkTitle ? `"${m.artworkTitle}" has ` : "Your painting has "}left the studio and is now with the courier.

Order: ${m.reference}
${m.carrier ? `Carrier: ${m.carrier}\n` : ""}${m.trackingNumber ? `Tracking: ${m.trackingNumber}\n` : ""}${m.shippedDate ? `Shipped: ${m.shippedDate}\n` : ""}${m.estimatedDelivery ? `Estimated delivery: ${m.estimatedDelivery}\n` : ""}
Track your order: ${m.trackUrl}${m.trackingUrl ? `\nCarrier tracking: ${m.trackingUrl}` : ""}${textFooter()}`;

  return { subject: `Your artwork is on its way — order ${m.reference}`, html: layout(`Your artwork has shipped — order ${m.reference}.`, inner), text };
}

/** D. Delivery confirmation. */
export function buildDeliveredEmail(m: Model): EmailContent {
  const inner = [
    eyebrow("Delivered"),
    heading(`It has arrived.`),
    para(`${m.firstName}, your painting${m.artworkTitle ? ` — <span style="font-family:${SERIF};font-style:italic">${esc(m.artworkTitle)}</span> —` : ""} has been delivered. I hope it feels right the moment you unwrap it.`),
    artworkBlock(m),
    para(`If anything at all is not as it should be — the piece, the packaging, anything — please just reply to this email and I'll make it right, personally.`),
    para(`Thank you for giving one of my paintings a home. It genuinely means a great deal.`),
    button("View your order", m.trackUrl),
    rule(),
    para(`With gratitude,<br><span style="font-family:${SERIF};font-style:italic;font-size:17px;color:${STONE_900}">Ani</span>`),
  ].join("");

  const text =
`It has arrived.

${m.firstName}, your painting${m.artworkTitle ? ` — "${m.artworkTitle}" —` : ""} has been delivered. I hope it feels right the moment you unwrap it.

If anything is not as it should be, just reply to this email and I'll make it right, personally.

Thank you for giving one of my paintings a home.

View your order: ${m.trackUrl}

With gratitude,
Ani${textFooter()}`;

  return { subject: `Your painting has arrived — order ${m.reference}`, html: layout(`Your painting has been delivered.`, inner), text };
}

/**
 * E. A manual / important update (used for shipping delays and any hand-written note). The body
 * is the message Ani writes; the layout, order line and Track button are added around it.
 */
export function buildUpdateEmail(m: Model, opts: { subject: string; message: string; heading?: string; eyebrow?: string }): EmailContent {
  const paras = opts.message.split(/\n{2,}/).map((p) => para(esc(p).replace(/\n/g, "<br>"))).join("");
  const inner = [
    eyebrow(opts.eyebrow ?? "An update on your order"),
    heading(opts.heading ?? `A note about your order`),
    para(`Hello ${m.firstName},`),
    paras,
    m.artworkTitle ? summaryTable([summaryRow("Order", esc(m.reference)), summaryRow("Artwork", esc(m.artworkTitle))]) : summaryTable([summaryRow("Order", esc(m.reference))]),
    button("Track your order", m.trackUrl),
    rule(),
    para(`With warmth,<br><span style="font-family:${SERIF};font-style:italic;font-size:17px;color:${STONE_900}">Ani</span>`),
  ].join("");

  const text =
`Hello ${m.firstName},

${opts.message}

Order: ${m.reference}${m.artworkTitle ? `\nArtwork: ${m.artworkTitle}` : ""}

Track your order: ${m.trackUrl}

With warmth,
Ani${textFooter()}`;

  return { subject: opts.subject, html: layout(opts.subject, inner), text };
}

/** B. Preparing / in-the-studio update (optional; only meaningful when there's something to say). */
export function buildPreparingEmail(m: Model): EmailContent {
  return buildUpdateEmail(m, {
    subject: `An update on your order ${m.reference}`,
    eyebrow: "In the studio",
    heading: `Your painting is being prepared`,
    message: m.expectedDispatch
      ? `Just a quick note to say your painting is being crated with care. I expect to dispatch it around ${m.expectedDispatch}, and you'll get tracking the moment it's on its way.`
      : `Just a quick note to say your painting is being crated with care in the studio. You'll get an email with tracking the moment it's on its way.`,
  });
}
