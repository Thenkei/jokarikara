import type { GameMode } from "../types";
import { PENTATONIC } from "./music";
import type { MusicIntensity } from "./types";

/**
 * Pure design of the dynamic soundtrack: which layers play, when, and which
 * notes. No Web Audio here so the musical rules stay deterministic and
 * unit-testable; `musicEngine.ts` turns these decisions into audio nodes.
 */

/** Fixed tempo of the rhythmic layers. Slow enough to stay ambient. */
export const MUSIC_TEMPO_BPM = 90;
/** Eighth-note grid: two scheduler steps per beat. */
export const STEPS_PER_BEAT = 2;
/** One 4/4 bar of eighth notes. */
export const STEPS_PER_BAR = 8;

/**
 * Lookahead scheduler ("A Tale of Two Clocks"): a coarse JS timer wakes up
 * every SCHEDULER_INTERVAL_MS and schedules every note that starts within the
 * next SCHEDULE_AHEAD_SECONDS on the sample-accurate AudioContext clock. The
 * overlap absorbs main-thread jank without audible timing drift.
 */
export const SCHEDULER_INTERVAL_MS = 25;
export const SCHEDULE_AHEAD_SECONDS = 0.1;

/** Streak (or Zen clean stacks) needed to unlock each rhythmic layer. */
export const PULSE_LAYER_THRESHOLD = 3;
export const ARPEGGIO_LAYER_THRESHOLD = 6;

/**
 * Music bus level relative to the SFX path (both feed the same master gain,
 * where SFX enter at unity). Keeps the bed clearly under gameplay feedback.
 * Trimmed ~0.3 dB (from 0.042) to absorb the reverb send's added room.
 */
export const MUSIC_VOLUME = 0.0405;

/** Steady-state gain of each layer inside the music bus. */
export const DRONE_LEVEL = 0.22;
export const LAYER_LEVELS: Readonly<Record<1 | 2, number>> = {
  1: 0.5,
  2: 0.32,
};

/** Fade timings (seconds). Long enough to never click, short enough to feel responsive. */
export const MUSIC_FADE_IN_SECONDS = 1.5;
export const LAYER_FADE_SECONDS = 1.2;
export const WORLD_CROSSFADE_SECONDS = 2.5;
export const PAUSE_FADE_SECONDS = 0.25;
export const STOP_FADE_SECONDS = 0.6;
/** Muting is already silent at the master; tear down almost immediately. */
export const MUTE_FADE_SECONDS = 0.02;

/**
 * Bass pulse pattern over one bar (semitones above the bass root, null = rest):
 * root on the beats with a fifth on beat 3, so it locks to the drone.
 */
export const PULSE_PATTERN: readonly (number | null)[] = [
  0,
  null,
  0,
  null,
  7,
  null,
  0,
  null,
];

/**
 * Bar steps on which the arpeggio may speak. Off-beats only, so it answers the
 * pulse instead of doubling it.
 */
export const ARPEGGIO_STEPS: readonly number[] = [1, 3, 6];
/** Probability that an eligible step actually plays (keeps it sparse). */
export const ARPEGGIO_DENSITY = 0.6;

export interface MusicMomentum {
  mode: GameMode;
  /** Combo streak (Classic / Time Attack; always 0 in Zen). */
  streak: number;
  /** Zen only: successful stacks since the run's last miss. */
  zenCleanStacks: number;
}

/**
 * Soundtrack intensity for the current run. Zen has no combo streak, so its
 * momentum is the number of stacks since the last miss: a miss drops the
 * music back to the drone in every mode.
 */
export const getMusicIntensity = ({
  mode,
  streak,
  zenCleanStacks,
}: MusicMomentum): MusicIntensity => {
  const raw = mode === "ZEN" ? zenCleanStacks : streak;
  const momentum = Number.isFinite(raw) ? raw : 0;
  if (momentum >= ARPEGGIO_LAYER_THRESHOLD) return 2;
  if (momentum >= PULSE_LAYER_THRESHOLD) return 1;
  return 0;
};

/** Duration of one scheduler step in seconds. */
export const getStepSeconds = (
  bpm: number = MUSIC_TEMPO_BPM,
  stepsPerBeat: number = STEPS_PER_BEAT,
): number => {
  if (!(bpm > 0) || !(stepsPerBeat > 0)) {
    throw new RangeError(`Invalid tempo: ${bpm} BPM / ${stepsPerBeat} steps`);
  }
  return 60 / bpm / stepsPerBeat;
};

/**
 * If the scheduler fell behind the audio clock (throttled background timer,
 * long GC pause, suspended context), skip the missed steps instead of
 * firing them all at once. Returns the time the next step should start.
 */
export const resyncStepTime = (
  nextStepTime: number,
  now: number,
  stepSeconds: number,
): number => (nextStepTime < now - stepSeconds ? now + stepSeconds / 4 : nextStepTime);

/** Gain targets of the rhythmic layers for an intensity. */
export const getLayerTargets = (
  intensity: MusicIntensity,
): Readonly<Record<1 | 2, number>> => ({
  1: intensity >= 1 ? LAYER_LEVELS[1] : 0,
  2: intensity >= 2 ? LAYER_LEVELS[2] : 0,
});

/** Bass pulse note (semitones above the bass root) for a bar step, or null. */
export const getPulseNote = (step: number): number | null =>
  PULSE_PATTERN[((Math.floor(step) % STEPS_PER_BAR) + STEPS_PER_BAR) % STEPS_PER_BAR] ??
  null;

/**
 * Sparse pentatonic arpeggio note (semitones above the arpeggio root) for a
 * bar step, or null for a rest. `rand` in [0, 1) both gates the note and picks
 * the degree, so a single random draw per step is enough. Never repeats the
 * previous note back to back, which keeps the line moving.
 */
export const chooseArpeggioNote = (
  step: number,
  rand: number,
  previous: number | null = null,
): number | null => {
  const barStep = ((Math.floor(step) % STEPS_PER_BAR) + STEPS_PER_BAR) % STEPS_PER_BAR;
  if (!ARPEGGIO_STEPS.includes(barStep)) return null;
  if (!(rand >= 0) || rand >= ARPEGGIO_DENSITY) return null;

  const degrees = PENTATONIC.length;
  let index = Math.min(degrees - 1, Math.floor((rand / ARPEGGIO_DENSITY) * degrees));
  if (PENTATONIC[index] === previous) {
    index = (index + 1) % degrees;
  }
  return PENTATONIC[index];
};
