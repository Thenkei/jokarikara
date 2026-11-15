/**
 * Resume countdown ("3 · 2 · 1"): after the player resumes from the pause
 * menu (or after an auto-pause when the tab was hidden), the simulation stays
 * frozen for a short count so their eyes and finger are back on the board
 * before the active shape grows again.
 *
 * Pure state machine on an injected clock (`now`, in ms). The driver
 * (`useResumeCountdown`) owns the timers and side effects (ticks, haptics,
 * React state); this module only decides which digit shows and when play
 * resumes. It emits at most one event per step, so the driver changes React
 * state once per digit, never per frame.
 */

/** First digit shown. */
export const RESUME_COUNTDOWN_FROM = 3;

/** Time each digit stays on screen. */
export const RESUME_COUNTDOWN_STEP_MS = 550;

/** Freeze length from RESUME to "go" (3 × 550 = 1650 ms, under 1.8 s). */
export const RESUME_COUNTDOWN_TOTAL_MS =
  RESUME_COUNTDOWN_FROM * RESUME_COUNTDOWN_STEP_MS;

export type ResumeCountdown =
  | { readonly phase: "idle" }
  | {
      readonly phase: "running";
      readonly startedAt: number;
      /** Digit last reported by an event (what the player sees). */
      readonly shown: number;
    };

export const IDLE_COUNTDOWN: ResumeCountdown = { phase: "idle" };

export type ResumeCountdownEvent =
  | { readonly type: "digit"; readonly digit: number }
  /** Countdown over: play resumes now. */
  | { readonly type: "go" };

export type ResumeCountdownStep = {
  readonly countdown: ResumeCountdown;
  /** Something the player should see/hear now (null: nothing changed). */
  readonly event: ResumeCountdownEvent | null;
  /** Delay until the next step is due (null: nothing left to schedule). */
  readonly nextInMs: number | null;
};

const idle = (event: ResumeCountdownEvent | null = null): ResumeCountdownStep => ({
  countdown: IDLE_COUNTDOWN,
  event,
  nextInMs: null,
});

/** Digit due at `now` for a count started at `startedAt` (0 = go). */
const digitAt = (startedAt: number, now: number): number => {
  const elapsed = Math.max(0, now - startedAt);
  return Math.max(0, RESUME_COUNTDOWN_FROM - Math.floor(elapsed / RESUME_COUNTDOWN_STEP_MS));
};

const msUntilNextDigit = (startedAt: number, now: number): number => {
  const elapsed = Math.max(0, now - startedAt);
  const stepIndex = Math.floor(elapsed / RESUME_COUNTDOWN_STEP_MS);
  return (stepIndex + 1) * RESUME_COUNTDOWN_STEP_MS - elapsed;
};

/**
 * Begin counting at `now`. A second resume while one is already running
 * (double click on RESUME, key repeat) keeps the original count: no restart,
 * no extra tick.
 */
export const startResumeCountdown = (
  countdown: ResumeCountdown,
  now: number,
): ResumeCountdownStep => {
  if (countdown.phase === "running") {
    return {
      countdown,
      event: null,
      nextInMs: msUntilNextDigit(countdown.startedAt, now),
    };
  }
  return {
    countdown: { phase: "running", startedAt: now, shown: RESUME_COUNTDOWN_FROM },
    event: { type: "digit", digit: RESUME_COUNTDOWN_FROM },
    nextInMs: RESUME_COUNTDOWN_STEP_MS,
  };
};

/**
 * Timer callback: report the digit due at `now`. A late timer (throttled
 * tab, GC hitch) jumps straight to the current digit, or to go, instead of
 * replaying the skipped ones. A run that is over cancels the count silently.
 */
export const advanceResumeCountdown = (
  countdown: ResumeCountdown,
  now: number,
  { gameOver = false }: { gameOver?: boolean } = {},
): ResumeCountdownStep => {
  if (countdown.phase !== "running") return idle();
  if (gameOver) return idle();
  const digit = digitAt(countdown.startedAt, now);
  if (digit === 0) return idle({ type: "go" });
  const nextInMs = msUntilNextDigit(countdown.startedAt, now);
  if (digit === countdown.shown) return { countdown, event: null, nextInMs };
  return {
    countdown: { ...countdown, shown: digit },
    event: { type: "digit", digit },
    nextInMs,
  };
};

/**
 * Skip the rest of the count and resume now (E2E bridge, Zen restart/undo).
 * No-op when nothing is counting.
 */
export const finishResumeCountdown = (
  countdown: ResumeCountdown,
): ResumeCountdownStep =>
  countdown.phase === "running" ? idle({ type: "go" }) : idle();

/** Drop the count without resuming (re-pause, new run, game over). */
export const cancelResumeCountdown = (): ResumeCountdownStep => idle();

export const isResumeCountdownRunning = (countdown: ResumeCountdown): boolean =>
  countdown.phase === "running";
