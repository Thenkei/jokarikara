import type { EndReason, MissMargin, StackQuality } from "../types";
import type { Translator } from "../i18n";
import { qualitiesFromScoreHistory } from "./daily";
import {
  GREAT_STACK_TIME_BONUS,
  PERFECT_STACK_TIME_BONUS,
} from "../constants/game";
import { isReverseWorld } from "../gameplay/reverse";
import { getMissMarginHeadline, getMissMarginHint } from "./missMargin";
import { perfectRatePercent } from "../progression/stats";

/**
 * Game over explanations: what ended the run and one actionable tip. Pure so
 * copy and rules are testable without rendering; the wording comes from the
 * catalog of the translator passed in.
 */
export interface EndInsight {
  /** How far the final miss was off, e.g. "Late by 0.4 s" (when known). */
  margin?: string;
  /** Reading aid for the margin, e.g. "PERFECT opened 0.4 s before the edge." */
  marginHint?: string;
  title: string;
  tip: string;
  /**
   * "calm" for an end that is not a failure (Zen FINISH RUN, Time Attack's
   * clock running out — its normal ending): the card drops the danger
   * styling. Absent means the run was lost (danger).
   */
  tone?: "calm";
}

/**
 * Insight for a run's end. `margin` (the final miss, see `getMissMargin`)
 * adds the magnitude headline (and hint) and switches the sentence to its
 * margin variant, which drops "Too late:"/"Too early:" (the headline already
 * says it); it is ignored for mode-level ends (clock, lives, finished), where
 * the last miss is not what the card explains. `scoreHistory` (points per
 * stack) feeds the "finished" tip.
 */
export const getEndInsight = (
  i18n: Translator,
  reason: EndReason | null | undefined,
  world: number,
  margin?: MissMargin | null,
  scoreHistory: readonly number[] = [],
): EndInsight | null => {
  if (reason === "finished") return getFinishedInsight(i18n, scoreHistory);
  const withMargin =
    margin != null && (reason === "overflow" || reason === "badTap" || reason === "fracture");
  const insight = getReasonInsight(i18n, reason, world, withMargin);
  if (!insight || !withMargin || !margin) return insight;
  const hint = getMissMarginHint(i18n, margin, isReverseWorld(world));
  return {
    margin: getMissMarginHeadline(i18n, margin),
    ...(hint ? { marginHint: hint } : {}),
    title: insight.title,
    tip: insight.tip,
  };
};

const getReasonInsight = (
  { t }: Translator,
  reason: EndReason | null | undefined,
  world: number,
  withMargin: boolean,
): EndInsight | null => {
  switch (reason) {
    case "overflow":
      return isReverseWorld(world)
        ? {
            title: t("insight.overflowReverse.title"),
            tip: t("insight.overflowReverse.tip"),
          }
        : {
            title: t(withMargin ? "insight.overflow.titleWithMargin" : "insight.overflow.title"),
            tip: t("insight.overflow.tip"),
          };
    case "badTap":
      return isReverseWorld(world)
        ? {
            title: t(
              withMargin
                ? "insight.badTapReverse.titleWithMargin"
                : "insight.badTapReverse.title",
            ),
            tip: t("insight.badTapReverse.tip"),
          }
        : {
            title: t("insight.badTap.title"),
            tip: t("insight.badTap.tip"),
          };
    case "fracture":
      return {
        title: t("insight.fracture.title"),
        tip: t("insight.fracture.tip"),
      };
    case "timeout":
      return {
        title: t("insight.timeout.title"),
        tip: t("insight.timeout.tip", {
          perfect: PERFECT_STACK_TIME_BONUS,
          great: GREAT_STACK_TIME_BONUS,
        }),
        // The clock is how every Time Attack run ends, not a mistake.
        tone: "calm",
      };
    case "lives":
      return {
        title: t("insight.lives.title"),
        tip: t("insight.lives.tip"),
      };
    default:
      return null;
  }
};

/** Perfect rate (%) at or above which a finished session reads "dialled in". */
export const FINISHED_DIALLED_IN_RATE = 50;

/**
 * A Zen session the player chose to end: a calm summary, never a failure
 * reason (and never a margin: no miss ended it). The tip comes from the
 * stacks actually landed this run (`scoreHistory`: a practice run's skipped
 * worlds do not count, and undone stacks are already gone).
 */
export const getFinishedInsight = (
  { t }: Translator,
  scoreHistory: readonly number[],
): EndInsight => {
  const breakdown = getQualityBreakdown(scoreHistory);
  const total = QUALITY_ORDER.reduce((sum, q) => sum + breakdown[q], 0);
  const perfects = breakdown.PERFECT;
  const rate = perfectRatePercent(perfects, total);
  const stacks = t("insight.stacks", { count: total });
  const calm = (tip: string): EndInsight => ({
    tone: "calm",
    title: t("insight.finished.title"),
    tip,
  });

  if (rate === null) return calm(t("insight.finished.empty"));
  if (rate === 100) {
    return calm(
      total === 1
        ? t("insight.finished.onlyPerfect")
        : t("insight.finished.allPerfect", { stacks }),
    );
  }
  if (rate >= FINISHED_DIALLED_IN_RATE) {
    return calm(t("insight.finished.dialledIn", { rate, stacks }));
  }
  if (perfects > 0) {
    return calm(t("insight.finished.somePerfect", { perfects, stacks, rate }));
  }
  if (breakdown.GREAT > 0) {
    return calm(t("insight.finished.great", { great: breakdown.GREAT, stacks }));
  }
  return calm(t("insight.finished.safe"));
};

export type QualityBreakdown = Record<StackQuality, number>;

export const QUALITY_ORDER: readonly StackQuality[] = [
  "PERFECT",
  "GREAT",
  "GOOD",
  "OK",
];

/** Count of each stack quality over a run (from awarded points). */
export const getQualityBreakdown = (
  scoreHistory: readonly number[],
): QualityBreakdown => {
  const counts: QualityBreakdown = { PERFECT: 0, GREAT: 0, GOOD: 0, OK: 0 };
  for (const quality of qualitiesFromScoreHistory(scoreHistory)) {
    counts[quality] += 1;
  }
  return counts;
};
