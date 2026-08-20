/**
 * DIRECT WEBSITE SALE — the Admin controls, kept visibly apart from the marketplace fields.
 *
 * The separation is the point, not decoration. "Price ($)" further up this form is the
 * SINGULART figure; the price below is what she charges on her own site. They are different
 * numbers for different channels — 19 of her 54 rows carry a marketplace price of 0 because
 * the work was never listed there — and a change to one must never move the other. So this
 * block is fenced, titled, and says out loud which number it is not.
 *
 * Prices are typed in whole currency units, the way she thinks about them, and stored in
 * minor units, the way Stripe charges them. The conversion happens at this boundary and
 * nowhere else.
 */
import { useEffect, useMemo, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUPPORTED_CURRENCIES, parseMajorToMinor, minorToMajorString, type Currency } from "@shared/commerce/money";
import { purchasability, REASON_LABEL } from "@shared/commerce/purchasable";
import { estimateShipping } from "@shared/commerce/shipping";
import { formatMoney } from "@shared/commerce/money";

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  /** Needed for the live shipping preview — the estimator reads the artwork's own size. */
  dimensions: string;
  availability: string;
  /** Which work is loaded. Only used to re-seed the text fields when she opens a different
   *  artwork — not part of the form's own shape, which react-hook-form would reject. */
  artworkId: number;
}

