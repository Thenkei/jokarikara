/**
 * Thin wrapper over the Vibration API. Unsupported on iOS Safari and desktop,
 * where it is a silent no-op.
 */
export type HapticPattern =
  | "tap"
  | "perfect"
  | "miss"
  | "fail"
  | "levelUp"
  | "record"
  | "medal"
  | "life";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 8,
  perfect: [12, 30, 18],
  miss: 30,
  fail: [40, 40, 90],
  levelUp: [10, 25, 10, 25, 20],
  /** Personal best beaten: two taps then a long hold ("ta-da"). */
  record: [14, 40, 14, 40, 70],
  /** Time Attack medal reached: three even "ding" taps. */
  medal: [16, 32, 16, 32, 16],
  /** Zen life regained: a quick double tap that swells. */
  life: [10, 30, 22],
};

let enabled = true;

export const setHapticsEnabled = (value: boolean): void => {
  enabled = value;
};

/** Whether this device can vibrate at all (the toggle is hidden otherwise). */
export const isHapticsSupported = (): boolean =>
  typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

export const haptic = (pattern: HapticPattern): void => {
  if (!enabled) return;
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function")
    return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // Some browsers throw when vibration is blocked by user-activation rules.
  }
};
