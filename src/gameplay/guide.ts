import type { GameState } from "../types";
import { STYLE_QUALITY_THRESHOLDS } from "../constants/game";

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
  const container = state.shapes[state.shapes.length - 1];
  const perfectSize = container.size * STYLE_QUALITY_THRESHOLDS.perfectMinRatio;
  return {
    perfectSize,
    inPerfectBand: state.activeShape.size >= perfectSize,
  };
};
