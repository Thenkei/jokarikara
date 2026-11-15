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

  describe("Zen FINISH RUN commits like a game over, not like an abandon", () => {
    // Two stacks, then an undo: the last stack event still says 2.
    const playThenUndo = (hook: ReturnType<typeof setup>["hook"]) => {
      act(() => hook.result.current.beginRun("ZEN", null));
      act(() => hook.result.current.recordStack(stack(1, { streak: 0 })));
      act(() => hook.result.current.recordStack(stack(2, { streak: 0 })));
      act(() => hook.result.current.recordUndo());
    };
    const finishedStats = {
      stackCount: 1,
      perfectCount: 1,
      bestStreak: 0,
      scoreHistory: [140],
      endReason: "finished" as const,
    };

    it("finished: one run played, totals from the authoritative RunStats", () => {
      const { hook } = setup();
      playThenUndo(hook);
      act(() => {
        hook.result.current.finishRun({ score: 140, world: 1, level: 1, stats: finishedStats });
      });
      // Main menu from the game over screen: already committed, no double count.
      act(() => hook.result.current.abandonRun());
      act(() => hook.result.current.beginRun("ZEN", null));

      const { lifetime } = getAchievementRecord();
      expect(lifetime.runsPlayed).toBe(1);
      expect(lifetime.totalStacks).toBe(1);
      expect(lifetime.totalPerfects).toBe(1);
      expect(lifetime.bestZenStacks).toBe(1);
    });

    it("abandoned (MAIN MENU) with RunStats: one run played, undo respected", () => {
      const { hook } = setup();
      playThenUndo(hook);
      act(() => hook.result.current.abandonRun({ stackCount: 1, perfectCount: 1 }));

      const { lifetime } = getAchievementRecord();
      expect(lifetime.runsPlayed).toBe(1);
      expect(lifetime.totalStacks).toBe(1);
      expect(lifetime.totalPerfects).toBe(1);
    });

    it("abandoned without stats falls back to the stack events", () => {
      const { hook } = setup();
      playThenUndo(hook);
      act(() => hook.result.current.abandonRun());

      const { lifetime } = getAchievementRecord();
      expect(lifetime.runsPlayed).toBe(1);
      expect(lifetime.totalStacks).toBe(2);
    });

    it("a finished practice run only extends the reached world", () => {
      const { hook, onUnlock } = setup();
      act(() => hook.result.current.beginRun("ZEN", null, { practice: true }));
      act(() =>
        hook.result.current.recordStack(stack(31, { streak: 0, world: 3, level: 1 })),
      );
      let unlocked: readonly string[] = ["sentinel"];
      act(() => {
        unlocked = hook.result.current.finishRun({
          score: 140,
          world: 3,
          level: 1,
          stats: { ...finishedStats, stackCount: 31, perfectCount: 1 },
        });
      });
      expect(unlocked).toEqual([]);
      expect(onUnlock).not.toHaveBeenCalled();
      const { lifetime } = getAchievementRecord();
      expect(lifetime.runsPlayed).toBe(0);
      expect(lifetime.totalStacks).toBe(0);
      expect(lifetime.bestWorld).toBe(3);
    });
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

  it("unlock() grants an event achievement once, persists it, and leaves runs alone", () => {
    const { hook, onUnlock } = setup();
    act(() => hook.result.current.unlock("curious-mind"));
    expect(onUnlock).toHaveBeenCalledWith(["curious-mind"]);
    expect(hook.result.current.record.unlocked["curious-mind"]).toBe(1700000000000);
    expect(getAchievementRecord().unlocked["curious-mind"]).toBe(1700000000000);
    expect(getAchievementRecord().lifetime.runsPlayed).toBe(0);

    act(() => hook.result.current.unlock("curious-mind"));
    expect(onUnlock).toHaveBeenCalledTimes(1);

    // A later session reads it back from storage.
    const { hook: reloaded, onUnlock: reloadedUnlock } = setup();
    expect(reloaded.result.current.record.unlocked["curious-mind"]).toBe(1700000000000);
    act(() => reloaded.result.current.unlock("curious-mind"));
    expect(reloadedUnlock).not.toHaveBeenCalled();
  });

  it("unlock() does not re-announce what another tab already unlocked", () => {
    const { hook, onUnlock } = setup();
    // Another tab writes the unlock after this one loaded its record.
    localStorage.setItem(
      "shape-stack-achievements-v1",
      JSON.stringify({ unlocked: { "curious-mind": 42 }, lifetime: {} }),
    );
    act(() => hook.result.current.unlock("curious-mind"));
    expect(onUnlock).not.toHaveBeenCalled();
    expect(hook.result.current.record.unlocked["curious-mind"]).toBe(42);
  });
});
