/**
 * PRINT ELIGIBILITY — the rule that decides whether a master photograph may be sold at a print size.
 *
 * ASPECT-RATIO PRESERVING. A print's physical size is derived from the master's OWN ratio, so a
 * size is never a fixed 30×40 that would crop or stretch the image. The long edge is set to the
 * ladder target; the short edge follows the master. Nothing here upscales, silently crops, or
 * stretches — those are refused at the source.
 *
 * EFFECTIVE DPI = pixels along the long edge ÷ the long edge in inches. A size is eligible only if
 * that meets the quality floor. The floor is CONFIGURABLE and defaults to a premium-leaning value
 * (not the bare 150 minimum) — the final production floor is decided once real masters and the real
 * Prodigi product requirements are in hand.
 *
 * Pure, dependency-free, unit-tested. Server (variant generation, admin) and any preview UI share it.
 */

export interface MasterImage {
  widthPx: number;
  heightPx: number;
}

export type Orientation = "portrait" | "landscape" | "square";

export interface DpiPolicy {
  /** The quality we want. At or above this a variant is "premium". */
  preferredDpi: number;
  /** The hard floor. Below this a variant is refused. Configurable on purpose. */
  minimumDpi: number;
}

/** Premium-leaning default. 150 is the bare technical minimum; we hold a higher line by default. */
export const DEFAULT_DPI_POLICY: DpiPolicy = { preferredDpi: 300, minimumDpi: 180 };

export interface SizeTarget {
  label: string;
  /** The long edge of the print, in cm. The short edge is derived from the master's ratio. */
  longEdgeCm: number;
}

/** S / M / L by long edge. Physical short edge is per-artwork so nothing is distorted. */
export const DEFAULT_SIZE_LADDER: SizeTarget[] = [
  { label: "S", longEdgeCm: 40 },
  { label: "M", longEdgeCm: 70 },
  { label: "L", longEdgeCm: 100 },
];

const CM_PER_INCH = 2.54;

export interface VariantEligibility {
  label: string;
  /** Physical size preserving the master's exact aspect ratio; long edge = the ladder target. */
  widthCm: number;
  heightCm: number;
  effectiveDpi: number;
  eligible: boolean;
  /** True when the variant reaches the preferred DPI, not merely the floor. */
  meetsPreferred: boolean;
  /** Human reason when not eligible; null when eligible. */
  reason: string | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function aspectRatio(m: MasterImage): number {
  return m.widthPx / m.heightPx;
}

export function orientationOf(m: MasterImage): Orientation {
  if (m.widthPx > m.heightPx) return "landscape";
  if (m.heightPx > m.widthPx) return "portrait";
  return "square";
}

/** Physical print size (cm) at the master's exact ratio, with the long edge set to `longEdgeCm`. */
export function physicalSize(m: MasterImage, longEdgeCm: number): { widthCm: number; heightCm: number } {
  const ratio = aspectRatio(m); // width / height
  if (m.widthPx >= m.heightPx) {
    // landscape or square: the long edge is the width
    return { widthCm: round1(longEdgeCm), heightCm: round1(longEdgeCm / ratio) };
  }
  // portrait: the long edge is the height
  return { widthCm: round1(longEdgeCm * ratio), heightCm: round1(longEdgeCm) };
}

/** Effective DPI if this master is printed with its long edge at `longEdgeCm`. Floors to an int. */
export function effectiveDpi(m: MasterImage, longEdgeCm: number): number {
  const longEdgePx = Math.max(m.widthPx, m.heightPx);
  const longEdgeInch = longEdgeCm / CM_PER_INCH;
  return Math.floor(longEdgePx / longEdgeInch);
}

export function evaluateVariant(
  m: MasterImage,
  target: SizeTarget,
  policy: DpiPolicy = DEFAULT_DPI_POLICY,
): VariantEligibility {
  const { widthCm, heightCm } = physicalSize(m, target.longEdgeCm);
  const dpi = effectiveDpi(m, target.longEdgeCm);
  const eligible = dpi >= policy.minimumDpi;
  const meetsPreferred = dpi >= policy.preferredDpi;
  return {
    label: target.label,
    widthCm,
    heightCm,
    effectiveDpi: dpi,
    eligible,
    meetsPreferred,
    reason: eligible
      ? null
      : `Effective ${dpi} DPI at ${target.label} (${widthCm}×${heightCm} cm) is below the ${policy.minimumDpi} DPI floor — a higher-resolution master is required for this size.`,
  };
}

/** Evaluate every size in the ladder against a master. */
export function evaluateMaster(
  m: MasterImage,
  ladder: SizeTarget[] = DEFAULT_SIZE_LADDER,
  policy: DpiPolicy = DEFAULT_DPI_POLICY,
): VariantEligibility[] {
  return ladder.map((t) => evaluateVariant(m, t, policy));
}

/** The largest long-edge (cm) this master can reach at a given DPI. Never upscales. */
export function maxLongEdgeCm(m: MasterImage, dpi: number): number {
  const longEdgePx = Math.max(m.widthPx, m.heightPx);
  return round1((longEdgePx / dpi) * CM_PER_INCH);
}

/** True if a master can support at least the smallest ladder size at the floor. */
export function isPrintable(
  m: MasterImage,
  ladder: SizeTarget[] = DEFAULT_SIZE_LADDER,
  policy: DpiPolicy = DEFAULT_DPI_POLICY,
): boolean {
  return evaluateMaster(m, ladder, policy).some((v) => v.eligible);
}
