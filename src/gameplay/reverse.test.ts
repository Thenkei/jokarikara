import { describe, it, expect } from "vitest";
import { createInitialState } from "../core/gameState";
import type { GameState } from "../types";
import type { Shape } from "../utils/geometry";
import {
  containsPrevious,
  createReverseSeed,
  getArenaRadius,
  getReverseQualityRatio,
  getReverseZoom,
  isEarlyReverseTap,
  isReverseWorld,
  isWithinArena,
  REVERSE_ARENA_RATIO,
  REVERSE_DISPLAY_RATIO,
  REVERSE_SEED_RATIO,
} from "./reverse";

const circle = (size: number): Shape => ({
  type: "circle",
  size,
  rotation: 0,
  color: "#ffffff",
  opacity: 1,
});

const reverseState = (
  lastSize: number,
  activeSize: number,
  overrides: Partial<GameState> = {},
): GameState => {
  const base = createInitialState(1000, "CLASSIC", 1);
  return {
    ...base,
    world: 9,
    zoom: getReverseZoom(base.initialSize, lastSize),
    shapes: [circle(lastSize)],
    activeShape: circle(activeSize),
    activeOffset: { x: 0, y: 0 },
    ...overrides,
  };
};

describe("reverse stacking", () => {
  it("is enabled for world 9 only among the first ten worlds", () => {
    const worlds = Array.from({ length: 10 }, (_, i) => i + 1).filter(
      isReverseWorld,
    );
    expect(worlds).toEqual([9]);
  });

  it("zooms so the last shape keeps a constant on-screen size", () => {
    const initial = 450;
    for (const last of [50, 100, 400]) {
      expect(last * getReverseZoom(initial, last)).toBeCloseTo(
        REVERSE_DISPLAY_RATIO * initial,
        9,
      );
    }
    expect(getReverseZoom(initial, 0)).toBe(1);
  });

  it("keeps the arena at a constant on-screen size", () => {
    const state = reverseState(100, 90);
    expect(getArenaRadius(state) * 2 * state.zoom).toBeCloseTo(
      REVERSE_ARENA_RATIO * state.initialSize,
      9,
    );
  });

  it("detects the arena edge, including gravity drift", () => {
    const state = reverseState(100, 150);
    const radius = getArenaRadius(state);
    expect(isWithinArena(state)).toBe(true);
    expect(
      isWithinArena({ ...state, activeShape: circle(radius * 2 + 4) }),
    ).toBe(false);
    expect(
      isWithinArena({ ...state, activeOffset: { x: 0, y: radius } }),
    ).toBe(false);
  });

  it("requires the growing shape to contain the previous one", () => {
    expect(containsPrevious(reverseState(100, 90))).toBe(false);
    expect(containsPrevious(reverseState(100, 104))).toBe(true);
    // Drift can push the previous shape out of a barely larger shape.
    expect(
      containsPrevious(reverseState(100, 104, { activeOffset: { x: 0, y: 10 } })),
    ).toBe(false);
  });

  it("flags taps before the shape can possibly contain the previous one", () => {
    expect(isEarlyReverseTap(reverseState(100, 80))).toBe(true);
    expect(isEarlyReverseTap(reverseState(100, 101))).toBe(false);
  });

  it("rates a tight wrap as the best ratio", () => {
    expect(getReverseQualityRatio(102, 100)).toBeGreaterThan(0.97);
    expect(getReverseQualityRatio(150, 100)).toBeLessThan(0.7);
    expect(getReverseQualityRatio(0, 100)).toBe(0);
  });

  it("seeds a reverse world with a small central shape", () => {
    const seed = createReverseSeed({ ...circle(450), opacity: 0.3 }, 450);
    expect(seed.size).toBeCloseTo(450 * REVERSE_SEED_RATIO, 9);
    expect(seed.opacity).toBe(1);
  });
});
