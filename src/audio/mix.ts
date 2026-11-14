import type { StackQuality } from "../types";

/**
 * Mix bus settings and per-effect trims, tuned against offline renders.
 *
 * Targets (loudest 300 ms RMS, dBFS, dry + reverb), measured with Chromium's
 * OfflineAudioContext by `tests/audio-levels.spec.ts`:
 *   stack OK ≈ -24 … PERFECT ≈ -18   (quality hierarchy stays audible, < 7 dB)
 *   level up ≈ -18, world up ≈ -17, game over ≈ -19
 *   Zen miss ≈ -25, early tap ≈ -28, countdown tick ≈ -28 / urgent ≈ -26
 *   timing cue ≈ -31 / PERFECT tick ≈ -28: well under any stack, ≥ 3 dB above
 *   the music bed so the bed never masks it
 *   music bed ≈ 10 dB under a plain stack, so it never masks feedback
 *   worst simultaneous burst: peak ≤ -1 dBFS (measured ≈ -4.5, no clipping)
 *   (stack/level up/world up in world 1; worlds 2-10 reshape them through
 *   `palette.ts` and stay within ±2 dB of world 1, measured ≤ 1.5 dB)
 *
 * Space: every voice also feeds a shared reverb (procedural 1.5 s room, see
 * `reverb.ts` / `reverbBus.ts`) whose return joins the master *before* the
 * compressor and limiter, so dry + wet are protected together and mute
 * silences the tail. The bus is built on idle after init (IR generation stays
 * off the first-sound path); sounds before it play dry. Tail after the dry:
 *   PERFECT stack ≈ -52 (rings on), menu click ≈ -59 (near-dry, snappy)
 * Adding the reverb raised the 300 ms RMS by ≤ 0.4 dB on most effects and
 * ≈ 1.2 dB on PERFECT (intended: it should bloom); level up and world up
 * trims dropped 1 dB to keep their balance.
 */

export type SfxId =
  | "stack"
  | "levelUp"
  | "worldUp"
  | "fail"
  | "miss"
  | "early"
  | "tick"
  | "timeBonus"
  | "heartbeat"
  | "combo"
  | "menu"
  | "ui"
  | "cue";

/** Gain applied before the bus processing (linear). */
export const MASTER_VOLUME = 1;

/** Per-effect trim in dB, applied on top of each voice's own peak. */
export const SFX_TRIM_DB: Readonly<Record<SfxId, number>> = {
  stack: 6,
  levelUp: -2.7,
  worldUp: -7,
  fail: 8,
  miss: 9.5,
  early: 14,
  tick: 10,
  timeBonus: -0.5,
  heartbeat: 4,
  combo: 0,
  menu: 0,
  ui: 2.5,
  cue: 9,
};

/**
 * Reverb send per effect, in dB relative to the dry voice. The return is
 * calibrated to unit IR energy, so -10 means "tail energy ~10 dB under the
 * dry" for broadband sound; tonal voices land a few dB either side (a noise
 * IR colours each pitch differently, and the damping concentrates its energy
 * below ~7 kHz), hence the values are tuned on renders, not derived.
 * Big moments bloom; anything that must feel instant (ticks, menu clicks,
 * early taps) stays near-dry so the game keeps its snap. At or below
 * `REVERB_SEND_FLOOR_DB` a sound is routed fully dry.
 */
export const SFX_REVERB_SEND_DB: Readonly<Record<SfxId, number>> = {
  stack: -18,
  levelUp: -13,
  worldUp: -10,
  fail: -16,
  miss: -22,
  early: -36,
  tick: -40,
  timeBonus: -16,
  heartbeat: -30,
  combo: -12,
  menu: -42,
  ui: -26,
  // Timing cue is a rhythm aid: a tail would smear where the beat lands.
  cue: -40,
};

/** Extra stack send by quality: a PERFECT placement rings out. */
export const STACK_REVERB_BOOST_DB: Readonly<Record<StackQuality, number>> = {
  OK: 0,
  GOOD: 1,
  GREAT: 2,
  PERFECT: 3,
};

/**
 * Soundtrack send (post music bus): a touch of room glues the bed. Its wet
 * adds ~0.3 dB, compensated in `MUSIC_VOLUME` so the bed stays where it was:
 * the timing cue must sit ≥ 3 dB above it so phone speakers keep it audible.
 */
export const MUSIC_REVERB_SEND_DB = -18;
/** Overall wet level on the return, on top of the unit-energy calibration. */
export const REVERB_RETURN_DB = 0;
/** Keeps lows out of the tail (heartbeat thump, fail growl) to avoid mud. */
export const REVERB_HIGHPASS_HZ = 220;
/** Sends at or below this are treated as fully dry (no node, no routing). */
export const REVERB_SEND_FLOOR_DB = -60;

/** Glue compressor: evens out stacked voices without pumping. */
export const BUS_COMPRESSOR = {
  threshold: -16,
  knee: 8,
  ratio: 3,
  attack: 0.004,
  release: 0.2,
} as const;

/** Brick-wall-ish limiter: guarantees no clipping on worst-case bursts. */
export const BUS_LIMITER = {
  threshold: -3,
  knee: 0,
  ratio: 20,
  attack: 0.001,
  release: 0.08,
} as const;

export const dbToGain = (db: number): number => Math.pow(10, db / 20);
