/**
 * SIZE — a single accessible native <select> (never a row of size buttons). Closed state shows the
 * chosen size or "Select a size"; each option is "{name} ({cm}) — {retail price}". Options are passed
 * in already filtered by the selected Material and to enabled+eligible+offered variants. Nothing
 * internal (SKU, Prodigi cost, margin, pixels, wrap, stock name) is shown.
 */

import { sizeOptionLabel, type SizeOption } from "@/lib/printSelector";

export interface SizeSelectProps {
  sizes: SizeOption[];
  /** Selected size key (SizeOption.sizeLabel), or null when nothing is chosen. */
  value: string | null;
  onChange: (sizeLabel: string | null) => void;
  id?: string;
}

export function SizeSelect({ sizes, value, onChange, id = "print-size" }: SizeSelectProps) {
  return (
    <select
      id={id}
      aria-label="Size"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400"
    >
      <option value="">Select a size</option>
      {sizes.map((s) => (
        <option key={s.sizeLabel} value={s.sizeLabel}>
          {sizeOptionLabel(s)}
        </option>
      ))}
    </select>
  );
}
