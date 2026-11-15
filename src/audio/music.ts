import type { StackQuality } from "../types";
import type { Medal } from "../modes/medals";

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
 * Time Attack "time up" cadence, by result (see `playTimeUp`): after a bell
 * strike (two octaves over the chord root), `pickup` notes lead into a held
 * `chord`, all in semitones above the world root an octave up. Ordered by
 * reward, with only a small rise in loudness (more, softer voices):
 * - no medal: a suspended second settling on an open fifth + octave. No
 *   third, so it resolves without saying "happy" or "sad": the run is over,
 *   neither a loss nor a win.
 * - Bronze: the dominant falls into a major triad (V → I).
 * - Silver: third and fifth climb into the triad with the tenth on top.
 * - Gold: a pentatonic run up into a wide major chord (tenth and twelfth),
 *   plus a bell sparkle, held longer.
 * No chord note doubles the bell or the hum under it (24, -12): a unison
 * would phase in or out depending on the world's pitch, and the loudness
 * with it.
 */
export interface TimeUpCadence {
  readonly pickup: readonly number[];
  readonly chord: readonly number[];
  /** Hold of the chord, seconds. */
  readonly hold: number;
  /** A high bell partial over the chord (the record fanfare's sparkle). */
  readonly sparkle: boolean;
}

export type TimeUpTier = "NONE" | Medal;

export const TIME_UP_CADENCE: Readonly<Record<TimeUpTier, TimeUpCadence>> = {
  NONE: { pickup: [2], chord: [0, 7, 12], hold: 0.9, sparkle: false },
  BRONZE: { pickup: [7], chord: [0, 4, 7, 12], hold: 0.95, sparkle: false },
  SILVER: { pickup: [4, 7], chord: [0, 4, 7, 12, 16], hold: 1, sparkle: false },
  GOLD: { pickup: [4, 7, 9], chord: [0, 4, 7, 12, 16, 19], hold: 1.2, sparkle: true },
};

export const getTimeUpCadence = (medal: Medal | null): TimeUpCadence =>
  TIME_UP_CADENCE[medal ?? "NONE"];

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
