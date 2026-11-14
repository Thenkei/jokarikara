/**
 * Heartbeat: the growing shape advances in bursts on a fixed tempo instead of
 * continuously. Growth speed is modulated by an exponential decay over each
 * beat, normalised so the *average* speed is unchanged. The rhythm becomes
 * readable (tap on the beat), and a run is no faster or slower on average.
 */

/** Steepness of the burst. Higher = sharper surge on the beat, flatter rest. */
export const HEARTBEAT_SHARPNESS = 6;

const NORMALISER = HEARTBEAT_SHARPNESS / (1 - Math.exp(-HEARTBEAT_SHARPNESS));

/** Position within the current beat in [0, 1). */
export const getBeatPhase = (timeSec: number, bpm: number): number => {
  if (bpm <= 0 || !Number.isFinite(timeSec)) return 0;
  const beats = (timeSec * bpm) / 60;
  return beats - Math.floor(beats);
};

/**
 * Growth multiplier for the given beat phase. Mean over one beat is exactly 1,
 * so it can multiply the regular growth speed without changing balance.
 */
export const getHeartbeatMultiplier = (phase: number): number =>
  NORMALISER * Math.exp(-HEARTBEAT_SHARPNESS * Math.min(Math.max(phase, 0), 1));

/** Visual pulse in [0, 1]: 1 on the beat, decaying until the next one. */
export const getHeartbeatPulse = (phase: number): number =>
  Math.exp(-HEARTBEAT_SHARPNESS * Math.min(Math.max(phase, 0), 1));
