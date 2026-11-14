import { currentDailyStreak } from "../progression/stats";
import { formatDailyLabel, getLocalDateKey } from "./daily";

/**
 * Daily Challenge habit loop: streak label and the countdown to the next
 * challenge. Pure helpers only (no React, no storage, no clock): "now" is
 * always injected, so DST transitions and midnight roll-overs are testable.
 */

/** The countdown is shown in whole minutes, so it never needs a faster tick. */
export const DAILY_COUNTDOWN_TICK_MS = 60_000;

/** A streak is worth showing from this many consecutive days. */
export const MIN_VISIBLE_STREAK = 2;

const MINUTE_MS = 60_000;

/**
 * Start of the next local calendar day (when the next Daily unlocks).
 *
 * Built from local date parts rather than `now + 24h`: DST days last 23 or
 * 25 hours, and adding a fixed duration would land an hour early or late.
 * `Date` normalises the day overflow (Jan 31 → Feb 1, Dec 31 → Jan 1). In a
 * zone whose clocks skip midnight itself, the engine resolves the missing
 * 00:00 to the first instant of that day, which is when the key changes.
 */
export const getNextLocalMidnight = (now: Date): Date =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);

/**
 * Epoch ms at which the Daily of `dateKey` is over (the next day's local
 * midnight); null for a malformed key.
 */
export const getDailyEndTime = (dateKey: string): number | null => {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  return getNextLocalMidnight(new Date(y, m - 1, d)).getTime();
};

/** Milliseconds until the next Daily unlocks; always > 0 for a valid date. */
export const msUntilNextDaily = (now: Date): number =>
  getNextLocalMidnight(now).getTime() - now.getTime();

/** Whole minutes left, floored; invalid or negative input counts as none. */
const wholeMinutes = (ms: number): number =>
  Number.isFinite(ms) && ms > 0 ? Math.floor(ms / MINUTE_MS) : 0;

/** Compact countdown: "7h 12m", "45m", "<1m" (floored, never overstates). */
export const formatCountdown = (ms: number): string => {
  const minutes = wholeMinutes(ms);
  if (minutes < 1) return "<1m";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
};

const plural = (count: number, unit: string): string =>
  `${count} ${unit}${count === 1 ? "" : "s"}`;

/**
 * Screen-reader wording of `formatCountdown` ("7h" is read inconsistently):
 * "7 hours 12 minutes", "1 hour", "45 minutes", "less than a minute".
 */
export const formatCountdownSpoken = (ms: number): string => {
  const minutes = wholeMinutes(ms);
  if (minutes < 1) return "less than a minute";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return plural(rest, "minute");
  return rest === 0
    ? plural(hours, "hour")
    : `${plural(hours, "hour")} ${plural(rest, "minute")}`;
};

export interface DailyCountdown {
  /** Visible text, e.g. "7h 12m". */
  readonly text: string;
  /** Accessible wording, e.g. "7 hours 12 minutes". */
  readonly spoken: string;
}

export const describeNextDaily = (now: Date): DailyCountdown => {
  const ms = msUntilNextDaily(now);
  return { text: formatCountdown(ms), spoken: formatCountdownSpoken(ms) };
};

export type StreakState = "kept" | "at-risk";

export interface DailyStreakLabel {
  /** "kept": today already counts. "at-risk": play today or lose it. */
  readonly state: StreakState;
  readonly days: number;
  /** Chip text, e.g. "3-DAY STREAK" or "KEEP YOUR 3-DAY STREAK". */
  readonly text: string;
  /** Accessible sentence, e.g. "3-day streak, play today to keep it." */
  readonly spoken: string;
}

/**
 * Streak chip selection. A one-day "streak" is just having played, so
 * nothing is shown below MIN_VISIBLE_STREAK. When today is not played yet the
 * streak still counts yesterday (see `currentDailyStreak`) but is at risk.
 */
export const selectStreakLabel = (
  streak: number,
  playedToday: boolean,
): DailyStreakLabel | null => {
  if (!Number.isInteger(streak) || streak < MIN_VISIBLE_STREAK) return null;
  return playedToday
    ? {
        state: "kept",
        days: streak,
        text: `${streak}-DAY STREAK`,
        spoken: `${streak}-day streak.`,
      }
    : {
        state: "at-risk",
        days: streak,
        text: `KEEP YOUR ${streak}-DAY STREAK`,
        spoken: `${streak}-day streak, play today to keep it.`,
      };
};

/** Streak label from the lifetime Daily history, as of `now`. */
export const getDailyStreakLabel = (
  dailyDates: readonly string[],
  now: Date,
): DailyStreakLabel | null =>
  selectStreakLabel(
    currentDailyStreak(dailyDates, now),
    dailyDates.includes(getLocalDateKey(now)),
  );

export interface DailyDayRecord {
  readonly best: number;
  readonly attempts: number;
}

export interface DailyButtonView {
  /** "Nov 14 · NOT PLAYED" or "Nov 14 · BEST 140 · 2 TRIES". */
  readonly meta: string;
  readonly streak: DailyStreakLabel | null;
  /** Shown once today's challenge has a result; null before that. */
  readonly next: DailyCountdown | null;
  /** Complete accessible name (the visible text is split across spans). */
  readonly ariaLabel: string;
}

const tries = (attempts: number): string => (attempts === 1 ? "TRY" : "TRIES");

/** Everything the start screen's Daily button shows, for one instant. */
export const describeDailyButton = ({
  now,
  record,
  dailyDates,
}: {
  now: Date;
  record: DailyDayRecord;
  dailyDates: readonly string[];
}): DailyButtonView => {
  const dateLabel = formatDailyLabel(getLocalDateKey(now));
  const played = record.attempts > 0;
  const streak = getDailyStreakLabel(dailyDates, now);
  const next = played ? describeNextDaily(now) : null;
  const meta = played
    ? `${dateLabel} · BEST ${record.best} · ${record.attempts} ${tries(record.attempts)}`
    : `${dateLabel} · NOT PLAYED`;
  const ariaLabel = [
    `Daily challenge for ${dateLabel}.`,
    "Same shapes for everyone today.",
    played
      ? `Best ${record.best}, ${record.attempts} ${tries(record.attempts).toLowerCase()}.`
      : "Not played yet.",
    streak?.spoken,
    next ? `Next challenge in ${next.spoken}.` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  return { meta, streak, next, ariaLabel };
};
