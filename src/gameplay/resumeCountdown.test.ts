import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  advanceResumeCountdown,
  cancelResumeCountdown,
  finishResumeCountdown,
  IDLE_COUNTDOWN,
  isResumeCountdownRunning,
  RESUME_COUNTDOWN_FROM,
  RESUME_COUNTDOWN_STEP_MS,
  RESUME_COUNTDOWN_TOTAL_MS,
  startResumeCountdown,
  type ResumeCountdownEvent,
} from "./resumeCountdown";
import { createResumeCountdownDriver, type ResumeGoSource } from "./useResumeCountdown";

const STEP = RESUME_COUNTDOWN_STEP_MS;

describe("resume countdown (pure)", () => {
  it("counts 3, 2, 1 within 1.8 s with steps of 0.5-0.6 s", () => {
    expect(RESUME_COUNTDOWN_FROM).toBe(3);
    expect(STEP).toBeGreaterThanOrEqual(500);
    expect(STEP).toBeLessThanOrEqual(600);
    expect(RESUME_COUNTDOWN_TOTAL_MS).toBeLessThanOrEqual(1800);
  });

  it("shows 3 at start, then one digit per step, then go", () => {
    const start = startResumeCountdown(IDLE_COUNTDOWN, 1000);
    expect(start.event).toEqual({ type: "digit", digit: 3 });
    expect(start.nextInMs).toBe(STEP);
    expect(isResumeCountdownRunning(start.countdown)).toBe(true);

    const two = advanceResumeCountdown(start.countdown, 1000 + STEP);
    expect(two.event).toEqual({ type: "digit", digit: 2 });
    expect(two.nextInMs).toBe(STEP);

    const one = advanceResumeCountdown(two.countdown, 1000 + 2 * STEP);
    expect(one.event).toEqual({ type: "digit", digit: 1 });

    const go = advanceResumeCountdown(one.countdown, 1000 + 3 * STEP);
    expect(go.event).toEqual({ type: "go" });
    expect(go.countdown).toEqual(IDLE_COUNTDOWN);
    expect(go.nextInMs).toBeNull();
  });

  it("reports nothing on an early timer and reschedules for the remainder", () => {
    const start = startResumeCountdown(IDLE_COUNTDOWN, 0);
    const early = advanceResumeCountdown(start.countdown, STEP - 20);
    expect(early.event).toBeNull();
    expect(early.countdown).toBe(start.countdown);
    expect(early.nextInMs).toBe(20);
  });

  it("jumps to the current digit (or go) after a late timer, no burst", () => {
    const start = startResumeCountdown(IDLE_COUNTDOWN, 0);
    const late = advanceResumeCountdown(start.countdown, 2 * STEP + 10);
    expect(late.event).toEqual({ type: "digit", digit: 1 });
    expect(late.nextInMs).toBe(STEP - 10);
    const veryLate = advanceResumeCountdown(start.countdown, 10_000);
    expect(veryLate.event).toEqual({ type: "go" });
  });

  it("keeps the running count on a double resume (no restart, no tick)", () => {
    const start = startResumeCountdown(IDLE_COUNTDOWN, 0);
    const again = startResumeCountdown(start.countdown, 300);
    expect(again.countdown).toBe(start.countdown);
    expect(again.event).toBeNull();
    expect(again.nextInMs).toBe(STEP - 300);
  });

  it("cancels without resuming", () => {
    const cancelled = cancelResumeCountdown();
    expect(cancelled).toEqual({ countdown: IDLE_COUNTDOWN, event: null, nextInMs: null });
    // A stale timer after a cancel does nothing.
    expect(advanceResumeCountdown(cancelled.countdown, 10_000).event).toBeNull();
  });

  it("cancels silently when the run is over", () => {
    const start = startResumeCountdown(IDLE_COUNTDOWN, 0);
    const over = advanceResumeCountdown(start.countdown, STEP, { gameOver: true });
    expect(over.event).toBeNull();
    expect(over.countdown).toEqual(IDLE_COUNTDOWN);
    expect(over.nextInMs).toBeNull();
  });

  it("finishes early with go, and is a no-op when idle", () => {
    const start = startResumeCountdown(IDLE_COUNTDOWN, 0);
    expect(finishResumeCountdown(start.countdown).event).toEqual({ type: "go" });
    expect(finishResumeCountdown(IDLE_COUNTDOWN).event).toBeNull();
  });
});

describe("resume countdown driver", () => {
  let events: (ResumeCountdownEvent | { type: "go"; source: ResumeGoSource })[];
  let gameOver = false;

  beforeEach(() => {
    vi.useFakeTimers();
    events = [];
    gameOver = false;
  });
  afterEach(() => vi.useRealTimers());

  const advance = (ms: number) => vi.advanceTimersByTime(ms);

  const makeDriver = () =>
    createResumeCountdownDriver({
      onDigit: (digit) => events.push({ type: "digit", digit }),
      onGo: (source) => events.push({ type: "go", source }),
      isGameOver: () => gameOver,
      // Fake timers move Date with them, so timers fire at their own time.
      now: () => Date.now(),
    });

  it("emits one event per digit, then go after the total", () => {
    const driver = makeDriver();
    driver.start();
    expect(driver.digit()).toBe(3);
    advance(RESUME_COUNTDOWN_TOTAL_MS - 1);
    expect(events).toEqual([
      { type: "digit", digit: 3 },
      { type: "digit", digit: 2 },
      { type: "digit", digit: 1 },
    ]);
    expect(driver.isRunning()).toBe(true);
    advance(1);
    expect(events.at(-1)).toEqual({ type: "go", source: "countdown" });
    expect(driver.isRunning()).toBe(false);
    expect(driver.digit()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancel drops the pending timer and emits nothing", () => {
    const driver = makeDriver();
    driver.start();
    advance(STEP);
    driver.cancel();
    advance(5000);
    expect(events).toEqual([
      { type: "digit", digit: 3 },
      { type: "digit", digit: 2 },
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a double start keeps one count and one timer", () => {
    const driver = makeDriver();
    driver.start();
    advance(100);
    driver.start();
    expect(vi.getTimerCount()).toBe(1);
    advance(RESUME_COUNTDOWN_TOTAL_MS);
    expect(events.filter((e) => e.type === "digit")).toHaveLength(3);
    expect(events.filter((e) => e.type === "go")).toHaveLength(1);
  });

  it("finish resumes now with its source; a game over cancels silently", () => {
    const driver = makeDriver();
    driver.start();
    driver.finish("test");
    expect(events.at(-1)).toEqual({ type: "go", source: "test" });
    expect(vi.getTimerCount()).toBe(0);

    events = [];
    driver.start();
    gameOver = true;
    advance(RESUME_COUNTDOWN_TOTAL_MS);
    expect(events).toEqual([{ type: "digit", digit: 3 }]);
    expect(driver.isRunning()).toBe(false);
  });
});
