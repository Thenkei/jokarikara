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
  /** Size at which the growing shape enters the PERFECT band. */
  bandEntrySize: number;
  /**
   * Size past which a stack is no longer PERFECT. Infinity in regular worlds,
   * where the container itself (an overflow miss) ends the band.
   */
  bandExitSize: number;
}

/**
 * Size at which a growing shape on top of `lastSize` enters the PERFECT band:
 * the container × the PERFECT ratio in regular worlds, the previous shape's
 * size in Reverse Stack (wrapping it). Allocation-free, for the frame loop.
 */
export const getPerfectBandEntrySize = (world: number, lastSize: number): number =>
  isReverseWorld(world)
    ? lastSize
    : lastSize * STYLE_QUALITY_THRESHOLDS.perfectMinRatio;

/**
 * PERFECT target for the current active shape, regardless of whether the
 * ghost guide is shown. Shared by the ghost guide and the audio timing cue
 * so both always agree on where PERFECT is.
 */
export const getPerfectTarget = (state: GameState): PerfectGuide | null => {
  if (state.isGameOver || !state.activeShape) return null;
  const last = state.shapes[state.shapes.length - 1];
  if (!last) return null;
  const ratio = STYLE_QUALITY_THRESHOLDS.perfectMinRatio;
  const size = state.activeShape.size;

  if (isReverseWorld(state.world)) {
    // Outward: PERFECT means hugging the previous shape, i.e. a *maximum*
    // size of last / ratio once it is large enough to contain it.
    const perfectSize = last.size / ratio;
    const bandEntrySize = getPerfectBandEntrySize(state.world, last.size);
    return {
      perfectSize,
      inPerfectBand: size >= bandEntrySize && size <= perfectSize,
      bandEntrySize,
      bandExitSize: perfectSize,
    };
  }

  const perfectSize = getPerfectBandEntrySize(state.world, last.size);
  return {
    perfectSize,
    inPerfectBand: size >= perfectSize,
    bandEntrySize: perfectSize,
    bandExitSize: Number.POSITIVE_INFINITY,
  };
};

export const getPerfectGuide = (state: GameState): PerfectGuide | null =>
  shouldShowPerfectGuide(state) ? getPerfectTarget(state) : null;
