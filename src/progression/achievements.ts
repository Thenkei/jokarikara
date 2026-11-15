import type { GameMode, StackEvent } from "../types";
import { LEVELS_PER_WORLD } from "../constants/game";
import { MEDAL_THRESHOLDS } from "../modes/medals";
import type { Translator } from "../i18n";

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
/** Same bar as the Time Attack gold medal (single source: medals.ts). */
export const GOLD_RUSH_SCORE = MEDAL_THRESHOLDS.GOLD;
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
  "gold-rush",
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

/**
 * Title and description come from the catalog (`achievement.<id>.title` /
 * `.description`, see `getAchievementText`); the definition only holds rules
 * and the numbers its description quotes.
 */
export interface AchievementDefinition {
  id: AchievementId;
  /** Values for the description's placeholders (thresholds, world...). */
  descriptionParams?: Readonly<Record<string, number>>;
  /**
   * Secret: listed as "???" with the hidden text until unlocked, so the panel
   * never hints at how to get it. Still counted in the total.
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

const worldAchievement = (id: AchievementId, world: number): AchievementDefinition => ({
  id,
  descriptionParams: { world },
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
    isUnlocked: (ctx) => lifetimeStacks(ctx) >= 1,
  },
  {
    id: "perfect-alignment",
    descriptionParams: { count: PERFECT_ALIGNMENT_RUN },
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
    descriptionParams: { count: UNBROKEN_COMBO },
    isUnlocked: (ctx) => runValue(ctx, (r) => r.bestStreak) >= UNBROKEN_COMBO,
    progress: (ctx) =>
      capped(
        Math.max(ctx.lifetime.bestCombo, runValue(ctx, (r) => r.bestStreak)),
        UNBROKEN_COMBO,
      ),
  },
  worldAchievement("world-2", 2),
  worldAchievement("world-3", 3),
  worldAchievement("world-5", 5),
  {
    id: "speed-demon",
    descriptionParams: { level: SPEED_DEMON_LEVEL, seconds: SPEED_DEMON_MAX_SECONDS },
    isUnlocked: (ctx) =>
      ctx.run?.speedSplitSeconds != null &&
      ctx.run.speedSplitSeconds < SPEED_DEMON_MAX_SECONDS,
  },
  {
    id: "giant-slayer",
    isUnlocked: (ctx) =>
      ctx.lifetime.bossStacksCleared + runValue(ctx, (r) => r.bossStacksCleared) >= 1,
  },
  {
    id: "zen-master",
    descriptionParams: { count: ZEN_MASTER_STACKS },
    isUnlocked: (ctx) => zenStacks(ctx) >= ZEN_MASTER_STACKS,
    progress: (ctx) =>
      capped(
        Math.max(ctx.lifetime.bestZenStacks, zenStacks(ctx)),
        ZEN_MASTER_STACKS,
      ),
  },
  {
    id: "gold-rush",
    descriptionParams: { score: GOLD_RUSH_SCORE },
    // TA has no Daily or practice variant, so a TA score is a medal score.
    isUnlocked: (ctx) => timeAttackScore(ctx) >= GOLD_RUSH_SCORE,
    progress: (ctx) =>
      capped(
        Math.max(ctx.lifetime.bestTimeAttackScore, timeAttackScore(ctx)),
        GOLD_RUSH_SCORE,
      ),
  },
  {
    id: "time-lord",
    descriptionParams: { score: TIME_LORD_SCORE },
    isUnlocked: (ctx) => timeAttackScore(ctx) >= TIME_LORD_SCORE,
    progress: (ctx) =>
      capped(
        Math.max(ctx.lifetime.bestTimeAttackScore, timeAttackScore(ctx)),
        TIME_LORD_SCORE,
      ),
  },
  {
    id: "daily-devotee",
    descriptionParams: { count: DAILY_DEVOTEE_DAYS },
    isUnlocked: (ctx) => distinctDailyDays(ctx) >= DAILY_DEVOTEE_DAYS,
    progress: (ctx) => capped(distinctDailyDays(ctx), DAILY_DEVOTEE_DAYS),
  },
  {
    id: "architect",
    descriptionParams: { count: ARCHITECT_LIFETIME_STACKS },
    isUnlocked: (ctx) => lifetimeStacks(ctx) >= ARCHITECT_LIFETIME_STACKS,
    progress: (ctx) => capped(lifetimeStacks(ctx), ARCHITECT_LIFETIME_STACKS),
  },
  {
    id: "curious-mind",
    hidden: true,
    // Event-driven: granted by the start screen, never by a run.
    isUnlocked: () => false,
  },
] satisfies AchievementDefinition[]);

export interface AchievementText {
  readonly title: string;
  readonly description: string;
}

/**
 * Title and description in the translator's language. A hidden achievement
 * that is still locked gets the generic "???" text (no hints); pass
 * `revealed: true` for one the player has (toasts, game over list).
 */
export const getAchievementText = (
  i18n: Translator,
  achievement: AchievementDefinition,
  revealed = true,
): AchievementText => {
  const { t } = i18n;
  if (achievement.hidden && !revealed) {
    return {
      title: t("achievements.hidden.title"),
      description: t("achievements.hidden.description"),
    };
  }
  const { id, descriptionParams } = achievement;
  // Prose numbers follow the language ("1,000" / "1 000").
  const params = descriptionParams
    ? Object.fromEntries(
        Object.entries(descriptionParams).map(([name, value]) => [name, i18n.number(value)]),
      )
    : undefined;
  // Every description's placeholders are listed in `descriptionParams`
  // (checked per id in the tests); the cast only bridges the dynamic key.
  const describe = t as (
    key: `achievement.${AchievementId}.description`,
    params?: Readonly<Record<string, string>>,
  ) => string;
  return {
    title: t(`achievement.${id}.title`),
    description: describe(`achievement.${id}.description`, params),
  };
};

/** Title of an unlocked achievement (toasts, game over list). */
export const getAchievementTitle = (i18n: Translator, id: AchievementId): string =>
  getAchievementText(i18n, getAchievement(id)).title;

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
