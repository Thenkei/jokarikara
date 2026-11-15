import { useEffect, useState } from "react";
import {
  advanceWorldIntroHold,
  IDLE_HOLD,
  isWorldIntroHolding,
  releaseWorldIntroHold,
  startWorldIntroHold,
  tapWorldIntroHold,
  type WorldIntroHold,
  type WorldIntroReleaseReason,
  type WorldIntroStep,
  type WorldIntroTap,
} from "./worldIntro";

export type WorldIntroHoldCallbacks = {
  /** The game is held on `world`'s first-visit intro. */
  onHold: (world: number) => void;
  /** The hold ended: play resumes now. Not called by `cancel`. */
  onRelease: (reason: WorldIntroReleaseReason) => void;
  /** Injectable clock for tests (defaults to `performance.now`). */
  now?: () => number;
  /** Max wait of the next hold (E2E override; default FIRST_VISIT_MAX_HOLD_MS). */
  maxHoldMs?: () => number;
};

export type WorldIntroHoldDriver = {
  start: (world: number) => void;
  /** Route a tap through the hold; "play" means it was not holding. */
  tap: () => WorldIntroTap;
  release: (reason: Exclude<WorldIntroReleaseReason, "tap" | "timeout">) => void;
  /** Drop the hold silently (run over, unmount). */
  cancel: () => void;
  isHolding: () => boolean;
  /** Held world, null when not holding. */
  world: () => number | null;
  setCallbacks: (callbacks: WorldIntroHoldCallbacks) => void;
};

const defaultNow = () => performance.now();

/**
 * Wall-clock driver for the pure world intro hold: a single timeout for the
 * max wait (never per frame). The game loop reads `isHolding()` each frame
 * and simply skips the simulation while it is true.
 */
export const createWorldIntroHoldDriver = (
  initialCallbacks: WorldIntroHoldCallbacks,
): WorldIntroHoldDriver => {
  let callbacks = initialCallbacks;
  let hold: WorldIntroHold = IDLE_HOLD;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const now = () => (callbacks.now ?? defaultNow)();

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const apply = (step: WorldIntroStep, notify = true): void => {
    clearTimer();
    hold = step.hold;
    if (step.nextInMs !== null) {
      timer = setTimeout(() => {
        timer = null;
        apply(advanceWorldIntroHold(hold, now()));
      }, step.nextInMs);
    }
    if (notify && step.released !== null) callbacks.onRelease(step.released);
  };

  return {
    start: (world) => {
      apply(startWorldIntroHold(world, now(), callbacks.maxHoldMs?.()));
      callbacks.onHold(world);
    },
    tap: () => {
      const step = tapWorldIntroHold(hold, now());
      // A swallowed tap keeps the running timer (no reschedule needed).
      if (step.tap !== "ignored") apply(step);
      return step.tap;
    },
    release: (reason) => apply(releaseWorldIntroHold(hold, reason)),
    cancel: () => apply(releaseWorldIntroHold(hold, "test"), false),
    isHolding: () => isWorldIntroHolding(hold),
    world: () => (hold.phase === "holding" ? hold.world : null),
    setCallbacks: (next) => {
      callbacks = next;
    },
  };
};

/**
 * React glue: one stable driver per component, latest callbacks, and any
 * pending hold dropped on unmount (new run, game over screen, main menu).
 */
export const useWorldIntroHold = (
  callbacks: WorldIntroHoldCallbacks,
): WorldIntroHoldDriver => {
  const [driver] = useState(() => createWorldIntroHoldDriver(callbacks));
  useEffect(() => {
    driver.setCallbacks(callbacks);
  });
  useEffect(() => () => driver.cancel(), [driver]);
  return driver;
};
