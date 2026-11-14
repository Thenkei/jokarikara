import type { GameState } from "../types";
import { CUE_MAX_STEP } from "../audio/music";
import { getWorldMechanics } from "../constants/game";
import { isStackValid } from "../core/gameState";
import { isTapBlockedByFracture } from "./fracture";
import { getPerfectTarget } from "./guide";
import { isReverseWorld, REVERSE_SPAWN_RATIO } from "./reverse";

/**
 * Timing cue (optional accessibility/feel aid, off by default): soft ticks
 * that speed up as the growing shape approaches the PERFECT band, one bright
 * tick inside it, silence once the moment has passed.
 *
 * Everything here is pure and driven by the pausable game clock
 * (`state.elapsedTime`), so ticks freeze with the pause overlay and replay
 * deterministically under the e2e bridge's manual stepping.
 *
 * The PERFECT band itself comes from `getPerfectTarget` (shared with the ghost
 * guide), so the cue can never disagree with scoring or with what the guide
 * draws, in regular and reverse worlds alike.
 */

/**
 * Regular worlds: ticks start once the shape reaches this fraction of the
 * band entry size. Earlier, the shape is so far off that a metronome would
 * just be noise (it spawns at ~5% of the container).
 */
export const CUE_LEAD_START_RATIO = 0.6;

/** Interval between ticks at the start of the approach (seconds). */
export const CUE_MAX_INTERVAL = 0.45;
/** Interval between ticks right before the band (seconds, ~9 Hz). */
export const CUE_MIN_INTERVAL = 0.11;
/** Re-strike period of the bright tick while the shape stays in the band. */
export const CUE_WINDOW_INTERVAL = 0.16;
/**
 * Hard floor between two ticks, whatever happens (e.g. a boss pulse pushing
 * the shape out of and back into the band within a frame or two).
 */
export const CUE_MIN_GAP = 0.06;
/**
 * Number of approach pitch steps (the bright window tick sits above them);
 * the pitches themselves live with the rest of the music theory.
 */
export const CUE_PITCH_STEPS = CUE_MAX_STEP + 1;

/**
 * Heartbeat worlds have no timing cue: the beat thump already *is* the rhythm
 * cue there, and growth surges on that beat, so a second, progress-driven
 * metronome would drift against it and blur the one rhythm the player should
 * lock onto.
 */
export const isTimingCueWorld = (world: number): boolean =>
  !getWorldMechanics(world).heartbeat;

