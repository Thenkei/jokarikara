import { describe, expect, it } from "vitest";
import type { StackEvent, StackQuality } from "../types";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_COUNT,
  ACHIEVEMENT_IDS,
  ARCHITECT_LIFETIME_STACKS,
  DAILY_DEVOTEE_DAYS,
  EMPTY_LIFETIME_STATS,
  MAX_TRACKED_DAILY_DATES,
  PERFECT_ALIGNMENT_RUN,
  SPEED_DEMON_MAX_SECONDS,
  TIME_LORD_SCORE,
  UNBROKEN_COMBO,
  ZEN_MASTER_STACKS,
  applyRunToLifetime,
  applyStack,
  breakPerfectRun,
  countUnlocked,
  createRunProgress,
  evaluate,
  getAchievement,
  isAchievementId,
  overallLevel,
  type AchievementId,
  type LifetimeStats,
  type RunProgress,
} from "./achievements";
import {
  elapsedSeconds,
  pauseStopwatch,
  resumeStopwatch,
  startStopwatch,
} from "./stopwatch";

const NONE: ReadonlySet<AchievementId> = new Set();

const lifetime = (overrides: Partial<LifetimeStats> = {}): LifetimeStats => ({
  ...EMPTY_LIFETIME_STATS,
  ...overrides,
});

const run = (overrides: Partial<RunProgress> = {}): RunProgress => ({
  ...createRunProgress("CLASSIC", null),
  ...overrides,
});

const stackEvent = (
  previous: RunProgress,
  quality: StackQuality,
  overrides: Partial<StackEvent> = {},
): StackEvent => ({
  quality,
  stackCount: previous.stackCount + 1,
  perfectCount: previous.perfectCount + (quality === "PERFECT" ? 1 : 0),
  score: previous.score + 100,
  world: previous.world,
  level: previous.level,
  streak: previous.bestStreak + 1,
  wasBoss: false,
  ...overrides,
});

/** Applies a sequence of qualities at t = 1 s each. */
const play = (start: RunProgress, qualities: StackQuality[]): RunProgress =>
  qualities.reduce(
    (acc, quality, i) => applyStack(acc, stackEvent(acc, quality), i + 1),
    start,
  );

const unlockedBy = (r: RunProgress | null, l: LifetimeStats = lifetime()) =>
  evaluate({ run: r, lifetime: l }, NONE);

describe("catalogue", () => {
  it("has ~12 achievements with unique ids matching ACHIEVEMENT_IDS", () => {
    expect(ACHIEVEMENT_COUNT).toBe(12);
    expect(ACHIEVEMENTS.map((a) => a.id)).toEqual([...ACHIEVEMENT_IDS]);
    expect(new Set(ACHIEVEMENT_IDS).size).toBe(ACHIEVEMENT_IDS.length);
  });

  it("every entry has a title and description", () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.title.trim()).not.toBe("");
      expect(a.description.trim()).not.toBe("");
      expect(getAchievement(a.id)).toBe(a);
    }
  });

  it("isAchievementId guards unknown values", () => {
    expect(isAchievementId("first-stack")).toBe(true);
    expect(isAchievementId("nope")).toBe(false);
    expect(isAchievementId(42)).toBe(false);
  });

  it("countUnlocked ignores ids outside the catalogue", () => {
    expect(
      countUnlocked({ "first-stack": 1, ["legacy" as AchievementId]: 2 }),
    ).toBe(1);
  });

  it("nothing unlocks on an empty run with empty lifetime", () => {
    expect(unlockedBy(run())).toEqual([]);
    expect(unlockedBy(null)).toEqual([]);
  });
});

