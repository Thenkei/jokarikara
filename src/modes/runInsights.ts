import type { EndReason, StackQuality } from "../types";
import { qualitiesFromScoreHistory } from "./daily";
import {
  GREAT_STACK_TIME_BONUS,
  PERFECT_STACK_TIME_BONUS,
} from "../constants/game";
import { isReverseWorld } from "../gameplay/reverse";

/**
 * Game over explanations: what ended the run and one actionable tip. Pure so
 * copy and rules are testable without rendering.
 */
export interface EndInsight {
  title: string;
  tip: string;
}

export const getEndInsight = (
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
