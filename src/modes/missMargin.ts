import type { MissMargin } from "../types";

/**
 * Player-facing wording for a {@link MissMargin}: the game over headline
 * ("Too late by 4 %"), the short mid-run label next to MISS ("+4 %") and the
 * screen reader text. Pure; strings are cached per display bucket, so a miss
 * never builds a new string for a value already shown.
 */

/** Size misses below 1 % of the target read "by a hair". */
export const HAIR_FRACTION = 0.01;
/** Percentages are capped for display (only reachable via the test bridge). */
export const MAX_MARGIN_PERCENT = 999;

/** Keeps "4 %" on one line. */
const NBSP = " ";
const MINUS = "−";

/** Display bucket of a size miss: whole percent, or null for "by a hair". */
export const getMarginPercent = (fraction: number): number | null => {
  if (!Number.isFinite(fraction) || fraction < HAIR_FRACTION) return null;
  return Math.min(MAX_MARGIN_PERCENT, Math.max(1, Math.round(fraction * 100)));
};

/** Display bucket of a fracture wait: tenths of a second, at least 0.1 s. */
export const getClearTenths = (seconds: number): number =>
  Math.max(1, Math.round(seconds * 10));

const formatTenths = (tenths: number): string =>
  `${Math.floor(tenths / 10)}.${tenths % 10}${NBSP}s`;

type Variant = "headline" | "label";

const cache = new Map<string, string>();

const cached = (key: string, build: () => string): string => {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = build();
  cache.set(key, value);
  return value;
};

const format = (margin: MissMargin, variant: Variant): string => {
  if (margin.kind === "fracture") {
    const tenths = getClearTenths(margin.clearInSec);
    return cached(`${variant}:fracture:${tenths}`, () =>
      variant === "headline"
        ? `Sector clear ${formatTenths(tenths)} later`
        : `WAIT ${formatTenths(tenths)}`,
    );
  }
  const percent = getMarginPercent(margin.fraction);
  const bucket = percent ?? "hair";
  return cached(`${variant}:${margin.kind}:${bucket}`, () => {
    if (variant === "label") {
      if (percent === null) return "BY A HAIR";
      // Sign of the size error: too big (+) or too small (−).
      return `${margin.kind === "late" ? "+" : MINUS}${percent}${NBSP}%`;
    }
    const when = margin.kind === "late" ? "Too late" : "Too early";
    return percent === null
      ? `${when} by a hair`
      : `${when} by ${percent}${NBSP}%`;
  });
};

/** Game over headline, e.g. "Too late by 4 %" or "Too early by a hair". */
export const getMissMarginHeadline = (margin: MissMargin): string =>
  format(margin, "headline");

/** Short label shown next to MISS mid-run, e.g. "+4 %" or "BY A HAIR". */
export const getMissMarginLabel = (margin: MissMargin): string =>
  format(margin, "label");

/** Screen reader text for a miss that did not end the run. */
export const getMissAnnouncement = (margin: MissMargin | null): string =>
  margin ? `Miss. ${getMissMarginHeadline(margin)}` : "Miss";
