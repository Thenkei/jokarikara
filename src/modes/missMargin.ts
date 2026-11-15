import type { MissMargin } from "../types";

/**
 * Player-facing wording for a {@link MissMargin}: the game over headline
 * ("Late by 0.4 s", "Too late by 4 %"), an optional hint line, the short
 * mid-run label next to MISS ("LATE 0.4 s", "+4 %") and the screen reader
 * text. Pure; strings are cached per display bucket, so a miss never builds a
 * new string for a value already shown.
 */

/** Size misses below 1 % of the target read "by a hair". */
export const HAIR_FRACTION = 0.01;
/** Percentages are capped for display (only reachable via the test bridge). */
export const MAX_MARGIN_PERCENT = 999;
/** Durations are capped for display, in tenths of a second (99.9 s). */
export const MAX_TENTHS = 999;

/** Keeps "4 %" / "0.4 s" on one line. */
const NBSP = " ";
const MINUS = "−";

/** Display bucket of a size miss: whole percent, or null for "by a hair". */
export const getMarginPercent = (fraction: number): number | null => {
  if (!Number.isFinite(fraction) || fraction < HAIR_FRACTION) return null;
  return Math.min(MAX_MARGIN_PERCENT, Math.max(1, Math.round(fraction * 100)));
};

/** Display bucket of a duration: tenths of a second, at least 0.1 s. */
export const getTenths = (seconds: number): number =>
  Number.isFinite(seconds)
    ? Math.min(MAX_TENTHS, Math.max(1, Math.round(seconds * 10)))
    : 1;

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
  switch (margin.kind) {
    case "lateTime": {
      const tenths = getTenths(margin.seconds);
      return cached(`${variant}:lateTime:${tenths}`, () =>
        variant === "headline"
          ? `Late by ${formatTenths(tenths)}`
          : `LATE ${formatTenths(tenths)}`,
      );
    }
    case "fracture": {
      const tenths = getTenths(margin.clearInSec);
      return cached(`${variant}:fracture:${tenths}`, () =>
        variant === "headline"
          ? `Sector clear ${formatTenths(tenths)} later`
          : `WAIT ${formatTenths(tenths)}`,
      );
    }
    case "late":
    case "early": {
      const percent = getMarginPercent(margin.fraction);
      const { kind } = margin;
      return cached(`${variant}:${kind}:${percent ?? "hair"}`, () => {
        if (variant === "label") {
          if (percent === null) return "BY A HAIR";
          // Sign of the size error: too big (+) or too small (−).
          return `${kind === "late" ? "+" : MINUS}${percent}${NBSP}%`;
        }
        const when = kind === "late" ? "Too late" : "Too early";
        return percent === null
          ? `${when} by a hair`
          : `${when} by ${percent}${NBSP}%`;
      });
    }
  }
};

/** Game over headline, e.g. "Late by 0.4 s" or "Too early by 3 %". */
export const getMissMarginHeadline = (margin: MissMargin): string =>
  format(margin, "headline");

/** Short label shown next to MISS mid-run, e.g. "LATE 0.4 s" or "+4 %". */
export const getMissMarginLabel = (margin: MissMargin): string =>
  format(margin, "label");

/**
 * One-line hint under the headline, when it helps reading the number:
 * an untapped overflow says when PERFECT opened ("PERFECT opened 0.4 s
 * before the edge", "the ring" in Reverse Stack).
 */
export const getMissMarginHint = (
  margin: MissMargin,
  reverse: boolean,
): string | null => {
  if (margin.kind !== "lateTime") return null;
  const tenths = getTenths(margin.seconds);
  const limit = reverse ? "ring" : "edge";
  return cached(`hint:lateTime:${limit}:${tenths}`, () =>
    `PERFECT opened ${formatTenths(tenths)} before the ${limit}.`,
  );
};

/** Screen reader text for a miss that did not end the run. */
export const getMissAnnouncement = (margin: MissMargin | null): string =>
  margin ? `Miss. ${getMissMarginHeadline(margin)}` : "Miss";