describe("evaluate", () => {
  it("unlocks First Stack on the first stack", () => {
    expect(unlockedBy(play(run(), ["OK"]))).toContain("first-stack");
  });

  it("is idempotent: already unlocked ids are never returned again", () => {
    const r = play(run(), ["OK"]);
    expect(evaluate({ run: r, lifetime: lifetime() }, new Set(["first-stack"]))).toEqual(
      [],
    );
  });

  it("returns ids in catalogue order", () => {
    const r = run({ stackCount: 15, world: 2, bestStreak: UNBROKEN_COMBO });
    const ids = unlockedBy(r);
    const order = ids.map((id) => ACHIEVEMENT_IDS.indexOf(id));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("treats a throwing predicate as locked", () => {
    const broken = { run: null, lifetime: null as unknown as LifetimeStats };
    expect(() => evaluate(broken, NONE)).not.toThrow();
  });

  describe("Perfect Alignment", () => {
    it("needs PERFECT_ALIGNMENT_RUN consecutive perfects", () => {
      const almost = play(run(), Array(PERFECT_ALIGNMENT_RUN - 1).fill("PERFECT"));
      expect(unlockedBy(almost)).not.toContain("perfect-alignment");
      const done = play(almost, ["PERFECT"]);
      expect(unlockedBy(done)).toContain("perfect-alignment");
    });

    it("a non-perfect stack resets the counter even though the combo continues", () => {
      const half = PERFECT_ALIGNMENT_RUN / 2;
      const r = play(run(), [
        ...Array(half).fill("PERFECT"),
        "GREAT",
        ...Array(PERFECT_ALIGNMENT_RUN - 1).fill("PERFECT"),
      ]);
      expect(r.bestStreak).toBeGreaterThanOrEqual(PERFECT_ALIGNMENT_RUN);
      expect(r.bestConsecutivePerfects).toBe(PERFECT_ALIGNMENT_RUN - 1);
      expect(unlockedBy(r)).not.toContain("perfect-alignment");
    });

    it("a Zen miss or an undo breaks the run", () => {
      const r = play(run({ mode: "ZEN" }), Array(5).fill("PERFECT"));
      const broken = play(breakPerfectRun(r), Array(5).fill("PERFECT"));
      expect(broken.bestConsecutivePerfects).toBe(5);
      expect(unlockedBy(broken)).not.toContain("perfect-alignment");
    });
  });

  it("Unbroken needs a x25 combo", () => {
    expect(unlockedBy(run({ bestStreak: UNBROKEN_COMBO - 1 }))).not.toContain("unbroken");
    expect(unlockedBy(run({ bestStreak: UNBROKEN_COMBO }))).toContain("unbroken");
  });

  it.each([
    [2, "world-2"],
    [3, "world-3"],
    [5, "world-5"],
  ] as const)("reaching World %i unlocks %s (and lower worlds)", (world, id) => {
    const ids = unlockedBy(run({ world }));
    expect(ids).toContain(id);
    if (world > 2) expect(ids).toContain("world-2");
    expect(unlockedBy(run({ world: world - 1 }))).not.toContain(id);
  });

  describe("Speed Demon", () => {
    const reachLevel5 = (seconds: number) => {
      let r = run();
      for (let stack = 1; stack <= 12; stack += 1) {
        const level = Math.floor(stack / 3) + 1;
        r = applyStack(r, stackEvent(r, "GOOD", { level }), (seconds * stack) / 12);
      }
      return r;
    };

    it("records the split when level 5 is first reached", () => {
      const r = reachLevel5(SPEED_DEMON_MAX_SECONDS - 1);
      expect(r.speedSplitSeconds).toBeCloseTo(SPEED_DEMON_MAX_SECONDS - 1);
      expect(unlockedBy(r)).toContain("speed-demon");
    });

    it("does not unlock at or above the time limit", () => {
      expect(unlockedBy(reachLevel5(SPEED_DEMON_MAX_SECONDS))).not.toContain(
        "speed-demon",
      );
    });

    it("keeps the first split (later stacks do not overwrite it)", () => {
      const r = reachLevel5(10);
      const later = applyStack(r, stackEvent(r, "OK", { level: 5 }), 999);
      expect(later.speedSplitSeconds).toBeCloseTo(10);
    });

    it("counts levels across worlds", () => {
      expect(overallLevel(1, 5)).toBe(5);
      expect(overallLevel(2, 1)).toBe(6);
    });
  });

  it("Giant Slayer unlocks after a boss stack", () => {
    const r = applyStack(run(), stackEvent(run(), "OK", { wasBoss: true }), 1);
    expect(r.bossStacksCleared).toBe(1);
    expect(unlockedBy(r)).toContain("giant-slayer");
  });

  it("Zen Master needs 30 stacks in a Zen run only", () => {
    expect(unlockedBy(run({ mode: "ZEN", stackCount: ZEN_MASTER_STACKS }))).toContain(
      "zen-master",
    );
    expect(
      unlockedBy(run({ mode: "ZEN", stackCount: ZEN_MASTER_STACKS - 1 })),
    ).not.toContain("zen-master");
    expect(
      unlockedBy(run({ mode: "CLASSIC", stackCount: ZEN_MASTER_STACKS })),
    ).not.toContain("zen-master");
  });

  it("Time Lord needs the score in Time Attack only", () => {
    expect(unlockedBy(run({ mode: "TIME_ATTACK", score: TIME_LORD_SCORE }))).toContain(
      "time-lord",
    );
    expect(
      unlockedBy(run({ mode: "TIME_ATTACK", score: TIME_LORD_SCORE - 1 })),
    ).not.toContain("time-lord");
    expect(unlockedBy(run({ mode: "CLASSIC", score: TIME_LORD_SCORE }))).not.toContain(
      "time-lord",
    );
  });

  describe("Daily Devotee", () => {
    const twoDays = lifetime({ dailyDates: ["2026-11-01", "2026-11-02"] });

    it("counts the current Daily run's date", () => {
      expect(unlockedBy(run({ dailyKey: "2026-11-03" }), twoDays)).toContain(
        "daily-devotee",
      );
    });

    it("does not count the same date twice", () => {
      expect(unlockedBy(run({ dailyKey: "2026-11-02" }), twoDays)).not.toContain(
        "daily-devotee",
      );
      expect(unlockedBy(run(), twoDays)).not.toContain("daily-devotee");
    });

    it("unlocks from lifetime alone once 3 dates are recorded", () => {
      const three = lifetime({ dailyDates: ["2026-11-01", "2026-11-02", "2026-11-03"] });
      expect(unlockedBy(null, three)).toContain("daily-devotee");
      expect(DAILY_DEVOTEE_DAYS).toBe(3);
    });
  });

  it("Architect sums lifetime stacks and the run in progress", () => {
    const l = lifetime({ totalStacks: ARCHITECT_LIFETIME_STACKS - 5 });
    expect(unlockedBy(run({ stackCount: 4 }), l)).not.toContain("architect");
    expect(unlockedBy(run({ stackCount: 5 }), l)).toContain("architect");
  });
});

describe("progress", () => {
  const progressOf = (id: AchievementId, l: LifetimeStats) =>
    getAchievement(id).progress?.({ run: null, lifetime: l });

  it("reports capped lifetime progress for counters", () => {
    expect(progressOf("architect", lifetime({ totalStacks: 120 }))).toEqual({
      current: 120,
      target: ARCHITECT_LIFETIME_STACKS,
    });
    expect(progressOf("perfect-alignment", lifetime({ bestPerfectRun: 99 }))).toEqual({
      current: PERFECT_ALIGNMENT_RUN,
      target: PERFECT_ALIGNMENT_RUN,
    });
    expect(progressOf("daily-devotee", lifetime({ dailyDates: ["2026-01-01"] }))).toEqual(
      { current: 1, target: DAILY_DEVOTEE_DAYS },
    );
  });

  it("has no progress for one-shot achievements", () => {
    expect(progressOf("speed-demon", lifetime())).toBeUndefined();
    expect(progressOf("world-2", lifetime())).toBeUndefined();
  });
});

describe("applyRunToLifetime", () => {
  it("adds counters and keeps bests", () => {
    const before = lifetime({
      totalStacks: 10,
      totalPerfects: 2,
      runsPlayed: 1,
      bestCombo: 30,
      bestPerfectRun: 1,
    });
    const r = run({
      stackCount: 5,
      perfectCount: 3,
      bestStreak: 5,
      bestConsecutivePerfects: 3,
      bossStacksCleared: 1,
    });
    expect(applyRunToLifetime(before, r)).toMatchObject({
      totalStacks: 15,
      totalPerfects: 5,
      runsPlayed: 2,
      bossStacksCleared: 1,
      bestCombo: 30,
      bestPerfectRun: 3,
      bestZenStacks: 0,
      bestTimeAttackScore: 0,
    });
  });

  it("tracks mode bests only for their mode", () => {
    const zen = applyRunToLifetime(lifetime(), run({ mode: "ZEN", stackCount: 12 }));
    expect(zen.bestZenStacks).toBe(12);
    const ta = applyRunToLifetime(lifetime(), run({ mode: "TIME_ATTACK", score: 900 }));
    expect(ta.bestTimeAttackScore).toBe(900);
    expect(ta.bestZenStacks).toBe(0);
  });

  it("records distinct, sorted, bounded Daily dates", () => {
    const once = applyRunToLifetime(lifetime(), run({ dailyKey: "2026-11-02" }));
    const twice = applyRunToLifetime(once, run({ dailyKey: "2026-11-02" }));
    const third = applyRunToLifetime(twice, run({ dailyKey: "2026-11-01" }));
    expect(third.dailyDates).toEqual(["2026-11-01", "2026-11-02"]);

    const full = lifetime({
      dailyDates: Array.from({ length: MAX_TRACKED_DAILY_DATES }, (_, i) =>
        new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
      ),
    });
    const next = applyRunToLifetime(full, run({ dailyKey: "2999-01-01" }));
    expect(next.dailyDates).toHaveLength(MAX_TRACKED_DAILY_DATES);
    expect(next.dailyDates[0]).toBe("2020-01-02");
    expect(next.dailyDates.at(-1)).toBe("2999-01-01");
  });

  it("does not mutate its inputs", () => {
    const before = lifetime({ dailyDates: ["2026-11-01"] });
    const frozen = Object.freeze({ ...before, dailyDates: Object.freeze([...before.dailyDates]) });
    expect(() =>
      applyRunToLifetime(frozen, run({ dailyKey: "2026-11-02", stackCount: 1 })),
    ).not.toThrow();
    expect(frozen.dailyDates).toEqual(["2026-11-01"]);
  });
});

describe("stopwatch", () => {
  it("measures active time and excludes paused time", () => {
    let watch = startStopwatch(1_000);
    expect(elapsedSeconds(watch, 6_000)).toBe(5);
    watch = pauseStopwatch(watch, 6_000);
    expect(elapsedSeconds(watch, 60_000)).toBe(5);
    watch = resumeStopwatch(watch, 60_000);
    expect(elapsedSeconds(watch, 62_000)).toBe(7);
  });

  it("pause and resume are idempotent", () => {
    const watch = pauseStopwatch(startStopwatch(0), 1_000);
    expect(pauseStopwatch(watch, 5_000)).toBe(watch);
    const resumed = resumeStopwatch(watch, 2_000);
    expect(resumeStopwatch(resumed, 9_000)).toBe(resumed);
    expect(elapsedSeconds(resumed, 3_000)).toBe(2);
  });

  it("never goes negative", () => {
    expect(elapsedSeconds(startStopwatch(5_000), 1_000)).toBe(0);
  });
});