export interface CueReading {
  /** 0 at the start of the approach, 1 at the PERFECT band entry. */
  progress: number;
  /** A tap right now would score PERFECT. */
  inWindow: boolean;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Where the growing shape stands relative to the PERFECT band, or null when
 * the cue must be silent: game over, no active shape, Heartbeat world, too
 * far from the band, band already passed, or a tap now would miss.
 */
export const getCueReading = (state: GameState): CueReading | null => {
  if (state.isGameOver || !state.activeShape) return null;
  if (!isTimingCueWorld(state.world)) return null;
  const target = getPerfectTarget(state);
  if (!target || target.bandEntrySize <= 0) return null;

  const size = state.activeShape.size;
  // Reverse worlds: past the band the stack is merely GREAT/GOOD; the
  // PERFECT moment is gone, so stop counting down to it.
  if (size > target.bandExitSize) return null;

  if (size >= target.bandEntrySize) {
    // The bright tick means "tap now": only play it if that tap really scores
    // PERFECT (contained / containing, no fracture blocking the tap).
    if (!isStackValid(state)) return null;
    if (isTapBlockedByFracture(state, state.elapsedTime)) return null;
    return { progress: 1, inWindow: true };
  }

  // Reverse worlds spawn just inside the previous shape and grow straight
  // into the band, so the approach spans the whole growth from spawn.
  const leadStart = isReverseWorld(state.world)
    ? REVERSE_SPAWN_RATIO
    : CUE_LEAD_START_RATIO;
  const ratio = size / target.bandEntrySize;
  if (ratio < leadStart) return null;
  return { progress: clamp01((ratio - leadStart) / (1 - leadStart)), inWindow: false };
};

export interface CueTiming {
  /** Seconds until the next tick should sound. */
  interval: number;
  /** Approach pitch step in [0, CUE_PITCH_STEPS); ignored in the window. */
  step: number;
  inWindow: boolean;
}

/**
 * Tick interval and pitch for a reading. The interval falls geometrically
 * (MAX × (MIN/MAX)^progress): tempo is perceived on a ratio scale, so a
 * constant ratio between successive intervals sounds like an even
 * accelerando rather than a slow crawl that suddenly rushes at the end.
 */
export const getCueTiming = (reading: CueReading | null): CueTiming | null => {
  if (!reading) return null;
  if (reading.inWindow) {
    return { interval: CUE_WINDOW_INTERVAL, step: CUE_PITCH_STEPS - 1, inWindow: true };
  }
  const progress = clamp01(reading.progress);
  return {
    interval: CUE_MAX_INTERVAL * Math.pow(CUE_MIN_INTERVAL / CUE_MAX_INTERVAL, progress),
    step: Math.min(CUE_PITCH_STEPS - 1, Math.floor(progress * CUE_PITCH_STEPS)),
    inWindow: false,
  };
};

/** Stepper memory: when the last tick sounded (game clock) and in which phase. */
export interface CueClock {
  lastTickAt: number | null;
  inWindow: boolean;
}

const CLOCK_EPSILON = 1e-9;

export const IDLE_CUE_CLOCK: CueClock = Object.freeze({
  lastTickAt: null,
  inWindow: false,
});

export interface CueTick {
  step: number;
  inWindow: boolean;
}

export interface CueStep {
  clock: CueClock;
  tick: CueTick | null;
}

/**
 * Decide whether a tick sounds at game time `now`.
 * - silent (`timing` null): forget the last tick, so the next approach
 *   starts with an immediate tick instead of inheriting a stale phase;
 * - first tick of an approach, or entering the PERFECT band: tick now (the
 *   band entry is the payoff and must not wait out an approach interval);
 * - otherwise tick once `interval` has elapsed since the last tick.
 * Ticks are never closer than CUE_MIN_GAP. A clock that went backwards (new
 * run) is treated as a fresh start.
 */
export const stepTimingCue = (
  clock: CueClock,
  now: number,
  timing: CueTiming | null,
): CueStep => {
  if (!timing) return { clock: IDLE_CUE_CLOCK, tick: null };

  const last = clock.lastTickAt;
  const fresh = last === null || now < last;
  // The game clock is a running float sum of frame dts; the epsilon keeps an
  // exactly-due tick from slipping a whole frame on rounding error.
  const since = fresh ? Number.POSITIVE_INFINITY : now - last + CLOCK_EPSILON;
  const enteringWindow = timing.inWindow && !clock.inWindow;
  const due = fresh || since >= timing.interval || (enteringWindow && since >= CUE_MIN_GAP);

  if (!due) {
    // Pushed back out of the band (boss pulse) without a tick: remember it so
    // a re-entry is announced again. A band entry held back by the gap stays
    // "pending" (inWindow false) and fires as soon as the gap allows.
    return clock.inWindow && !timing.inWindow
      ? { clock: { ...clock, inWindow: false }, tick: null }
      : { clock, tick: null };
  }
  return {
    clock: { lastTickAt: now, inWindow: timing.inWindow },
    tick: { step: timing.step, inWindow: timing.inWindow },
  };
};

/** One loop frame: read the state, then step the clock on `elapsedTime`. */
export const advanceTimingCue = (clock: CueClock, state: GameState): CueStep =>
  stepTimingCue(clock, state.elapsedTime, getCueTiming(getCueReading(state)));
