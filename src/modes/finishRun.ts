import type { GameMode } from "../types";

/**
 * Zen FINISH RUN (pause menu): pure rules for who may finish and for the
 * two-step confirm. The App owns the timers; this module only decides.
 *
 * Zen only. Classic ends on the first miss, so a voluntary finish would let a
 * player bank a score mid-risk; Time Attack is already bounded by its clock.
 * In both, MAIN MENU keeps abandoning the run.
 */
export const canFinishRun = (mode: GameMode): boolean => mode === "ZEN";

/** How long the armed "TAP AGAIN TO FINISH" state waits for the second press. */
export const FINISH_CONFIRM_WINDOW_MS = 3000;

/**
 * Presses closer than this to the arming one are ignored (the button stays
 * armed): an accidental double click or double tap must not end a session.
 */
export const FINISH_CONFIRM_GUARD_MS = 350;

export type FinishConfirmStep =
  /** First press (or the window expired): arm and wait for a second press. */
  | "arm"
  /** Too soon after arming: ignore, stay armed. */
  | "wait"
  /** Deliberate second press inside the window: finish the run. */
  | "finish";

/**
 * Decide what a FINISH RUN press does. `armedAt` is the (monotonic) time the
 * button was armed, null when it is not; `now` uses the same clock.
 */
export const stepFinishConfirm = (
  armedAt: number | null,
  now: number,
): FinishConfirmStep => {
  if (armedAt === null) return "arm";
  const elapsed = now - armedAt;
  // A clock that went backwards (or a stale arm) starts over.
  if (elapsed < 0 || elapsed >= FINISH_CONFIRM_WINDOW_MS) return "arm";
  return elapsed < FINISH_CONFIRM_GUARD_MS ? "wait" : "finish";
};
