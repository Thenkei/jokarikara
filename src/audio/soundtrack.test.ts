import { describe, it, expect } from "vitest";
import { PENTATONIC } from "./music";
import {
  ARPEGGIO_DENSITY,
  ARPEGGIO_LAYER_THRESHOLD,
  ARPEGGIO_STEPS,
  chooseArpeggioNote,
  getLayerTargets,
  getMusicIntensity,
  getPulseNote,
  getStepSeconds,
  LAYER_LEVELS,
  MUSIC_TEMPO_BPM,
  MUSIC_VOLUME,
  PULSE_LAYER_THRESHOLD,
  resyncStepTime,
  SCHEDULE_AHEAD_SECONDS,
  SCHEDULER_INTERVAL_MS,
  STEPS_PER_BAR,
} from "./soundtrack";

describe("soundtrack", () => {
  describe("getMusicIntensity", () => {
    it("adds layers as the combo streak grows", () => {
      const at = (streak: number) =>
        getMusicIntensity({ mode: "CLASSIC", streak, zenCleanStacks: 0 });
      expect(at(0)).toBe(0);
      expect(at(PULSE_LAYER_THRESHOLD - 1)).toBe(0);
      expect(at(PULSE_LAYER_THRESHOLD)).toBe(1);
      expect(at(ARPEGGIO_LAYER_THRESHOLD - 1)).toBe(1);
      expect(at(ARPEGGIO_LAYER_THRESHOLD)).toBe(2);
      expect(at(50)).toBe(2);
    });

    it("uses the streak in Time Attack too", () => {
      expect(
        getMusicIntensity({ mode: "TIME_ATTACK", streak: 3, zenCleanStacks: 0 }),
      ).toBe(1);
    });

    it("follows clean stacks in Zen, where there is no streak", () => {
      expect(getMusicIntensity({ mode: "ZEN", streak: 0, zenCleanStacks: 3 })).toBe(1);
      expect(getMusicIntensity({ mode: "ZEN", streak: 0, zenCleanStacks: 6 })).toBe(2);
      // A stale streak value must not leak into Zen.
      expect(getMusicIntensity({ mode: "ZEN", streak: 9, zenCleanStacks: 0 })).toBe(0);
    });

    it("treats invalid momentum as no momentum", () => {
      expect(
        getMusicIntensity({ mode: "CLASSIC", streak: Number.NaN, zenCleanStacks: 0 }),
      ).toBe(0);
    });
  });

  describe("tempo", () => {
    it("derives the step length from BPM on an eighth-note grid", () => {
      expect(getStepSeconds(MUSIC_TEMPO_BPM)).toBeCloseTo(60 / 90 / 2, 10);
      expect(getStepSeconds(120, 4)).toBeCloseTo(0.125, 10);
    });

    it("rejects nonsensical tempos", () => {
      expect(() => getStepSeconds(0)).toThrow(RangeError);
      expect(() => getStepSeconds(90, -1)).toThrow(RangeError);
      expect(() => getStepSeconds(Number.NaN)).toThrow(RangeError);
    });

    it("schedules further ahead than the timer period (lookahead overlap)", () => {
      expect(SCHEDULE_AHEAD_SECONDS * 1000).toBeGreaterThan(SCHEDULER_INTERVAL_MS * 2);
    });

    it("keeps an on-time schedule untouched", () => {
      expect(resyncStepTime(10.2, 10, 0.33)).toBe(10.2);
      // Slightly late is fine: the next tick catches up step by step.
      expect(resyncStepTime(9.9, 10, 0.33)).toBe(9.9);
    });

    it("skips missed steps instead of bursting after a stall", () => {
      expect(resyncStepTime(2, 30, 0.33)).toBeCloseTo(30 + 0.33 / 4, 10);
    });
  });

  describe("layers", () => {
    it("maps intensity to layer gain targets", () => {
      expect(getLayerTargets(0)).toEqual({ 1: 0, 2: 0 });
      expect(getLayerTargets(1)).toEqual({ 1: LAYER_LEVELS[1], 2: 0 });
      expect(getLayerTargets(2)).toEqual({ 1: LAYER_LEVELS[1], 2: LAYER_LEVELS[2] });
    });

    it("keeps the music bus below SFX level", () => {
      expect(MUSIC_VOLUME).toBeGreaterThan(0);
      expect(MUSIC_VOLUME).toBeLessThan(1);
    });
  });

  describe("getPulseNote", () => {
    it("plays root/fifth on the beats and rests off-beat", () => {
      const bar = Array.from({ length: STEPS_PER_BAR }, (_, i) => getPulseNote(i));
      expect(bar).toEqual([0, null, 0, null, 7, null, 0, null]);
    });

    it("wraps across bars, including negative steps", () => {
      expect(getPulseNote(STEPS_PER_BAR + 4)).toBe(7);
      expect(getPulseNote(-4)).toBe(7);
    });
  });

  describe("chooseArpeggioNote", () => {
    it("rests on steps that are not arpeggio slots", () => {
      for (let step = 0; step < STEPS_PER_BAR; step += 1) {
        if (!ARPEGGIO_STEPS.includes(step)) {
          expect(chooseArpeggioNote(step, 0)).toBeNull();
        }
      }
    });

    it("rests when the draw is above the density (sparse)", () => {
      expect(chooseArpeggioNote(ARPEGGIO_STEPS[0], ARPEGGIO_DENSITY)).toBeNull();
      expect(chooseArpeggioNote(ARPEGGIO_STEPS[0], 0.99)).toBeNull();
      expect(chooseArpeggioNote(ARPEGGIO_STEPS[0], Number.NaN)).toBeNull();
    });

    it("only ever picks pentatonic degrees and can reach all of them", () => {
      const seen = new Set<number>();
      for (let i = 0; i < 200; i += 1) {
        const rand = (i / 200) * ARPEGGIO_DENSITY;
        const note = chooseArpeggioNote(ARPEGGIO_STEPS[1], rand);
        expect(note).not.toBeNull();
        expect(PENTATONIC as readonly number[]).toContain(note);
        seen.add(note as number);
      }
      expect(seen.size).toBe(PENTATONIC.length);
    });

    it("is deterministic for a given draw", () => {
      expect(chooseArpeggioNote(1, 0.3)).toBe(chooseArpeggioNote(1, 0.3));
    });

    it("never repeats the previous note back to back", () => {
      for (const previous of PENTATONIC) {
        for (let i = 0; i < 50; i += 1) {
          const rand = (i / 50) * ARPEGGIO_DENSITY;
          expect(chooseArpeggioNote(1, rand, previous)).not.toBe(previous);
        }
      }
    });
  });
});
