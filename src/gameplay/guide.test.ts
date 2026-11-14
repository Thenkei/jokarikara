import { describe, it, expect } from "vitest";
import { createInitialState, spawnActiveShape } from "../core/gameState";
import { getPerfectGuide, shouldShowPerfectGuide } from "./guide";
import { STYLE_QUALITY_THRESHOLDS } from "../constants/game";
import type { GameMode, GameState } from "../types";

const fresh = (mode: GameMode): GameState =>
  spawnActiveShape(createInitialState(1000, mode, 424242));

describe("perfect guide", () => {
  it("is always shown in Zen", () => {
    expect(shouldShowPerfectGuide({ ...fresh("ZEN"), world: 4, level: 3 })).toBe(true);
  });

  it("is a first-level tutorial only in competitive modes", () => {
    for (const mode of ["CLASSIC", "TIME_ATTACK"] as const) {
      expect(shouldShowPerfectGuide(fresh(mode))).toBe(true);
      expect(shouldShowPerfectGuide({ ...fresh(mode), level: 2 })).toBe(false);
      expect(shouldShowPerfectGuide({ ...fresh(mode), world: 2 })).toBe(false);
    }
  });

  it("is hidden after game over or without an active shape", () => {
    expect(shouldShowPerfectGuide({ ...fresh("ZEN"), isGameOver: true })).toBe(false);
    expect(shouldShowPerfectGuide({ ...fresh("ZEN"), activeShape: null })).toBe(false);
  });

  it("sizes the ghost at the PERFECT threshold and flags the band", () => {
    const state = fresh("ZEN");
    const container = state.shapes[state.shapes.length - 1];
    const guide = getPerfectGuide(state);
    expect(guide?.perfectSize).toBeCloseTo(
      container.size * STYLE_QUALITY_THRESHOLDS.perfectMinRatio,
      10,
    );
    expect(guide?.inPerfectBand).toBe(false);

    const inBand = {
      ...state,
      activeShape: { ...state.activeShape!, size: container.size * 0.98 },
    };
    expect(getPerfectGuide(inBand)?.inPerfectBand).toBe(true);
  });
});
