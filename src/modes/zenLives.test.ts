import { describe, expect, it } from "vitest";
import { ZEN_LIFE_REGEN_STACKS, advanceZenRegen, rewindZenRegen } from "./zenLives";

describe("Zen life regeneration", () => {
  it("gives a life back after the clean run, then starts over", () => {
    let step = { lives: 7, progress: 0, regained: false };
    for (let i = 1; i < ZEN_LIFE_REGEN_STACKS; i += 1) {
      step = advanceZenRegen(step.lives, step.progress, 10);
      expect(step).toEqual({ lives: 7, progress: i, regained: false });
    }
    step = advanceZenRegen(step.lives, step.progress, 10);
    expect(step).toEqual({ lives: 8, progress: 0, regained: true });
  });

  it("banks nothing at full lives", () => {
    expect(advanceZenRegen(10, 0, 10)).toEqual({ lives: 10, progress: 0, regained: false });
    expect(advanceZenRegen(10, 9, 10)).toEqual({ lives: 10, progress: 0, regained: false });
  });

  it("never goes past the maximum", () => {
    expect(advanceZenRegen(9, ZEN_LIFE_REGEN_STACKS - 1, 10).lives).toBe(10);
  });

  it("steps back one stack on UNDO, never below 0", () => {
    expect(rewindZenRegen(4)).toBe(3);
    expect(rewindZenRegen(0)).toBe(0);
  });
});
