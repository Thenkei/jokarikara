import type { StackQuality } from "../types";

/**
 * Pure music-theory helpers. Kept free of Web Audio so the musical design
 * (scales, intervals, per-world keys) is unit-testable and deterministic.
 */

/** Major pentatonic degrees in semitones: no dissonant intervals, any
 *  sequence of notes sounds consonant regardless of player timing. */
export const PENTATONIC = [0, 2, 4, 7, 9] as const;

/** Root note (Hz) per world: each world modulates to a new key so progress
 *  is audible. Cycles after the last entry. */
export const WORLD_ROOTS_HZ = [
  220.0, // A3
  246.94, // B3
  261.63, // C4
  293.66, // D4
  329.63, // E4
  196.0, // G3
  207.65, // G#3
  233.08, // A#3
] as const;

/** Notes climb this many pentatonic steps before wrapping back down. */
export const MELODY_SPAN = 10;

export const semitonesToRatio = (semitones: number): number =>
  Math.pow(2, semitones / 12);

export const getWorldRoot = (world: number): number => {
  const index = (((Math.max(1, Math.floor(world)) - 1) % WORLD_ROOTS_HZ.length) +
    WORLD_ROOTS_HZ.length) % WORLD_ROOTS_HZ.length;
  return WORLD_ROOTS_HZ[index];
};

/** Semitone offset of the n-th pentatonic step (n >= 0, may span octaves). */
export const pentatonicSemitones = (step: number): number => {
  const safe = Math.max(0, Math.floor(step));
  const octave = Math.floor(safe / PENTATONIC.length);
  return octave * 12 + PENTATONIC[safe % PENTATONIC.length];
};

/**
 * Frequency for a successful stack. The melody rises with the combo streak so
 * a long streak literally sounds like climbing; it wraps to stay audible.
 */
export const getStackNoteHz = (world: number, streak: number): number => {
  const step = Math.max(0, streak - 1) % MELODY_SPAN;
  return getWorldRoot(world) * semitonesToRatio(pentatonicSemitones(step));
};

/** Extra intervals (in semitones above the base note) layered by quality. */
export const QUALITY_HARMONY: Record<StackQuality, readonly number[]> = {
  PERFECT: [7, 12, 19],
  GREAT: [7, 12],
  GOOD: [7],
  OK: [],
};

/** Ascending major arpeggio (semitones) for level-up. */
export const LEVEL_UP_ARPEGGIO = [0, 4, 7, 12] as const;
/** Sustained add9 chord (semitones) for a new world. */
export const WORLD_UP_CHORD = [0, 4, 7, 14, 19] as const;

/**
 * Timing cue pitches. Deliberately world-independent: the cue is a reference
 * the player learns once ("the high ding means now"), so it must not move
 * with the per-world key. Approach ticks climb the first pentatonic steps
 * from A5 (A5 B5 C#6 E6: a fifth overall, a slight rise that adds urgency
 * without turning into a melody); the PERFECT tick lands an octave above the
 * root (A6) so it reads as the arrival.
 */
export const CUE_ROOT_HZ = 880;
/** Highest approach step that keeps the rise "slight" (E6). */
export const CUE_MAX_STEP = 3;

export const getCueNoteHz = (step: number, inWindow: boolean): number =>
  inWindow
    ? CUE_ROOT_HZ * 2
    : CUE_ROOT_HZ *
      semitonesToRatio(pentatonicSemitones(Math.min(Math.max(step, 0), CUE_MAX_STEP)));
