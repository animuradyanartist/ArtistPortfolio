# Direct artwork sales — how it works, and what it refuses to do

## The one owner action

Add **`STRIPE_SECRET_KEY`** to Replit Secrets, and restart.

Everything else is already built. With no key the site behaves exactly as it does today: the
artwork pages render, marketplace links work, and the commerce routes answer "payment is not
configured" instead of erroring.

### The second secret, and why it cannot be avoided

**`STRIPE_WEBHOOK_SECRET`** is also required before a payment can be *confirmed*.

A webhook signing secret is returned by Stripe **exactly once**, in the response to the call
that creates the endpoint, and is never readable again. The server could create its own
endpoint on boot and keep the secret — but it would have to store it somewhere itself, and a
secret this process writes into its own database is one the owner cannot rotate and anyone
with database access can read. That is worse than asking for it.

So the part that *can* be automated is: once the key exists, `bootstrapWebhookEndpoint()`
creates the endpoint at the right URL with the right events and prints the signing secret to
the server log once, to copy into Secrets. No dashboard hunting, no choosing events.

The alternative — not verifying signatures — would make the webhook a public URL that marks
paintings sold on request. It is not an option.

## What is deliberately conservative

**The shipping table is not a FedEx tariff, and never claims to be.** No carrier account, rate
card or historical invoice existed in either repository when this was built, so
`shared/commerce/tariff.ts` is an internal estimate set deliberately high, labelled
"estimated" wherever it surfaces, and stamped with its own provenance string on every order.
Being wrong high costs a sale. Being wrong low costs the painting *and* the shipping, on a
work that cannot be reprinted.

**Estimates measured on the real catalogue (2026-08-20).** A 79×71cm work crates to 89×81×12,
17.5kg volumetric, and quotes €613 to Germany including the additional-handling surcharge and
a 12% margin. That is on the high side of a real express rate and is meant to be. When a real
invoice exists it replaces `ZONE_TARIFF` and nothing else changes.

**Three of her 53 works refuse to auto-quote.** 119×89, 119×99 and 119×109cm crate past the
330cm length-plus-girth a standard parcel accepts (391cm for the largest). Those show the
price, withhold Buy Now, and offer a shipping-quote contact route. A manual override in Admin
turns any of them into a normal purchase.

## The rules that keep it safe

| | |
|---|---|
| **Server decides money** | The browser sends artwork ids and a country. Prices, shipping and totals come from freshly-read rows via `priceOrder()`. A tampered localStorage changes what you *see*, never what you are *charged*. |
| **One painting, one buyer** | A conditional `UPDATE … WHERE not already held` — Postgres serialises two simultaneous checkouts on the row and the loser gets zero rows. No read-then-write window. |
| **A hold is not a sale** | Reserving never sets `availability = 'sold'`. Only a signed webhook does, and its guard means a replayed delivery updates nothing. |
| **Every hold expires** | 30 minutes, swept every 60s and on boot, and exposed as a route so expiry never depends on this process staying up. |
| **Duplicate webhooks are harmless** | The event id is `INSERT`ed with a unique index *before* any work. The second delivery loses and is acknowledged. |
| **Admin cannot declare a payment** | `paid` and `refunded` are excluded from `ADMIN_SETTABLE` by construction. |
| **Shipping fails closed** | Unknown dimensions, unsupported country, oversized parcel → "Shipping quote required", never a cheap default. |

## Marketplace prices are untouched

`artworks.price` is the Singulart figure. It is not read, written, migrated or used as a
fallback anywhere in this system — a test pins that a work with no `websitePriceMinor` refuses
to sell even though `price` is set. Admin shows the two in separate, labelled sections, and
when direct sale is on the artwork page suppresses the old marketplace price line so a visitor
is never shown two different prices for one painting.

## Her workflow

Open an artwork in Admin → switch on **Sell here** → type a price → save. The panel tells her
what is still missing until it is ready, and previews what shipping to Germany would quote.
Nothing else is per-artwork: no Stripe products, no payment links, no shipping arithmetic.

## Not built, and why

- **Transactional email.** No provider is configured in this repo and adding one needs another
  credential. The order stores buyer email, address and status, so confirmation, owner
  notification and shipped/tracking mails can be turned on later without a schema change.
- **A FedEx rate provider.** The `ShippingRateProvider` seam exists and the registry chooses on
  credentials; the real provider is a new file and one line. Rates are not fabricated.
- **Multi-artwork checkout.** The cart holds several works and prices them; checkout takes one
  at a time so a reservation failure cannot leave a half-held cart. Stated in the cart UI.
- **Print commerce.** Orders carry `item_type` (default `artwork`) so prints add a row type
  rather than a rewrite.

## Schema (all via boot self-heal — nothing to run by hand)

`artworks` gains: `direct_sale_enabled`, `website_price_minor`, `website_currency`,
`shipping_enabled`, `shipping_override_minor`, `shipping_destination_overrides`,
`packed_depth_cm`, `packing_margin_cm`, `fulfilment_notes`, `reserved_until`,
`reserved_by_order_id`.

New tables: `orders`, `stripe_events`. New index: `artworks_reserved_until_idx`.

Every statement is `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`, run on boot in
`server/index.ts` beside the ones that already create `category`, `seo_slug` and `blog_posts`.
No existing column is altered or dropped.