export function ArtworkCommerceFields({ form, dimensions, availability, artworkId }: Props) {
  const v = form.watch();
  const directSaleEnabled: boolean = v.directSaleEnabled ?? false;
  const currency: Currency = (v.websiteCurrency as Currency) ?? "EUR";

  // Major-unit text the field actually shows, kept in local state so a half-typed "24" does
  // not round-trip through minor units and fight the person typing it.
  const [priceText, setPriceText] = useState("");
  const [overrideText, setOverrideText] = useState("");
  useEffect(() => {
    const p = form.getValues("websitePriceMinor");
    setPriceText(typeof p === "number" && p > 0 ? minorToMajorString(p, currency) : "");
    const o = form.getValues("shippingOverrideMinor");
    setOverrideText(typeof o === "number" && o > 0 ? minorToMajorString(o, currency) : "");
    // Only when the loaded artwork changes; typing must not be overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artworkId]);

  const status = useMemo(() => purchasability({
    id: 0,
    availability,
    hasCommitment: v.hasCommitment ?? false,
    commitmentUntil: v.commitmentUntil ?? null,
    directSaleEnabled,
    websitePriceMinor: v.websitePriceMinor ?? null,
    websiteCurrency: v.websiteCurrency ?? null,
    shippingEnabled: v.shippingEnabled !== false,
    reservedUntil: null,
  }), [availability, directSaleEnabled, v.websitePriceMinor, v.websiteCurrency, v.shippingEnabled,
       v.hasCommitment, v.commitmentUntil]);

  // What a buyer in Germany would be quoted, computed here from the same shared estimator the
  // website uses — so she can see a wrong crate depth before a customer does.
  const preview = useMemo(() => estimateShipping({
    id: 0, title: "", dimensions,
    shippingEnabled: v.shippingEnabled !== false,
    shippingOverrideMinor: v.shippingOverrideMinor ?? null,
    shippingDestinationOverrides: null,
    packedDepthCm: v.packedDepthCm ?? null,
    packingMarginCm: v.packingMarginCm ?? null,
  }, "DE"), [dimensions, v.shippingEnabled, v.shippingOverrideMinor, v.packedDepthCm, v.packingMarginCm]);

  const setMinor = (field: string, text: string) => {
    const t = text.trim();
    form.setValue(field, t === "" ? null : parseMajorToMinor(t, currency), { shouldDirty: true });
  };

  const numOrNull = (t: string) => {
    const n = Number.parseInt(t, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  return (
    <div className="border border-stone-300 rounded-lg p-5 bg-stone-50/60 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-charcoal">Direct website sale</h3>
          <p className="text-sm text-stone-600 mt-1 max-w-prose">
            Sold from this website, paid by card. This is <strong>separate from the marketplace
            price</strong> above — changing one never changes the other.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 pt-1">
          <Label htmlFor="directSaleEnabled" className="text-sm">Sell here</Label>
          <Switch
            id="directSaleEnabled"
            checked={directSaleEnabled}
            onCheckedChange={(c) => form.setValue("directSaleEnabled", c, { shouldDirty: true })}
          />
        </div>
      </div>

      {/* Says what is still missing rather than leaving her to work it out from a silent page. */}
      <div className={`text-sm rounded-md px-3 py-2 ${status.purchasable ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
        {status.purchasable
          ? "Ready — this work can be bought from the website."
          : <>Not yet buyable: {status.reasons.map((r) => REASON_LABEL[r]).join(" · ")}</>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Label htmlFor="websitePrice">Website price</Label>
          <Input
            id="websitePrice" inputMode="decimal" placeholder="2400"
            value={priceText}
            onChange={(e) => { setPriceText(e.target.value); setMinor("websitePriceMinor", e.target.value); }}
          />
          <p className="text-xs text-stone-500 mt-1">
            Whole units, e.g. 2400 or 2400.50. Not the marketplace price.
          </p>
        </div>
        <div>
          <Label htmlFor="websiteCurrency">Currency</Label>
          <Select value={currency} onValueChange={(c) => form.setValue("websiteCurrency", c, { shouldDirty: true })}>
            <SelectTrigger id="websiteCurrency"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SUPPORTED_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border-t border-stone-200 pt-4 space-y-4">
        <div className="flex items-center gap-3">
          <Switch
            id="shippingEnabled"
            checked={v.shippingEnabled !== false}
            onCheckedChange={(c) => form.setValue("shippingEnabled", c, { shouldDirty: true })}
          />
          <Label htmlFor="shippingEnabled" className="text-sm">Can be shipped</Label>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="packedDepthCm">Packed depth (cm)</Label>
            <Input id="packedDepthCm" inputMode="numeric" placeholder="12"
              defaultValue={v.packedDepthCm ?? ""}
              onChange={(e) => form.setValue("packedDepthCm", numOrNull(e.target.value), { shouldDirty: true })} />
            <p className="text-xs text-stone-500 mt-1">Blank = 12cm default</p>
          </div>
          <div>
            <Label htmlFor="packingMarginCm">Packing margin (cm)</Label>
            <Input id="packingMarginCm" inputMode="numeric" placeholder="10"
              defaultValue={v.packingMarginCm ?? ""}
              onChange={(e) => form.setValue("packingMarginCm", numOrNull(e.target.value), { shouldDirty: true })} />
            <p className="text-xs text-stone-500 mt-1">Added to width and height</p>
          </div>
          <div>
            <Label htmlFor="shippingOverride">Flat shipping override</Label>
            <Input id="shippingOverride" inputMode="decimal" placeholder="—"
              value={overrideText}
              onChange={(e) => { setOverrideText(e.target.value); setMinor("shippingOverrideMinor", e.target.value); }} />
            <p className="text-xs text-stone-500 mt-1">Blank = use the estimate</p>
          </div>
        </div>

        <div>
          <Label htmlFor="destOverrides">Per-country shipping overrides</Label>
          <Input id="destOverrides" placeholder='{"DE": 190, "US": 260}'
            defaultValue={majorJson(v.shippingDestinationOverrides, currency)}
            onChange={(e) => form.setValue("shippingDestinationOverrides", minorJson(e.target.value, currency), { shouldDirty: true })} />
          <p className="text-xs text-stone-500 mt-1">
            Whole units per country code. Beats the flat override. Leave blank if unsure.
          </p>
        </div>

        {/* The same estimator the website runs, so a bad crate depth shows up here first. */}
        <div className="text-sm rounded-md bg-white border border-stone-200 px-3 py-2">
          <span className="text-stone-500">Shipping to Germany would be quoted as </span>
          {preview.ok
            ? <>
                <strong>{formatMoney(preview.amountMinor, currency)}</strong>
                {preview.estimated && preview.breakdown
                  ? <span className="text-stone-500"> — estimated, {preview.breakdown.chargeableWeightKg}kg volumetric
                      {preview.parcel ? ` (${preview.parcel.packedWidthCm}×${preview.parcel.packedHeightCm}×${preview.parcel.packedDepthCm}cm)` : ""}</span>
                  : <span className="text-stone-500"> — your manual figure</span>}
              </>
            : <strong className="text-amber-700">a manual quote — {preview.detail}</strong>}
        </div>

        {/* PROMISED, BUT NOT SOLD. Same names and meaning as the commercial workflow in the
            other portfolio project, so the two can be reconciled without translation. */}
        <div className="border-t border-stone-200 pt-4">
          <div className="flex items-center gap-3 mb-3">
            <Switch id="hasCommitment" checked={v.hasCommitment === true}
              onCheckedChange={(c) => form.setValue("hasCommitment", c, { shouldDirty: true })} />
            <Label htmlFor="hasCommitment" className="text-sm">Promised to a gallery or collector</Label>
          </div>
          {v.hasCommitment === true && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="commitmentType">Promised to</Label>
                <Input id="commitmentType" placeholder="gallery" defaultValue={v.commitmentType ?? ""}
                  onChange={(e) => form.setValue("commitmentType", e.target.value || null, { shouldDirty: true })} />
              </div>
              <div>
                <Label htmlFor="commitmentDetails">Details</Label>
                <Input id="commitmentDetails" placeholder="Autumn show, Yerevan" defaultValue={v.commitmentDetails ?? ""}
                  onChange={(e) => form.setValue("commitmentDetails", e.target.value || null, { shouldDirty: true })} />
              </div>
              <div>
                <Label htmlFor="commitmentUntil">Until</Label>
                <Input id="commitmentUntil" type="date" defaultValue={v.commitmentUntil ?? ""}
                  onChange={(e) => form.setValue("commitmentUntil", e.target.value || null, { shouldDirty: true })} />
                <p className="text-xs text-stone-500 mt-1">Blank = open-ended, keeps blocking</p>
              </div>
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="fulfilmentNotes">Packing notes</Label>
          <Input id="fulfilmentNotes" placeholder="Ships unstretched, rolled in a tube"
            defaultValue={v.fulfilmentNotes ?? ""}
            onChange={(e) => form.setValue("fulfilmentNotes", e.target.value || null, { shouldDirty: true })} />
        </div>
      </div>
    </div>
  );
}

/** Stored minor units → the whole-unit JSON she reads and types. */
function majorJson(raw: unknown, currency: Currency): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) out[k] = minorToMajorString(v, currency);
    return JSON.stringify(out).replace(/"(\d+\.\d\d)"/g, "$1");
  } catch { return ""; }
}

/** Whole units → minor. Anything unparseable becomes null rather than a wrong number. */
function minorJson(text: string, currency: Currency): string | null {
  const t = text.trim();
  if (!t) return null;
  try {
    const parsed = JSON.parse(t) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const minor = parseMajorToMinor(String(v), currency);
      if (/^[A-Za-z]{2}$/.test(k) && minor && minor > 0) out[k.toUpperCase()] = minor;
    }
    return Object.keys(out).length ? JSON.stringify(out) : null;
  } catch { return null; }
}
