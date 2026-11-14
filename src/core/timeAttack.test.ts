import { describe, it, expect } from "vitest";
import {
  createInitialState,
  getTimeBonus,
  handleMiss,
  spawnActiveShape,
  stackActiveShape,
} from "./gameState";
import {
  GREAT_STACK_TIME_BONUS,
  PERFECT_STACK_TIME_BONUS,
  TIME_ATTACK_MISS_PENALTY,
  TIME_ATTACK_START_TIME,
} from "../constants/game";
import type { GameMode, GameState } from "../types";

const fresh = (mode: GameMode = "TIME_ATTACK"): GameState =>
  spawnActiveShape(createInitialState(1000, mode, 11));

const withRatio = (state: GameState, ratio: number): GameState => {
  const last = state.shapes[state.shapes.length - 1];
  return {
    ...state,
    activeShape: { ...state.activeShape!, size: last.size * ratio },
  };
};

describe("Time Attack", () => {
  it("is configured to cost time on a miss and reward GREAT stacks", () => {
    expect(TIME_ATTACK_MISS_PENALTY).toBeGreaterThan(0);
    expect(GREAT_STACK_TIME_BONUS).toBeGreaterThan(0);
    expect(GREAT_STACK_TIME_BONUS).toBeLessThan(PERFECT_STACK_TIME_BONUS);
  });

  it("adds time by stack quality", () => {
    expect(getTimeBonus("PERFECT")).toBe(PERFECT_STACK_TIME_BONUS);
    expect(getTimeBonus("GREAT")).toBe(GREAT_STACK_TIME_BONUS);
    expect(getTimeBonus("GOOD")).toBe(0);
    expect(getTimeBonus("OK")).toBe(0);

    const great = stackActiveShape(withRatio(fresh(), 0.93));
    expect(great.quality).toBe("GREAT");
    expect(great.state.timeRemaining).toBe(
      TIME_ATTACK_START_TIME + GREAT_STACK_TIME_BONUS,
    );
    const ok = stackActiveShape(withRatio(fresh(), 0.5));
    expect(ok.state.timeRemaining).toBe(TIME_ATTACK_START_TIME);
  });

  it("a miss costs time, resets the shape and the combo, but not the run", () => {
    const state = { ...withRatio(fresh(), 1.3), streak: 4 };
    const missed = handleMiss(state);
    expect(missed.isGameOver).toBe(false);
    expect(missed.timeRemaining).toBe(
      TIME_ATTACK_START_TIME - (TIME_ATTACK_MISS_PENALTY ?? 0),
    );
    expect(missed.streak).toBe(0);
    const last = missed.shapes[missed.shapes.length - 1];
    expect(missed.activeShape!.size).toBeCloseTo(last.size * 0.05, 9);
  });

  it("ends the run when a miss drains the clock", () => {
    const missed = handleMiss({ ...withRatio(fresh(), 1.3), timeRemaining: 3 });
    expect(missed.timeRemaining).toBe(0);
    expect(missed.isGameOver).toBe(true);
  });

  it("leaves Classic misses terminal", () => {
    expect(handleMiss(withRatio(fresh("CLASSIC"), 1.3)).isGameOver).toBe(true);
  });
});
