import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StackEvent } from "../types";
import { getAchievementRecord } from "../utils/storage";
import { PERFECT_ALIGNMENT_RUN, SPEED_DEMON_MAX_SECONDS } from "./achievements";
import { useAchievements } from "./useAchievements";

const stack = (n: number, overrides: Partial<StackEvent> = {}): StackEvent => ({
  quality: "PERFECT",
  stackCount: n,
  perfectCount: n,
  score: n * 140,
  world: 1,
  level: Math.floor(n / 3) + 1,
  streak: n,
  wasBoss: false,
  ...overrides,
});

const setup = () => {
  let now = 0;
  const onUnlock = vi.fn();
  const hook = renderHook(() =>
    useAchievements({
      onUnlock,
      monotonicNow: () => now,
      wallNow: () => 1700000000000,
    }),
  );
  return {
    hook,
    onUnlock,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

describe("useAchievements", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("unlocks live on stack, persists, and announces once", () => {
    const { hook, onUnlock } = setup();
    act(() => hook.result.current.beginRun("CLASSIC", null));
    act(() => hook.result.current.recordStack(stack(1)));

    expect(onUnlock).toHaveBeenCalledWith(["first-stack"]);
    expect(hook.result.current.record.unlocked["first-stack"]).toBe(1700000000000);
    expect(getAchievementRecord().unlocked["first-stack"]).toBe(1700000000000);

    act(() => hook.result.current.recordStack(stack(2)));
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it("finishRun returns the run's unlocks and commits lifetime exactly once", () => {
    const { hook } = setup();
    act(() => hook.result.current.beginRun("ZEN", null));
    act(() => hook.result.current.recordStack(stack(1, { streak: 0 })));
    act(() => hook.result.current.recordStack(stack(2, { streak: 0 })));

    let unlocked: readonly string[] = [];
    act(() => {
      unlocked = hook.result.current.finishRun({
        score: 280,
        world: 1,
        level: 1,
        // Zen undo lowered the count after the last stack event.
        stats: { stackCount: 1, perfectCount: 1, bestStreak: 0, scoreHistory: [140] },
      });
    });
    expect(unlocked).toEqual(["first-stack"]);
    act(() => hook.result.current.abandonRun());

    const { lifetime } = getAchievementRecord();
    expect(lifetime.totalStacks).toBe(1);
    expect(lifetime.runsPlayed).toBe(1);
    expect(lifetime.bestZenStacks).toBe(1);
  });

  it("commits an abandoned run when the next one begins", () => {
    const { hook } = setup();
    act(() => hook.result.current.beginRun("CLASSIC", "2026-11-14"));
    act(() => hook.result.current.recordStack(stack(1)));
    act(() => hook.result.current.beginRun("CLASSIC", null));

    const { lifetime } = getAchievementRecord();
    expect(lifetime.runsPlayed).toBe(1);
    expect(lifetime.dailyDates).toEqual(["2026-11-14"]);
  });

  it("excludes paused time from Speed Demon", () => {
    const { hook, onUnlock, advance } = setup();
    act(() => hook.result.current.beginRun("CLASSIC", null));
    advance(5_000);
    act(() => hook.result.current.setPaused(true));
    advance(10 * 60_000);
    act(() => hook.result.current.setPaused(false));
    advance(5_000);
    for (let n = 1; n <= 12; n += 1) {
      act(() => hook.result.current.recordStack(stack(n, { quality: "OK" })));
    }
    expect(onUnlock.mock.calls.flat(2)).toContain("speed-demon");
  });

  it("does not award Speed Demon past the time limit", () => {
    const { hook, onUnlock, advance } = setup();
    act(() => hook.result.current.beginRun("CLASSIC", null));
    advance(SPEED_DEMON_MAX_SECONDS * 1000);
    for (let n = 1; n <= 12; n += 1) {
      act(() => hook.result.current.recordStack(stack(n, { quality: "OK" })));
    }
    expect(onUnlock.mock.calls.flat(2)).not.toContain("speed-demon");
  });

  it("a Zen miss or an undo breaks the perfect run", () => {
    const { hook, onUnlock } = setup();
    act(() => hook.result.current.beginRun("ZEN", null));
    const half = PERFECT_ALIGNMENT_RUN / 2;
    let n = 0;
    for (let i = 0; i < half; i += 1) {
      n += 1;
      act(() => hook.result.current.recordStack(stack(n, { streak: 0 })));
    }
    act(() => hook.result.current.recordMiss(false));
    for (let i = 0; i < half; i += 1) {
      n += 1;
      act(() => hook.result.current.recordStack(stack(n, { streak: 0 })));
    }
    act(() => hook.result.current.recordUndo());
    for (let i = 0; i < half; i += 1) {
      n += 1;
      act(() => hook.result.current.recordStack(stack(n, { streak: 0 })));
    }
    expect(onUnlock.mock.calls.flat(2)).not.toContain("perfect-alignment");
  });

  it("ignores events outside a run and after it is committed", () => {
    const { hook, onUnlock } = setup();
    act(() => hook.result.current.recordStack(stack(1)));
    expect(onUnlock).not.toHaveBeenCalled();
    expect(
      hook.result.current.finishRun({
        score: 0,
        world: 1,
        level: 1,
        stats: { stackCount: 0, perfectCount: 0, bestStreak: 0, scoreHistory: [] },
      }),
    ).toEqual([]);
  });

  it("practice runs unlock nothing and only record the world reached", () => {
    const { hook, onUnlock } = setup();
    act(() => hook.result.current.beginRun("ZEN", null, { practice: true }));
    act(() =>
      hook.result.current.recordStack(stack(121, { world: 9, streak: 0 })),
    );
    let unlocked: readonly string[] = [];
    act(() => {
      unlocked = hook.result.current.finishRun({
        score: 140,
        world: 9,
        level: 1,
        stats: { stackCount: 121, perfectCount: 1, bestStreak: 0, scoreHistory: [140] },
      });
    });
    expect(onUnlock).not.toHaveBeenCalled();
    expect(unlocked).toEqual([]);
    const { lifetime, unlocked: stored } = getAchievementRecord();
    expect(stored).toEqual({});
    expect(lifetime.totalStacks).toBe(0);
    expect(lifetime.runsPlayed).toBe(0);
    expect(lifetime.bestWorld).toBe(9);
  });
});

