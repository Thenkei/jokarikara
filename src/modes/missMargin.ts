import type { MissMargin } from "../types";
import type { Translator } from "../i18n";

/**
 * Player-facing wording for a {@link MissMargin}: the game over headline
 * ("Late by 0.4 s", "Too late by 4 %"), an optional hint line, the short
 * mid-run label next to MISS ("LATE 0.4 s", "+4 %") and the screen reader
 * text. Pure; strings are cached per language and display bucket, so a miss
 * never builds a new string for a value already shown.
 */

/** Size misses below 1 % of the target read "by a hair". */
export const HAIR_FRACTION = 0.01;
/** Percentages are capped for display (only reachable via the test bridge). */
export const MAX_MARGIN_PERCENT = 999;
/** Durations are capped for display, in tenths of a second (99.9 s). */
export const MAX_TENTHS = 999;

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

/** "0.4 s" / "0,4 s": the catalog's unit keeps number and unit on one line. */
const formatTenths = (i18n: Translator, tenths: number): string =>
  i18n.t("unit.seconds", {
    value: i18n.number(tenths / 10, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  });

const formatPercent = (i18n: Translator, percent: number): string =>
  i18n.t("unit.percent", { value: i18n.number(percent) });

type Variant = "headline" | "label";

const cache = new Map<string, string>();

const cached = (key: string, build: () => string): string => {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = build();
  cache.set(key, value);
  return value;
};

const format = (i18n: Translator, margin: MissMargin, variant: Variant): string => {
  // Keyed by language too: switching it must never serve the old wording.
  const prefix = `${i18n.locale}:${variant}`;
  switch (margin.kind) {
    case "lateTime": {
      const tenths = getTenths(margin.seconds);
      return cached(`${prefix}:lateTime:${tenths}`, () => {
        const seconds = formatTenths(i18n, tenths);
        return variant === "headline"
          ? i18n.t("margin.lateTime", { seconds })
          : i18n.t("margin.lateTimeLabel", { seconds });
      });
    }
    case "fracture": {
      const tenths = getTenths(margin.clearInSec);
      return cached(`${prefix}:fracture:${tenths}`, () => {
        const seconds = formatTenths(i18n, tenths);
        return variant === "headline"
          ? i18n.t("margin.fracture", { seconds })
          : i18n.t("margin.fractureLabel", { seconds });
      });
    }
    case "late":
    case "early": {
      const percent = getMarginPercent(margin.fraction);
      const { kind } = margin;
      return cached(`${prefix}:${kind}:${percent ?? "hair"}`, () => {
        if (variant === "label") {
          if (percent === null) return i18n.t("margin.hairLabel");
          // Sign of the size error: too big (+) or too small (−).
          return `${kind === "late" ? "+" : MINUS}${formatPercent(i18n, percent)}`;
        }
        if (percent === null) {
          return i18n.t(kind === "late" ? "margin.lateHair" : "margin.earlyHair");
        }
        return i18n.t(kind === "late" ? "margin.late" : "margin.early", {
          percent: formatPercent(i18n, percent),
        });
      });
    }
  }
};

/** Game over headline, e.g. "Late by 0.4 s" or "Too early by 3 %". */
export const getMissMarginHeadline = (i18n: Translator, margin: MissMargin): string =>
  format(i18n, margin, "headline");

/** Short label shown next to MISS mid-run, e.g. "LATE 0.4 s" or "+4 %". */
export const getMissMarginLabel = (i18n: Translator, margin: MissMargin): string =>
  format(i18n, margin, "label");

/**
 * One-line hint under the headline, when it helps reading the number:
 * an untapped overflow says when PERFECT opened ("PERFECT opened 0.4 s
 * before the edge", "the ring" in Reverse Stack).
 */
export const getMissMarginHint = (
  i18n: Translator,
  margin: MissMargin,
  reverse: boolean,
): string | null => {
  if (margin.kind !== "lateTime") return null;
  const tenths = getTenths(margin.seconds);
  const limit = reverse ? "ring" : "edge";
  return cached(`${i18n.locale}:hint:lateTime:${limit}:${tenths}`, () =>
    i18n.t(reverse ? "margin.hintRing" : "margin.hintEdge", {
      seconds: formatTenths(i18n, tenths),
    }),
  );
};

/** Screen reader text for a miss that did not end the run. */
export const getMissAnnouncement = (i18n: Translator, margin: MissMargin | null): string =>
  margin
    ? i18n.t("announce.missMargin", { margin: getMissMarginHeadline(i18n, margin) })
    : i18n.t("announce.miss");
