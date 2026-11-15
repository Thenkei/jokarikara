import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  advanceWorldIntroHold,
  FIRST_VISIT_GRACE_MS,
  FIRST_VISIT_MAX_HOLD_MS,
  shouldTeachWorld,
  IDLE_HOLD,
  isWorldIntroHolding,
  releaseWorldIntroHold,
  startWorldIntroHold,
  tapWorldIntroHold,
  WORLD_INTRO_MS,
} from "./worldIntro";
import { createWorldIntroHoldDriver } from "./useWorldIntroHold";

describe("shouldTeachWorld", () => {
  it("teaches a world above the lifetime best", () => {
    expect(shouldTeachWorld(2, 1)).toBe(true);
    expect(shouldTeachWorld(9, 8)).toBe(true);
    // A run can cross several new worlds; each one is above the best.
    expect(shouldTeachWorld(3, 1)).toBe(true);
  });

  it("keeps the short overlay for worlds already reached", () => {
    expect(shouldTeachWorld(2, 5)).toBe(false);
    expect(shouldTeachWorld(5, 5)).toBe(false);
  });

  it("never teaches world 1 (the first-run hint covers it)", () => {
    expect(shouldTeachWorld(1, 0)).toBe(false);
    expect(shouldTeachWorld(1, 1)).toBe(false);
  });

  it("practice from a reached world only teaches beyond the best world", () => {
    // Practice starts at most at the best world (here 6, picked 4).
    for (let world = 4; world <= 6; world += 1) {
      expect(shouldTeachWorld(world, 6)).toBe(false);
    }
    expect(shouldTeachWorld(7, 6)).toBe(true);
  });

  it("does not re-teach a world taught earlier in the run", () => {
    // The caller raises taughtThrough to each world it taught.
    expect(shouldTeachWorld(3, 3)).toBe(false);
  });

  it("ignores worlds past the last configured one and bad input", () => {
    expect(shouldTeachWorld(11, 10)).toBe(false);
    expect(shouldTeachWorld(Number.NaN, 1)).toBe(false);
    expect(shouldTeachWorld(2.5, 1)).toBe(false);
  });
});

describe("world intro hold", () => {
  it("holds the board for longer than the short overlay", () => {
    expect(FIRST_VISIT_MAX_HOLD_MS).toBeGreaterThanOrEqual(WORLD_INTRO_MS + 2000);
    expect(FIRST_VISIT_GRACE_MS).toBeLessThan(1000);
  });

  it("starts holding with the max wait scheduled", () => {
    const step = startWorldIntroHold(3, 1000);
    expect(step.hold).toEqual({
      phase: "holding",
      world: 3,
      startedAt: 1000,
      maxHoldMs: FIRST_VISIT_MAX_HOLD_MS,
    });
    expect(step.nextInMs).toBe(FIRST_VISIT_MAX_HOLD_MS);
    expect(step.released).toBeNull();
    expect(isWorldIntroHolding(step.hold)).toBe(true);
  });

  it("honours an overridden max wait (E2E bridge)", () => {
    const { hold, nextInMs } = startWorldIntroHold(2, 0, 60_000);
    expect(nextInMs).toBe(60_000);
    expect(advanceWorldIntroHold(hold, FIRST_VISIT_MAX_HOLD_MS).released).toBeNull();
    expect(advanceWorldIntroHold(hold, 60_000).released).toBe("timeout");
  });

  it("lets taps play when not holding", () => {
    expect(tapWorldIntroHold(IDLE_HOLD, 0).tap).toBe("play");
  });

  it("swallows taps during the grace period, then a tap dismisses", () => {
    const { hold } = startWorldIntroHold(2, 1000);
    const early = tapWorldIntroHold(hold, 1000 + FIRST_VISIT_GRACE_MS - 1);
    expect(early.tap).toBe("ignored");
    expect(early.hold).toBe(hold);
    expect(early.released).toBeNull();

    const late = tapWorldIntroHold(hold, 1000 + FIRST_VISIT_GRACE_MS);
    expect(late.tap).toBe("dismissed");
    expect(late.released).toBe("tap");
    expect(isWorldIntroHolding(late.hold)).toBe(false);
  });

  it("times out after the max wait; an early timer reschedules", () => {
    const { hold } = startWorldIntroHold(2, 0);
    const early = advanceWorldIntroHold(hold, FIRST_VISIT_MAX_HOLD_MS - 100);
    expect(early.released).toBeNull();
    expect(early.nextInMs).toBe(100);
    // A throttled tab firing late releases at once.
    const late = advanceWorldIntroHold(hold, FIRST_VISIT_MAX_HOLD_MS * 3);
    expect(late.released).toBe("timeout");
    expect(late.hold).toBe(IDLE_HOLD);
    expect(advanceWorldIntroHold(IDLE_HOLD, 0).released).toBeNull();
  });

  it("releases for pause / board / test, and is a no-op when idle", () => {
    const { hold } = startWorldIntroHold(2, 0);
    expect(releaseWorldIntroHold(hold, "pause").released).toBe("pause");
    expect(releaseWorldIntroHold(hold, "board").released).toBe("board");
    expect(releaseWorldIntroHold(IDLE_HOLD, "pause").released).toBeNull();
  });
});

describe("world intro hold driver", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  });
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const onHold = vi.fn();
    const onRelease = vi.fn();
    const driver = createWorldIntroHoldDriver({ onHold, onRelease });
    return { driver, onHold, onRelease };
  };

  it("holds until the max wait, then releases once", () => {
    const { driver, onHold, onRelease } = setup();
    driver.start(4);
    expect(onHold).toHaveBeenCalledWith(4);
    expect(driver.isHolding()).toBe(true);
    expect(driver.world()).toBe(4);
    vi.advanceTimersByTime(FIRST_VISIT_MAX_HOLD_MS - 1);
    expect(onRelease).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onRelease).toHaveBeenCalledExactlyOnceWith("timeout");
    expect(driver.isHolding()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a tap after the grace dismisses; one during it is swallowed", () => {
    const { driver, onRelease } = setup();
    driver.start(2);
    expect(driver.tap()).toBe("ignored");
    vi.advanceTimersByTime(FIRST_VISIT_GRACE_MS);
    expect(driver.tap()).toBe("dismissed");
    expect(onRelease).toHaveBeenCalledExactlyOnceWith("tap");
    expect(driver.tap()).toBe("play");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancel drops the hold silently; release reports its reason", () => {
    const { driver, onRelease } = setup();
    driver.start(2);
    driver.cancel();
    expect(onRelease).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    driver.start(3);
    driver.release("pause");
    expect(onRelease).toHaveBeenCalledExactlyOnceWith("pause");
    // Nothing to release any more.
    driver.release("board");
    expect(onRelease).toHaveBeenCalledTimes(1);
  });
});
