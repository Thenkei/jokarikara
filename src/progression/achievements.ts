import type { GameMode, StackEvent } from "../types";
import { LEVELS_PER_WORLD } from "../constants/game";

/**
 * Achievements: a static catalogue plus pure evaluation.
 *
 * Every predicate is a function of (current run, lifetime stats committed
 * BEFORE this run). Keeping the run out of `lifetime` until it is committed
 * means the same evaluation works live (mid-run) and at game over without
 * double counting, and makes evaluation idempotent: re-evaluating the same
 * snapshot never unlocks anything new.
 */

// ---------------------------------------------------------------------------
// Thresholds (balance knobs)
// ---------------------------------------------------------------------------

export const PERFECT_ALIGNMENT_RUN = 10;
export const UNBROKEN_COMBO = 25;
export const SPEED_DEMON_LEVEL = 5;
export const SPEED_DEMON_MAX_SECONDS = 30;
export const ZEN_MASTER_STACKS = 30;
export const TIME_LORD_SCORE = 3000;
export const DAILY_DEVOTEE_DAYS = 3;
export const ARCHITECT_LIFETIME_STACKS = 1000;

/** Bounded so a years-long player never bloats the stored record. */
export const MAX_TRACKED_DAILY_DATES = 366;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const ACHIEVEMENT_IDS = [
  "first-stack",
  "perfect-alignment",
  "unbroken",
  "world-2",
  "world-3",
  "world-5",
  "speed-demon",
  "giant-slayer",
  "zen-master",
  "time-lord",
  "daily-devotee",
  "architect",
  "curious-mind",
] as const;

export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

const ACHIEVEMENT_ID_SET: ReadonlySet<string> = new Set(ACHIEVEMENT_IDS);

export const isAchievementId = (value: unknown): value is AchievementId =>
  typeof value === "string" && ACHIEVEMENT_ID_SET.has(value);

/** What we know about the run in progress (or just finished). */
export interface RunProgress {
  mode: GameMode;
  /** Local date key (YYYY-MM-DD) of a Daily Challenge run, null otherwise. */
  dailyKey: string | null;
  stackCount: number;
  perfectCount: number;
  score: number;
  world: number;
  /** Level within the current world (1..LEVELS_PER_WORLD). */
  level: number;
  /** Current run of consecutive PERFECT stacks (a streak counts any quality). */
  consecutivePerfects: number;
  bestConsecutivePerfects: number;
  /** Best combo; always 0 in Zen, which has no combo. */
  bestStreak: number;
  bossStacksCleared: number;
  /**
   * Active (unpaused) play seconds at which SPEED_DEMON_LEVEL was first
   * reached, null if not reached yet.
   */
  speedSplitSeconds: number | null;
}

/** Persistent cross-run counters. Never includes the run in progress. */
export interface LifetimeStats {
  totalStacks: number;
  totalPerfects: number;
  runsPlayed: number;
  bossStacksCleared: number;
  bestPerfectRun: number;
  bestCombo: number;
  bestZenStacks: number;
  bestTimeAttackScore: number;
  /** Distinct Daily Challenge dates played, sorted ascending, bounded. */
  dailyDates: readonly string[];
  /** Highest world ever reached (any run, practice included). Min 1. */
  bestWorld: number;
}

export interface AchievementContext {
  run: RunProgress | null;
  lifetime: LifetimeStats;
}

export interface AchievementProgress {
  current: number;
  target: number;
}

export interface AchievementDefinition {
  id: AchievementId;
  title: string;
  description: string;
  /**
   * Secret: listed as "???" with `HIDDEN_ACHIEVEMENT_TEXT` until unlocked, so
   * the panel never hints at how to get it. Still counted in the total.
   */
  hidden?: boolean;
  /**
   * Run predicate. Event-driven achievements (unlocked through
   * `grantAchievement`, e.g. an easter egg) never match here.
   */
  isUnlocked: (ctx: AchievementContext) => boolean;
  /** Cheap progress hint for the list panel (best so far vs target). */
  progress?: (ctx: AchievementContext) => AchievementProgress;
}

