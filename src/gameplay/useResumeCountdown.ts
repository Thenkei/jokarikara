import { useEffect, useState } from "react";
import {
  advanceResumeCountdown,
  cancelResumeCountdown,
  finishResumeCountdown,
  IDLE_COUNTDOWN,
  isResumeCountdownRunning,
  startResumeCountdown,
  type ResumeCountdown,
  type ResumeCountdownStep,
} from "./resumeCountdown";

export type ResumeGoSource =
  /** The count ran to the end ("go" cue). */
  | "countdown"
  /** Skipped by the player acting on the board (Zen restart/undo). */
  | "skipped"
  /** Skipped by the E2E bridge. */
  | "test";

export type ResumeCountdownCallbacks = {
  /** A new digit is on screen (3, 2, 1): once per digit. */
  onDigit: (digit: number) => void;
  /** Play resumes now. */
  onGo: (source: ResumeGoSource) => void;
  /** A run that ended meanwhile cancels the count silently. */
  isGameOver: () => boolean;
  /** Injectable clock for tests (defaults to `performance.now`). */
  now?: () => number;
};

export type ResumeCountdownDriver = {
  start: () => void;
  /** Drop the count without resuming (no event). */
  cancel: () => void;
  /** Resume right away if counting (no-op otherwise). */
  finish: (source: Exclude<ResumeGoSource, "countdown">) => void;
  isRunning: () => boolean;
  /** Digit on screen, null when not counting. */
  digit: () => number | null;
  /** Swap the callbacks (latest props); read on every event. */
  setCallbacks: (callbacks: ResumeCountdownCallbacks) => void;
};

const defaultNow = () => performance.now();

/**
 * Wall-clock driver for the pure resume countdown: one timeout per digit
 * (never per frame), so React state downstream changes once per digit and
 * the game loop stays untouched (it simply remains paused until "go").
 * Callbacks are read on every event; `setCallbacks` swaps them (latest props).
 */
export const createResumeCountdownDriver = (
  initialCallbacks: ResumeCountdownCallbacks,
): ResumeCountdownDriver => {
  let callbacks = initialCallbacks;
  let countdown: ResumeCountdown = IDLE_COUNTDOWN;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const now = () => (callbacks.now ?? defaultNow)();

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const apply = (step: ResumeCountdownStep, source: ResumeGoSource): void => {
    clearTimer();
    countdown = step.countdown;
    if (step.nextInMs !== null) {
      timer = setTimeout(() => {
        timer = null;
        apply(
          advanceResumeCountdown(countdown, now(), {
            gameOver: callbacks.isGameOver(),
          }),
          "countdown",
        );
      }, step.nextInMs);
    }
    const { event } = step;
    if (event?.type === "digit") callbacks.onDigit(event.digit);
    else if (event?.type === "go") callbacks.onGo(source);
  };

  return {
    start: () => apply(startResumeCountdown(countdown, now()), "countdown"),
    cancel: () => apply(cancelResumeCountdown(), "countdown"),
    finish: (source) => apply(finishResumeCountdown(countdown), source),
    isRunning: () => isResumeCountdownRunning(countdown),
    digit: () => (countdown.phase === "running" ? countdown.shown : null),
    setCallbacks: (next) => {
      callbacks = next;
    },
  };
};

/**
 * React glue: one stable driver per component, latest callbacks, and any
 * pending count dropped on unmount (new run, game over screen, main menu).
 */
export const useResumeCountdown = (
  callbacks: ResumeCountdownCallbacks,
): ResumeCountdownDriver => {
  const [driver] = useState(() => createResumeCountdownDriver(callbacks));
  useEffect(() => {
    driver.setCallbacks(callbacks);
  });
  useEffect(() => () => driver.cancel(), [driver]);
  return driver;
};
