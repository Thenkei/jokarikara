import { describe, it, expect } from "vitest";
import { PENTATONIC } from "./music";
import {
  alignToGrid,
  ARPEGGIO_DENSITY,
  ARPEGGIO_LAYER_THRESHOLD,
  ARPEGGIO_STEPS,
  chooseArpeggioNote,
  DRONE_FILTER_HZ,
  DRONE_FILTER_Q,
  getEffectiveIntensity,
  getLayerTargets,
  getMusicIntensity,
  getMusicTension,
  getPulseNote,
  getStepSeconds,
  getTensionParams,
  LAYER_LEVELS,
  MUSIC_TEMPO_BPM,
  MUSIC_VOLUME,
  PULSE_LAYER_THRESHOLD,
  resyncStepTime,
  sanitizeTension,
  SCHEDULE_AHEAD_SECONDS,
  SCHEDULER_INTERVAL_MS,
  STEPS_PER_BAR,
  TENSION_ATTACK_SECONDS,
  TENSION_BUS_LIFT_DB,
  TENSION_FROM_SECONDS,
  TENSION_RELEASE_SECONDS,
} from "./soundtrack";
import { dbToGain } from "./mix";

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

  describe("alignToGrid", () => {
    const step = getStepSeconds();

    it("returns the first grid point at or after a time, with its bar step", () => {
      expect(alignToGrid(1, 1, step)).toEqual({ time: 1, step: 0 });
      const next = alignToGrid(1, 1 + step * 2.5, step);
      expect(next.time).toBeCloseTo(1 + step * 3, 10);
      expect(next.step).toBe(3);
      // Wraps the bar.
      expect(alignToGrid(0, step * (STEPS_PER_BAR + 1), step).step).toBe(1);
    });

    it("does not skip a grid point through floating point noise", () => {
      const at = 0.02 + 7 * step;
      expect(alignToGrid(0.02, at, step).time).toBeCloseTo(at, 10);
    });

    it("handles times before the origin", () => {
      const before = alignToGrid(10, 10 - step * 1.5, step);
      expect(before.time).toBeCloseTo(10 - step, 10);
      expect(before.step).toBe(STEPS_PER_BAR - 1);
    });
  });

  describe("Time Attack tension", () => {
    const ta = (remaining: number | undefined) => getMusicTension("TIME_ATTACK", remaining);

    it("stays calm above the threshold", () => {
      expect(TENSION_FROM_SECONDS).toBe(10);
      expect(ta(60)).toBe(0);
      expect(ta(15)).toBe(0);
      expect(ta(10.01)).toBe(0);
    });

    it("rises one step per displayed second to 1 on the last second", () => {
      expect(ta(10)).toBe(0.1);
      expect(ta(9.5)).toBe(0.1); // displayed 10
      expect(ta(8)).toBe(0.3);
      expect(ta(3)).toBe(0.8);
      expect(ta(1)).toBe(1);
      expect(ta(0.2)).toBe(1);
      expect(ta(0)).toBe(1);
      expect(ta(-2)).toBe(1);
      // Monotonic: less time is never calmer.
      let previous = 0;
      for (let t = 12; t >= 0; t -= 0.25) {
        const tension = ta(t);
        expect(tension).toBeGreaterThanOrEqual(previous);
        previous = tension;
      }
    });

    it("drops back to 0 when a bonus lifts the clock above the threshold", () => {
      expect(ta(3)).toBe(0.8);
      expect(ta(3 + 5 + 5)).toBe(0);
    });

    it("is always 0 outside Time Attack, and for a missing or invalid clock", () => {
      expect(getMusicTension("CLASSIC", 3)).toBe(0);
      expect(getMusicTension("ZEN", 0)).toBe(0);
      expect(ta(undefined)).toBe(0);
      expect(ta(Number.NaN)).toBe(0);
    });

    it("sanitises external values to [0, 1]", () => {
      expect(sanitizeTension(-1)).toBe(0);
      expect(sanitizeTension(2)).toBe(1);
      expect(sanitizeTension(Number.NaN)).toBe(0);
      expect(sanitizeTension(Number.POSITIVE_INFINITY)).toBe(0);
      expect(sanitizeTension(0.4)).toBe(0.4);
    });

    it("maps calm to the unchanged soundtrack", () => {
      expect(getTensionParams(0)).toEqual({
        filterHz: DRONE_FILTER_HZ,
        filterQ: DRONE_FILTER_Q,
        tremoloDepth: 0,
        pedalLevel: 0,
        busGain: 1,
      });
    });

    it("tightens every parameter monotonically and stays within its bounds", () => {
      let previous = getTensionParams(0);
      for (let i = 1; i <= 10; i += 1) {
        const params = getTensionParams(i / 10);
        expect(params.filterHz).toBeGreaterThan(previous.filterHz);
        expect(params.filterQ).toBeGreaterThan(previous.filterQ);
        expect(params.tremoloDepth).toBeGreaterThan(previous.tremoloDepth);
        expect(params.pedalLevel).toBeGreaterThan(previous.pedalLevel);
        expect(params.busGain).toBeGreaterThan(previous.busGain);
        previous = params;
      }
      const full = getTensionParams(1);
      // A soft resonance, far from self-oscillation.
      expect(full.filterQ).toBeLessThanOrEqual(4);
      // A dip-only tremolo: depth must stay below full silence.
      expect(full.tremoloDepth).toBeLessThan(1);
      expect(full.busGain).toBeCloseTo(dbToGain(TENSION_BUS_LIFT_DB), 10);
      // The lift is a nudge (mix budget guarded by tests/audio-levels.spec.ts).
      expect(TENSION_BUS_LIFT_DB).toBeLessThanOrEqual(2);
      expect(getTensionParams(5)).toEqual(full);
    });

    it("brings the pedal in late: quieter than linear early on", () => {
      const full = getTensionParams(1).pedalLevel;
      expect(getTensionParams(0.3).pedalLevel).toBeLessThan(full * 0.3);
    });

    it("forces the bass pulse in when tense, never lowers the streak's layers", () => {
      expect(getEffectiveIntensity(0, 0)).toBe(0);
      expect(getEffectiveIntensity(0, 0.1)).toBe(1);
      expect(getEffectiveIntensity(0, 1)).toBe(1);
      expect(getEffectiveIntensity(1, 0.5)).toBe(1);
      expect(getEffectiveIntensity(2, 0.5)).toBe(2);
      expect(getEffectiveIntensity(2, 0)).toBe(2);
    });

    it("eases out more slowly than it tightens, and tightens within a displayed second", () => {
      expect(TENSION_ATTACK_SECONDS).toBeLessThanOrEqual(1);
      expect(TENSION_RELEASE_SECONDS).toBeGreaterThan(TENSION_ATTACK_SECONDS);
    });
  });
});