export const EMPTY_LIFETIME_STATS: LifetimeStats = Object.freeze({
  totalStacks: 0,
  totalPerfects: 0,
  runsPlayed: 0,
  bossStacksCleared: 0,
  bestPerfectRun: 0,
  bestCombo: 0,
  bestZenStacks: 0,
  bestTimeAttackScore: 0,
  dailyDates: Object.freeze([]) as readonly string[],
  bestWorld: 1,
});

export const createRunProgress = (
  mode: GameMode,
  dailyKey: string | null,
): RunProgress => ({
  mode,
  dailyKey,
  stackCount: 0,
  perfectCount: 0,
  score: 0,
  world: 1,
  level: 1,
  consecutivePerfects: 0,
  bestConsecutivePerfects: 0,
  bestStreak: 0,
  bossStacksCleared: 0,
  speedSplitSeconds: null,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 1-based level across worlds (World 2 Level 1 = 6 with 5 levels/world). */
export const overallLevel = (world: number, level: number): number =>
  (world - 1) * LEVELS_PER_WORLD + level;

const mergeDailyDates = (
  dates: readonly string[],
  dailyKey: string | null,
): readonly string[] => {
  if (dailyKey === null || dates.includes(dailyKey)) return dates;
  return [...dates, dailyKey].sort().slice(-MAX_TRACKED_DAILY_DATES);
};

const runValue = (
  ctx: AchievementContext,
  pick: (run: RunProgress) => number,
): number => (ctx.run ? pick(ctx.run) : 0);

const capped = (current: number, target: number): AchievementProgress => ({
  current: Math.min(Math.max(0, Math.floor(current)), target),
  target,
});

const worldAchievement = (
  id: AchievementId,
  world: number,
  title: string,
): AchievementDefinition => ({
  id,
  title,
  description: `Reach World ${world}.`,
  isUnlocked: (ctx) => runValue(ctx, (r) => r.world) >= world,
});

const zenStacks = (ctx: AchievementContext): number =>
  ctx.run?.mode === "ZEN" ? ctx.run.stackCount : 0;

const timeAttackScore = (ctx: AchievementContext): number =>
  ctx.run?.mode === "TIME_ATTACK" ? ctx.run.score : 0;

const distinctDailyDays = (ctx: AchievementContext): number =>
  mergeDailyDates(ctx.lifetime.dailyDates, ctx.run?.dailyKey ?? null).length;

const lifetimeStacks = (ctx: AchievementContext): number =>
  ctx.lifetime.totalStacks + runValue(ctx, (r) => r.stackCount);

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export const ACHIEVEMENTS: readonly AchievementDefinition[] = Object.freeze([
  {
    id: "first-stack",
    title: "First Stack",
    description: "Land your first shape.",
    isUnlocked: (ctx) => lifetimeStacks(ctx) >= 1,
  },
  {
    id: "perfect-alignment",
    title: "Perfect Alignment",
    description: `Land ${PERFECT_ALIGNMENT_RUN} PERFECT stacks in a row.`,
    isUnlocked: (ctx) =>
      runValue(ctx, (r) => r.bestConsecutivePerfects) >= PERFECT_ALIGNMENT_RUN,
    progress: (ctx) =>
      capped(
        Math.max(
          ctx.lifetime.bestPerfectRun,
          runValue(ctx, (r) => r.bestConsecutivePerfects),
        ),
        PERFECT_ALIGNMENT_RUN,
      ),
  },
  {
    id: "unbroken",
    title: "Unbroken",
    description: `Reach a x${UNBROKEN_COMBO} combo.`,
    isUnlocked: (ctx) => runValue(ctx, (r) => r.bestStreak) >= UNBROKEN_COMBO,
    progress: (ctx) =>
      capped(
        Math.max(ctx.lifetime.bestCombo, runValue(ctx, (r) => r.bestStreak)),
        UNBROKEN_COMBO,
      ),
  },
  worldAchievement("world-2", 2, "New Horizons"),
  worldAchievement("world-3", 3, "Fault Lines"),
  worldAchievement("world-5", 5, "Prismatic"),
  {
    id: "speed-demon",
    title: "Speed Demon",
    description: `Reach level ${SPEED_DEMON_LEVEL} in under ${SPEED_DEMON_MAX_SECONDS} seconds of play.`,
    isUnlocked: (ctx) =>
      ctx.run?.speedSplitSeconds != null &&
      ctx.run.speedSplitSeconds < SPEED_DEMON_MAX_SECONDS,
  },
  {
    id: "giant-slayer",
    title: "Giant Slayer",
    description: "Successfully stack a boss shape.",
    isUnlocked: (ctx) =>
      ctx.lifetime.bossStacksCleared + runValue(ctx, (r) => r.bossStacksCleared) >= 1,
  },
  {
    id: "zen-master",
    title: "Zen Master",
    description: `Stack ${ZEN_MASTER_STACKS} shapes in a single Zen run.`,
    isUnlocked: (ctx) => zenStacks(ctx) >= ZEN_MASTER_STACKS,
    progress: (ctx) =>
      capped(
        Math.max(ctx.lifetime.bestZenStacks, zenStacks(ctx)),
        ZEN_MASTER_STACKS,
      ),
  },
  {
    id: "time-lord",
    title: "Time Lord",
    description: `Score ${TIME_LORD_SCORE} points in Time Attack.`,
    isUnlocked: (ctx) => timeAttackScore(ctx) >= TIME_LORD_SCORE,
    progress: (ctx) =>
      capped(
        Math.max(ctx.lifetime.bestTimeAttackScore, timeAttackScore(ctx)),
        TIME_LORD_SCORE,
      ),
  },
  {
    id: "daily-devotee",
    title: "Daily Devotee",
    description: `Play the Daily Challenge on ${DAILY_DEVOTEE_DAYS} different days.`,
    isUnlocked: (ctx) => distinctDailyDays(ctx) >= DAILY_DEVOTEE_DAYS,
    progress: (ctx) => capped(distinctDailyDays(ctx), DAILY_DEVOTEE_DAYS),
  },
  {
    id: "architect",
    title: "Architect",
    description: `Stack ${ARCHITECT_LIFETIME_STACKS} shapes in total.`,
    isUnlocked: (ctx) => lifetimeStacks(ctx) >= ARCHITECT_LIFETIME_STACKS,
    progress: (ctx) => capped(lifetimeStacks(ctx), ARCHITECT_LIFETIME_STACKS),
  },
  {
    id: "curious-mind",
    title: "Curious Mind",
    description: "Found one of the start screen's secrets.",
    hidden: true,
    // Event-driven: granted by the start screen, never by a run.
    isUnlocked: () => false,
  },
] satisfies AchievementDefinition[]);

/** What a hidden achievement shows until it is unlocked (no hints). */
export const HIDDEN_ACHIEVEMENT_TEXT = Object.freeze({
  title: "???",
  description: "A hidden achievement.",
});

/** Unlocked by an event outside runs (see `grantAchievement`). */
export const SECRET_ACHIEVEMENT_ID: AchievementId = "curious-mind";

export const ACHIEVEMENT_COUNT = ACHIEVEMENTS.length;

const BY_ID: ReadonlyMap<AchievementId, AchievementDefinition> = new Map(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

/** Unlocked achievements still in the catalogue. */
export const countUnlocked = (
  unlocked: Partial<Record<AchievementId, number>>,
): number => ACHIEVEMENTS.filter((a) => unlocked[a.id] !== undefined).length;

export const getAchievement = (id: AchievementId): AchievementDefinition => {
  const definition = BY_ID.get(id);
  // Unreachable while ACHIEVEMENT_IDS and ACHIEVEMENTS stay in sync (tested).
  if (!definition) throw new Error(`Unknown achievement: ${id}`);
  return definition;
};

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * Ids satisfied by `ctx` that are not in `alreadyUnlocked`, in catalogue
 * order. Pure; a predicate that throws is treated as "not unlocked" so a
 * single bad rule can never break the game loop.
 */
export const evaluate = (
  ctx: AchievementContext,
  alreadyUnlocked: ReadonlySet<AchievementId>,
): AchievementId[] =>
  ACHIEVEMENTS.filter((achievement) => {
    if (alreadyUnlocked.has(achievement.id)) return false;
    try {
      return achievement.isUnlocked(ctx);
    } catch {
      return false;
    }
  }).map((achievement) => achievement.id);

/**
 * Event unlock (outside run evaluation). Pure: returns the unlocked map with
 * `id` stamped at `at`, or `null` when it was already unlocked (first unlock
 * wins, so the timestamp keeps its audit value).
 */
export const grantAchievement = (
  unlocked: Partial<Record<AchievementId, number>>,
  id: AchievementId,
  at: number,
): Partial<Record<AchievementId, number>> | null =>
  unlocked[id] !== undefined ? null : { ...unlocked, [id]: at };

// ---------------------------------------------------------------------------
// Run reducers
// ---------------------------------------------------------------------------

/** Fold one successful stack into the run, given active play time so far. */
export const applyStack = (
  run: RunProgress,
  stack: StackEvent,
  elapsedSeconds: number,
): RunProgress => {
  const consecutivePerfects =
    stack.quality === "PERFECT" ? run.consecutivePerfects + 1 : 0;
  const reachedSpeedLevel =
    overallLevel(stack.world, stack.level) >= SPEED_DEMON_LEVEL;
  return {
    ...run,
    stackCount: stack.stackCount,
    perfectCount: stack.perfectCount,
    score: stack.score,
    world: stack.world,
    level: stack.level,
    consecutivePerfects,
    bestConsecutivePerfects: Math.max(
      run.bestConsecutivePerfects,
      consecutivePerfects,
    ),
    bestStreak: Math.max(run.bestStreak, stack.streak),
    bossStacksCleared: run.bossStacksCleared + (stack.wasBoss ? 1 : 0),
    speedSplitSeconds:
      run.speedSplitSeconds ??
      (reachedSpeedLevel ? Math.max(0, elapsedSeconds) : null),
  };
};

/**
 * A non-terminal miss (Zen) or an undo breaks a PERFECT run. Undo also
 * resets it so a run cannot be "repaired" into 10 in a row.
 */
export const breakPerfectRun = (run: RunProgress): RunProgress =>
  run.consecutivePerfects === 0 ? run : { ...run, consecutivePerfects: 0 };

/** Fold a finished (or abandoned) run into the lifetime counters. */
export const applyRunToLifetime = (
  lifetime: LifetimeStats,
  run: RunProgress,
): LifetimeStats => ({
  totalStacks: lifetime.totalStacks + run.stackCount,
  totalPerfects: lifetime.totalPerfects + run.perfectCount,
  runsPlayed: lifetime.runsPlayed + 1,
  bossStacksCleared: lifetime.bossStacksCleared + run.bossStacksCleared,
  bestPerfectRun: Math.max(lifetime.bestPerfectRun, run.bestConsecutivePerfects),
  bestCombo: Math.max(lifetime.bestCombo, run.bestStreak),
  bestZenStacks: Math.max(
    lifetime.bestZenStacks,
    run.mode === "ZEN" ? run.stackCount : 0,
  ),
  bestTimeAttackScore: Math.max(
    lifetime.bestTimeAttackScore,
    run.mode === "TIME_ATTACK" ? run.score : 0,
  ),
  dailyDates: mergeDailyDates(lifetime.dailyDates, run.dailyKey),
  bestWorld: Math.max(lifetime.bestWorld, run.world),
});

/**
 * Practice runs (Zen started past world 1) begin with a synthetic stack count,
 * so they must not feed totals, bests or achievements. They only extend the
 * set of worlds available for practice.
 */
export const applyPracticeRunToLifetime = (
  lifetime: LifetimeStats,
  run: RunProgress,
): LifetimeStats => ({
  ...lifetime,
  bestWorld: Math.max(lifetime.bestWorld, run.world),
});
