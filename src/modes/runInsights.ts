import type { EndReason, MissMargin, StackQuality } from "../types";
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
 * copy and rules are testable without rendering.
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
 * "Too late: the shape crossed the edge." → "The shape crossed the edge.":
 * once a margin headline says late/early, the sentence must not repeat it.
 */
const TIMING_PREFIX = /^Too (late|early): /;

const withoutTimingPrefix = (title: string): string => {
  const rest = title.replace(TIMING_PREFIX, "");
  return rest === title ? title : rest.charAt(0).toUpperCase() + rest.slice(1);
};

/**
 * Insight for a run's end. `margin` (the final miss, see `getMissMargin`)
 * adds the magnitude headline (and hint) and drops the sentence's own
 * "Too late:"/"Too early:" prefix; it is ignored for mode-level ends (clock,
 * lives, finished), where the last miss is not what the card explains.
 * `scoreHistory` (points per stack) feeds the "finished" tip.
 */
export const getEndInsight = (
  reason: EndReason | null | undefined,
  world: number,
  margin?: MissMargin | null,
  scoreHistory: readonly number[] = [],
): EndInsight | null => {
  if (reason === "finished") return getFinishedInsight(scoreHistory);
  const insight = getReasonInsight(reason, world);
  if (!insight || !margin) return insight;
  if (reason !== "overflow" && reason !== "badTap" && reason !== "fracture") {
    return insight;
  }
  const hint = getMissMarginHint(margin, isReverseWorld(world));
  return {
    margin: getMissMarginHeadline(margin),
    ...(hint ? { marginHint: hint } : {}),
    title: withoutTimingPrefix(insight.title),
    tip: insight.tip,
  };
};

const getReasonInsight = (
  reason: EndReason | null | undefined,
  world: number,
): EndInsight | null => {
  switch (reason) {
    case "overflow":
      return isReverseWorld(world)
        ? {
            title: "Your shape crossed the ring.",
            tip: "Tap as soon as it fully wraps the previous one: tight wraps score PERFECT.",
          }
        : {
            title: "Too late: the shape crossed the edge.",
            tip: "Tap a touch earlier. GREAT (92%+) keeps the run alive and the combo going.",
          };
    case "badTap":
      return isReverseWorld(world)
        ? {
            title: "Too early: it didn't wrap the last shape.",
            tip: "In Reverse Stack, wait until your shape surrounds the previous one completely.",
          }
        : {
            title: "That tap didn't fit.",
            tip: "Every corner of your shape must be inside the one below when you tap.",
          };
    case "fracture":
      return {
        title: "Fracture! A red sector crossed your shape.",
        tip: "Near the edge, tap when the red arcs are clear of your shape's corners.",
      };
    case "timeout":
      return {
        title: "Out of time.",
        tip: `Precision buys time: PERFECT +${PERFECT_STACK_TIME_BONUS} s, GREAT +${GREAT_STACK_TIME_BONUS} s.`,
        // The clock is how every Time Attack run ends, not a mistake.
        tone: "calm",
      };
    case "lives":
      return {
        title: "Out of lives.",
        tip: "Early taps are free in Zen, and UNDO / RESTART never cost a life.",
      };
    default:
      return null;
  }
};

/** Perfect rate (%) at or above which a finished session reads "dialled in". */
export const FINISHED_DIALLED_IN_RATE = 50;

const stacksLabel = (count: number): string =>
  `${count} ${count === 1 ? "stack" : "stacks"}`;

/**
 * A Zen session the player chose to end: a calm summary, never a failure
 * reason (and never a margin: no miss ended it). The tip comes from the
 * stacks actually landed this run (`scoreHistory`: a practice run's skipped
 * worlds do not count, and undone stacks are already gone).
 */
export const getFinishedInsight = (scoreHistory: readonly number[]): EndInsight => {
  const breakdown = getQualityBreakdown(scoreHistory);
  const total = QUALITY_ORDER.reduce((sum, q) => sum + breakdown[q], 0);
  const perfects = breakdown.PERFECT;
  const rate = perfectRatePercent(perfects, total);
  const calm = (tip: string): EndInsight => ({
    tone: "calm",
    title: "Session complete.",
    tip,
  });

  if (rate === null) {
    return calm("Nothing stacked this time. Zen is the place to find your timing, no pressure.");
  }
  if (rate === 100) {
    return calm(
      total === 1
        ? "Your only stack was PERFECT. Flawless timing."
        : `All ${stacksLabel(total)} were PERFECT. Flawless timing.`,
    );
  }
  if (rate >= FINISHED_DIALLED_IN_RATE) {
    return calm(
      `${rate}% PERFECT over ${stacksLabel(total)}: your timing is dialled in. Classic puts it on the line.`,
    );
  }
  if (perfects > 0) {
    return calm(
      `${perfects} PERFECT of ${stacksLabel(total)} (${rate}%). Next session, aim for one more.`,
    );
  }
  if (breakdown.GREAT > 0) {
    return calm(
      `${breakdown.GREAT} of ${stacksLabel(total)} landed GREAT. PERFECT is 97%: wait a touch longer before you tap.`,
    );
  }
  return calm(
    "Every stack landed safely. Let the shape grow closer to the edge before you tap for more points.",
  );
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
