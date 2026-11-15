import type { GameMode } from "../types";
import { PENTATONIC } from "./music";
import { dbToGain } from "./mix";
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

/** Base cutoff of the drone low-pass (Hz); tension opens it from here. */
export const DRONE_FILTER_HZ = 520;
/** Resonance of the drone low-pass while calm (just under Butterworth). */
export const DRONE_FILTER_Q = 0.7;

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

/**
 * Lead before the first note a freshly armed scheduler places: a hair ahead
 * of the audio clock so the note is never scheduled in the past.
 */
export const SCHEDULE_LEAD_SECONDS = 0.02;

/**
 * Every rhythmic event (pulse/arpeggio steps, the tension tremolo's peaks)
 * sits on one eighth-note grid anchored at the session's `origin`, so layers
 * armed at different times stay in phase. Returns the first grid point at or
 * after `from` and its step in the bar.
 */
export const alignToGrid = (
  origin: number,
  from: number,
  stepSeconds: number,
): { time: number; step: number } => {
  // Tolerance: a `from` exactly on a grid point must not skip to the next one
  // through floating point noise.
  const index = Math.ceil((from - origin) / stepSeconds - 1e-9);
  return {
    time: origin + index * stepSeconds,
    step: ((index % STEPS_PER_BAR) + STEPS_PER_BAR) % STEPS_PER_BAR,
  };
};

// --- Time Attack tension ------------------------------------------------

/**
 * Seconds left on the Time Attack clock at which the music starts to tighten.
 * Tension is quantised to the displayed (whole) second, the same granularity
 * at which GameCanvas reports the clock, so the audio manager is only ever
 * told about it ~once per second, never per frame.
 */
export const TENSION_FROM_SECONDS = 10;

/**
 * Musical tension (0..1) for the run clock. 0 outside Time Attack and above
 * `TENSION_FROM_SECONDS`; then one step per displayed second, reaching 1 on
 * the last second. A time bonus that lifts the clock back above the
 * threshold brings it back to 0 (the engine eases out).
 *
 *   displayed 11+ -> 0, 10 -> 0.1, 9 -> 0.2, ..., 1 -> 1 (and 0 -> 1)
 */
export const getMusicTension = (
  mode: GameMode,
  timeRemaining: number | undefined,
): number => {
  if (mode !== "TIME_ATTACK") return 0;
  if (timeRemaining === undefined || Number.isNaN(timeRemaining)) return 0;
  const displayed = Math.max(0, Math.ceil(timeRemaining));
  const steps = TENSION_FROM_SECONDS + 1 - displayed;
  if (steps <= 0) return 0;
  return Math.min(steps, TENSION_FROM_SECONDS) / TENSION_FROM_SECONDS;
};

/** Clamp an external tension value to [0, 1]; anything invalid is calm. */
export const sanitizeTension = (tension: number): number =>
  Number.isFinite(tension) ? Math.min(1, Math.max(0, tension)) : 0;

/** Drone low-pass at full tension: this many octaves above `DRONE_FILTER_HZ`. */
export const TENSION_FILTER_OCTAVES = 1.3;
/**
 * Drone low-pass resonance at full tension: a soft peak that makes the slow
 * cutoff sweep audible as the filter opens (well short of self-oscillation).
 */
export const TENSION_FILTER_Q = 2.5;
/**
 * Drone tremolo depth at full tension: the drone gain dips by up to this
 * much on every eighth note (it never rises above its calm level).
 */
export const TENSION_TREMOLO_DEPTH = 0.4;
/**
 * Dominant pedal (a fifth above the world root, inside the drone's filter)
 * level at full tension, relative to the drone voices' `DRONE_LEVEL`.
 */
export const TENSION_PEDAL_LEVEL = 0.08;
/** Music bus lift at full tension, kept inside the mix budget (see mix.ts). */
export const TENSION_BUS_LIFT_DB = 0.5;
/** Tension at or above which the bass pulse plays whatever the streak. */
export const TENSION_PULSE_FROM = 0.1;
/** Glide toward a higher tension: ~one displayed second, so steps blend into a ramp. */
export const TENSION_ATTACK_SECONDS = 0.9;
/** Ease-out after a time bonus lifts the clock back: slower, a release. */
export const TENSION_RELEASE_SECONDS = 2;

export interface TensionParams {
  /** Base cutoff of the drone low-pass (the slow LFO still sweeps around it). */
  filterHz: number;
  /** Resonance of the drone low-pass. */
  filterQ: number;
  /** Drone tremolo depth, 0..1 (gain swings within [1 - depth, 1]). */
  tremoloDepth: number;
  /** Dominant pedal gain (0 = silent). */
  pedalLevel: number;
  /** Music bus gain (1 = calm level). */
  busGain: number;
}

/**
 * Musical parameters for a tension. Every curve is monotonic and equals the
 * calm soundtrack at 0, so releasing tension is just gliding back:
 * - the filter opens exponentially (even steps per second to the ear) and
 *   gains a little resonance,
 * - the tremolo deepens linearly,
 * - the pedal comes in late (quadratic) so the first seconds stay subtle,
 * - the bus lift is linear in dB.
 */
export const getTensionParams = (tension: number): TensionParams => {
  const t = sanitizeTension(tension);
  return {
    filterHz: DRONE_FILTER_HZ * Math.pow(2, TENSION_FILTER_OCTAVES * t),
    filterQ: DRONE_FILTER_Q + (TENSION_FILTER_Q - DRONE_FILTER_Q) * t,
    tremoloDepth: TENSION_TREMOLO_DEPTH * t,
    pedalLevel: TENSION_PEDAL_LEVEL * t * t,
    busGain: dbToGain(TENSION_BUS_LIFT_DB * t),
  };
};

/**
 * Layers actually played: the streak's intensity, with the bass pulse forced
 * in once the clock is tense (a ticking heart under the countdown).
 */
export const getEffectiveIntensity = (
  intensity: MusicIntensity,
  tension: number,
): MusicIntensity =>
  sanitizeTension(tension) >= TENSION_PULSE_FROM && intensity < 1 ? 1 : intensity;
