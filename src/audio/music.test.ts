import { describe, it, expect } from "vitest";
import {
  CUE_MAX_STEP,
  CUE_ROOT_HZ,
  getCueNoteHz,
  getStackNoteHz,
  getTimeUpCadence,
  getWorldRoot,
  TIME_UP_CADENCE,
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

  it("gives the timing cue a slight pentatonic rise and an octave arrival", () => {
    const approach = [0, 1, 2, 3].map((step) => getCueNoteHz(step, false));
    expect(approach[0]).toBe(CUE_ROOT_HZ);
    for (let i = 1; i < approach.length; i += 1) {
      expect(approach[i]).toBeGreaterThan(approach[i - 1]);
    }
    // At most a fifth of rise, and the PERFECT tick clearly above it.
    expect(approach.at(-1)! / CUE_ROOT_HZ).toBeCloseTo(semitonesToRatio(7), 10);
    expect(getCueNoteHz(0, true)).toBe(CUE_ROOT_HZ * 2);
    expect(getCueNoteHz(CUE_MAX_STEP + 5, false)).toBe(approach.at(-1));
    expect(getCueNoteHz(-2, false)).toBe(CUE_ROOT_HZ);
  });

  describe("time-up cadence", () => {
    const MAJOR_THIRD = 4;
    const tiers = [null, "BRONZE", "SILVER", "GOLD"] as const;

    it("resolves neutrally without a medal: no third, so neither major nor minor", () => {
      const plain = getTimeUpCadence(null);
      expect(plain).toBe(TIME_UP_CADENCE.NONE);
      const pitchClasses = plain.chord.map((s) => s % 12);
      expect(pitchClasses).not.toContain(MAJOR_THIRD);
      expect(pitchClasses).not.toContain(3);
      expect(plain.chord[0]).toBe(0);
    });

    it("resolves to a major chord for every medal", () => {
      for (const medal of ["BRONZE", "SILVER", "GOLD"] as const) {
        const { chord } = getTimeUpCadence(medal);
        expect(chord.slice(0, 3)).toEqual([0, MAJOR_THIRD, 7]);
      }
    });

    it("grows with the result: more pickup and chord notes, longer hold, Gold sparkles", () => {
      const cadences = tiers.map(getTimeUpCadence);
      for (let i = 1; i < cadences.length; i += 1) {
        expect(cadences[i].chord.length).toBeGreaterThan(cadences[i - 1].chord.length);
        expect(cadences[i].pickup.length).toBeGreaterThanOrEqual(cadences[i - 1].pickup.length);
        expect(cadences[i].hold).toBeGreaterThan(cadences[i - 1].hold);
      }
      expect(cadences.map((c) => c.sparkle)).toEqual([false, false, false, true]);
    });

    it("never doubles the bell (double octave) or the hum under it", () => {
      for (const medal of tiers) {
        const { chord, pickup } = getTimeUpCadence(medal);
        for (const s of [...chord, ...pickup]) {
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThan(24);
        }
      }
    });
  });
});
