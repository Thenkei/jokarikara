/**
 * Pause-aware stopwatch as an immutable value. Time is injected (ms from a
 * monotonic clock such as performance.now) so it is trivially testable and
 * independent from the game loop's frame timing.
 */
export interface Stopwatch {
  startedAtMs: number;
  /** Set while paused. */
  pausedAtMs: number | null;
  /** Total paused duration already folded in. */
  pausedTotalMs: number;
}

export const startStopwatch = (nowMs: number): Stopwatch => ({
  startedAtMs: nowMs,
  pausedAtMs: null,
  pausedTotalMs: 0,
});

export const pauseStopwatch = (watch: Stopwatch, nowMs: number): Stopwatch =>
  watch.pausedAtMs !== null ? watch : { ...watch, pausedAtMs: nowMs };

export const resumeStopwatch = (watch: Stopwatch, nowMs: number): Stopwatch =>
  watch.pausedAtMs === null
    ? watch
    : {
        ...watch,
        pausedAtMs: null,
        pausedTotalMs: watch.pausedTotalMs + Math.max(0, nowMs - watch.pausedAtMs),
      };

/** Active (unpaused) seconds elapsed; never negative. */
export const elapsedSeconds = (watch: Stopwatch, nowMs: number): number => {
  const end = watch.pausedAtMs ?? nowMs;
  return Math.max(0, end - watch.startedAtMs - watch.pausedTotalMs) / 1000;
};
