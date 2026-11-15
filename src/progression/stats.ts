import { getLocalDateKey } from "../modes/daily";
import type { LifetimeStats } from "./achievements";
import type { Translator } from "../i18n";

/**
 * Lifetime statistics: a pure projection of `LifetimeStats` into ordered,
 * display-ready rows. No React, no storage, no clock: "today" and the
 * translator are injected so the rows are deterministic under test.
 */

export const STAT_IDS = [
  "runs-played",
  "total-stacks",
  "perfect-rate",
  "best-combo",
  "best-perfect-run",
  "best-world",
  "best-zen-stacks",
  "best-time-attack",
  "daily-played",
  "daily-streak",
] as const;

export type StatId = (typeof STAT_IDS)[number];

export interface StatRow {
  readonly id: StatId;
  readonly label: string;
  readonly value: string;
}

/** Shown when a ratio has no denominator yet. */
export const NO_VALUE = "—";

/** True for a profile that has never played: the stats section is hidden. */
export const isFirstEverProfile = (lifetime: LifetimeStats): boolean =>
  lifetime.runsPlayed === 0 && lifetime.totalStacks === 0;

/**
 * Rounded share of PERFECT stacks, as a whole percent.
 *
 * Plain rounding would claim "100%" at 199/200 and "0%" at 1/1000, so the
 * extremes are reserved for exact outcomes: 100% only when every stack was
 * PERFECT, 0% only when none was. Returns null when nothing was stacked.
 */
export const perfectRatePercent = (
  totalPerfects: number,
  totalStacks: number,
): number | null => {
  if (totalStacks <= 0) return null;
  // Clamp: tampered storage could report more perfects than stacks.
  const perfects = Math.min(Math.max(totalPerfects, 0), totalStacks);
  if (perfects === totalStacks) return 100;
  if (perfects === 0) return 0;
  return Math.min(99, Math.max(1, Math.round((perfects / totalStacks) * 100)));
};

/**
 * Local date key of the day before `dateKey`. Builds the date from local
 * components so DST transitions (23/25 h days) never skip or repeat a day.
 */
const previousDateKey = (dateKey: string): string => {
  const [y, m, d] = dateKey.split("-").map(Number);
  return getLocalDateKey(new Date(y, m - 1, d - 1));
};

/**
 * Consecutive Daily Challenge days ending today, or yesterday when today's
 * challenge has not been played yet (the streak is still alive until the
 * day is over). 0 when the last played day is before yesterday.
 *
 * Order- and duplicate-insensitive; dates after `today` (clock changes) are
 * ignored. Bounded by the stored history (MAX_TRACKED_DAILY_DATES).
 */
export const currentDailyStreak = (
  dailyDates: readonly string[],
  today: Date,
): number => {
  const played = new Set(dailyDates);
  const todayKey = getLocalDateKey(today);
  let cursor = played.has(todayKey) ? todayKey : previousDateKey(todayKey);
  let streak = 0;
  while (played.has(cursor)) {
    streak += 1;
    cursor = previousDateKey(cursor);
  }
  return streak;
};

/** Ordered display rows for the stats section of the achievements panel. */
export const buildStatRows = (
  i18n: Translator,
  lifetime: LifetimeStats,
  today: Date,
): readonly StatRow[] => {
  // Grouped per language ("1,234" / "1 234"), whole numbers only.
  const count = (value: number) => i18n.number(value, { maximumFractionDigits: 0 });
  const rate = perfectRatePercent(lifetime.totalPerfects, lifetime.totalStacks);
  const values: Readonly<Record<StatId, string>> = {
    "runs-played": count(lifetime.runsPlayed),
    "total-stacks": count(lifetime.totalStacks),
    "perfect-rate": rate === null ? NO_VALUE : i18n.number(rate / 100, { style: "percent" }),
    "best-combo": count(lifetime.bestCombo),
    "best-perfect-run": count(lifetime.bestPerfectRun),
    "best-world": count(lifetime.bestWorld),
    "best-zen-stacks": count(lifetime.bestZenStacks),
    "best-time-attack": count(lifetime.bestTimeAttackScore),
    "daily-played": count(lifetime.dailyDates.length),
    "daily-streak": count(currentDailyStreak(lifetime.dailyDates, today)),
  };
  return STAT_IDS.map((id) => ({ id, label: i18n.t(`stats.${id}`), value: values[id] }));
};
