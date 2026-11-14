import { describe, it, expect } from "vitest";
import {
  getStackNoteHz,
  getWorldRoot,
  MELODY_SPAN,
  pentatonicSemitones,
  QUALITY_HARMONY,
  semitonesToRatio,
  WORLD_ROOTS_HZ,
} from "./music";

describe("music", () => {
  it("maps semitones to equal-temperament ratios", () => {
    expect(semitonesToRatio(12)).toBeCloseTo(2, 10);
    expect(semitonesToRatio(0)).toBe(1);
  });

  it("walks the major pentatonic scale across octaves", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(pentatonicSemitones)).toEqual([
      0, 2, 4, 7, 9, 12, 14,
    ]);
    expect(pentatonicSemitones(-3)).toBe(0);
  });

  it("gives each world its own key and cycles past the last", () => {
    expect(getWorldRoot(1)).toBe(WORLD_ROOTS_HZ[0]);
    expect(getWorldRoot(2)).not.toBe(getWorldRoot(1));
    expect(getWorldRoot(WORLD_ROOTS_HZ.length + 1)).toBe(WORLD_ROOTS_HZ[0]);
    expect(getWorldRoot(0)).toBe(WORLD_ROOTS_HZ[0]);
  });

  it("raises the stack note with the streak, then wraps", () => {
    const first = getStackNoteHz(1, 1);
    const second = getStackNoteHz(1, 2);
    expect(first).toBe(getWorldRoot(1));
    expect(second).toBeGreaterThan(first);
    expect(getStackNoteHz(1, MELODY_SPAN + 1)).toBe(first);
  });

  it("layers richer harmony for better stack quality", () => {
    expect(QUALITY_HARMONY.OK.length).toBeLessThan(QUALITY_HARMONY.GOOD.length);
    expect(QUALITY_HARMONY.GOOD.length).toBeLessThan(QUALITY_HARMONY.GREAT.length);
    expect(QUALITY_HARMONY.GREAT.length).toBeLessThan(
      QUALITY_HARMONY.PERFECT.length,
    );
  });
});
