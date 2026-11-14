/**
 * Mix bus settings and per-effect trims, tuned against offline renders.
 *
 * Targets (loudest 300 ms RMS, dBFS), measured with Chromium's
 * OfflineAudioContext by `tests/audio-levels.spec.ts`:
 *   stack OK ≈ -24 … PERFECT ≈ -20   (quality hierarchy stays audible)
 *   level up ≈ -20, world up ≈ -18, game over ≈ -20
 *   Zen miss ≈ -26, early tap ≈ -28, countdown tick ≈ -28 / urgent ≈ -24
 *   timing cue ≈ -33 / PERFECT tick ≈ -30: well under any stack, above
 *   the music bed so the bed never masks it
 *   music bed ≥ 10 dB under a plain stack, so it never masks feedback
 *   worst simultaneous burst: peak ≤ -1 dBFS (no clipping)
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
  levelUp: -1.7,
  worldUp: -6,
  fail: 8,
  miss: 9.5,
  early: 14,
  tick: 10,
  timeBonus: -0.5,
  heartbeat: 4,
  combo: 0,
  menu: 0,
  ui: 2.5,
  cue: 7,
};

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
