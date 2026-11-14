import type { GameState } from "../types";
import { STYLE_QUALITY_THRESHOLDS } from "../constants/game";
import { isReverseWorld } from "./reverse";

/**
 * PERFECT-zone guide: a teaching aid. Always on in Zen (practice mode), and
 * only during the very first level elsewhere so it never props up a
 * competitive score beyond the tutorial.
 */
export const shouldShowPerfectGuide = (state: GameState): boolean => {
  if (state.isGameOver || !state.activeShape) return false;
  if (state.shapes.length === 0) return false;
  if (state.mode === "ZEN") return true;
  return state.world === 1 && state.level === 1;
};

export interface PerfectGuide {
  /** Active-shape size (world units) at which a stack scores PERFECT. */
  perfectSize: number;
  /** True once the active shape has reached the PERFECT band. */
  inPerfectBand: boolean;
}

export const getPerfectGuide = (state: GameState): PerfectGuide | null => {
  if (!shouldShowPerfectGuide(state) || !state.activeShape) return null;
  const last = state.shapes[state.shapes.length - 1];
  const ratio = STYLE_QUALITY_THRESHOLDS.perfectMinRatio;
  const size = state.activeShape.size;

  if (isReverseWorld(state.world)) {
    // Outward: PERFECT means hugging the previous shape, i.e. a *maximum*
    // size of last / ratio once it is large enough to contain it.
    const perfectSize = last.size / ratio;
    return {
      perfectSize,
      inPerfectBand: size >= last.size && size <= perfectSize,
    };
  }

  const perfectSize = last.size * ratio;
  return { perfectSize, inPerfectBand: size >= perfectSize };
};
