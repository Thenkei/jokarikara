import type { GameMode } from "../types";
import { getLocalDateKey } from "../modes/daily";
import { isLanguageSetting, type LanguageSetting } from "../i18n/types";
import {
  EMPTY_LIFETIME_STATS,
  MAX_TRACKED_DAILY_DATES,
  isAchievementId,
  type AchievementId,
  type LifetimeStats,
} from "../progression/achievements";

export interface HighScore {
  score: number;
  /**
   * Local date key ("2026-11-15"), formatted in the player's language when
   * shown (`formatScoreDate`). Entries saved before carry a locale display
   * string ("11/15/2026"), shown as is.
   */
  date: string;
}

export type HighScoresByMode = Record<GameMode, HighScore[]>;

export const GAME_MODES: readonly GameMode[] = ["CLASSIC", "ZEN", "TIME_ATTACK"];

/** Legacy single list (pre per-mode); migrated into CLASSIC on first read. */
const LEGACY_STORAGE_KEY = "shape-stack-high-scores-v2";
const STORAGE_KEY = "shape-stack-high-scores-v3";
const SETTINGS_STORAGE_KEY = "shape-stack-settings";
const DAILY_STORAGE_KEY = "shape-stack-daily-v1";
const ACHIEVEMENTS_STORAGE_KEY = "shape-stack-achievements-v1";
/** Daily records older than this many entries are pruned (oldest first). */
export const MAX_DAILY_RECORDS = 30;
export const MAX_HIGH_SCORES = 5;

export interface GameSettings {
  reducedFx: boolean;
  muted: boolean;
  /** Background soundtrack (independent from `muted`, which silences all). */
  music: boolean;
  /** Vibration feedback on supported devices. */
  haptics: boolean;
  /** Audio ticks that speed up towards the PERFECT window (opt-in aid). */
  timingCue: boolean;
  /** UI language: "auto" follows the browser (see i18n/locale.ts). */
  language: LanguageSetting;
}

const prefersReducedMotion = (): boolean => {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
};

/** Defaults are evaluated lazily so the OS preference is read at call time. */
const getDefaultSettings = (): GameSettings => ({
  reducedFx: prefersReducedMotion(),
  muted: false,
  music: true,
  haptics: true,
  timingCue: false,
  language: "auto",
});

const byScoreDesc = (a: HighScore, b: HighScore) => b.score - a.score;

const isHighScore = (value: unknown): value is HighScore =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as HighScore).score === "number" &&
  Number.isFinite((value as HighScore).score);

const parseList = (raw: string | null): HighScore[] => {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.filter(isHighScore).sort(byScoreDesc) : [];
};

const emptyScores = (): HighScoresByMode => ({
  CLASSIC: [],
  ZEN: [],
  TIME_ATTACK: [],
});

/** Reads all per-mode lists, migrating the legacy list into CLASSIC if needed. */
export const getAllHighScores = (): HighScoresByMode => {
  const result = emptyScores();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<GameMode, unknown>>;
      for (const mode of GAME_MODES) {
        const list = parsed?.[mode];
        result[mode] = Array.isArray(list)
          ? list.filter(isHighScore).sort(byScoreDesc).slice(0, MAX_HIGH_SCORES)
          : [];
      }
      return result;
    }
    result.CLASSIC = parseList(localStorage.getItem(LEGACY_STORAGE_KEY)).slice(
      0,
      MAX_HIGH_SCORES,
    );
  } catch (e) {
    console.error("Failed to load high scores", e);
  }
  return result;
};

export const getHighScores = (mode: GameMode = "CLASSIC"): HighScore[] =>
  getAllHighScores()[mode];

export interface SaveHighScoreResult {
  scores: HighScore[];
  /** True when the score strictly beats the previous best of that mode. */
  isNewBest: boolean;
}

export const saveHighScore = (
  score: number,
  mode: GameMode = "CLASSIC",
): SaveHighScoreResult => {
  const all = getAllHighScores();
  const previousBest = all[mode][0]?.score ?? 0;
  const entry: HighScore = { score, date: getLocalDateKey() };
  const scores = [...all[mode], entry].sort(byScoreDesc).slice(0, MAX_HIGH_SCORES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...all, [mode]: scores }));
  } catch (e) {
    console.error("Failed to save high score", e);
  }
  return { scores, isNewBest: score > 0 && score > previousBest };
};

export const getSettings = (): GameSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return getDefaultSettings();
    }
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      reducedFx:
        typeof parsed.reducedFx === "boolean"
          ? parsed.reducedFx
          : getDefaultSettings().reducedFx,
      muted:
        typeof parsed.muted === "boolean" ? parsed.muted : getDefaultSettings().muted,
      music:
        typeof parsed.music === "boolean" ? parsed.music : getDefaultSettings().music,
      haptics:
        typeof parsed.haptics === "boolean"
          ? parsed.haptics
          : getDefaultSettings().haptics,
      // Absent in settings saved before the cue existed: stays off.
      timingCue:
        typeof parsed.timingCue === "boolean"
          ? parsed.timingCue
          : getDefaultSettings().timingCue,
      // Absent before languages existed, or a language since removed: auto.
      language: isLanguageSetting(parsed.language)
        ? parsed.language
        : getDefaultSettings().language,
    };
  } catch (e) {
    console.error("Failed to load settings", e);
    return getDefaultSettings();
  }
};

export const saveSettings = (partial: Partial<GameSettings>): void => {
  try {
    const next = { ...getSettings(), ...partial };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    console.error("Failed to save settings", e);
  }
};

export interface DailyRecord {
  best: number;
  attempts: number;
}

export interface SaveDailyResult extends DailyRecord {
  isNewBest: boolean;
}

const isDailyRecord = (value: unknown): value is DailyRecord =>
  typeof value === "object" &&
  value !== null &&
  Number.isFinite((value as DailyRecord).best) &&
  Number.isInteger((value as DailyRecord).attempts) &&
  (value as DailyRecord).attempts >= 0;

const readDailyRecords = (): Record<string, DailyRecord> => {
  try {
    const raw = localStorage.getItem(DAILY_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(([, v]) =>
        isDailyRecord(v),
      ),
    ) as Record<string, DailyRecord>;
  } catch (e) {
    console.error("Failed to load daily records", e);
    return {};
  }
};

export const getDailyRecord = (dateKey: string): DailyRecord =>
  readDailyRecords()[dateKey] ?? { best: 0, attempts: 0 };

/** Records one Daily attempt; keeps only the most recent days. */
export const saveDailyResult = (
  dateKey: string,
  score: number,
): SaveDailyResult => {
  const records = readDailyRecords();
  const previous = records[dateKey] ?? { best: 0, attempts: 0 };
  const next: DailyRecord = {
    best: Math.max(previous.best, score),
    attempts: previous.attempts + 1,
  };
  records[dateKey] = next;

  // ISO date keys sort chronologically as strings.
  const kept = Object.keys(records)
    .sort()
    .slice(-MAX_DAILY_RECORDS)
    .reduce<Record<string, DailyRecord>>((acc, key) => {
      acc[key] = records[key];
      return acc;
    }, {});

  try {
    localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(kept));
  } catch (e) {
    console.error("Failed to save daily result", e);
  }
  return { ...next, isNewBest: score > 0 && score > previous.best };
};

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export interface AchievementRecord {
  /** Unlock time (epoch ms) per achievement; doubles as an audit trail. */
  unlocked: Partial<Record<AchievementId, number>>;
  lifetime: LifetimeStats;
}

export const createEmptyAchievementRecord = (): AchievementRecord => ({
  unlocked: {},
  lifetime: { ...EMPTY_LIFETIME_STATS, dailyDates: [] },
});

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toCount = (value: unknown): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;

const parseUnlocked = (value: unknown): AchievementRecord["unlocked"] => {
  if (!isRecordObject(value)) return {};
  const unlocked: AchievementRecord["unlocked"] = {};
  for (const [id, at] of Object.entries(value)) {
    // Unknown ids (catalogue shrank, tampered data) are dropped.
    if (isAchievementId(id) && typeof at === "number" && Number.isFinite(at) && at >= 0) {
      unlocked[id] = at;
    }
  }
  return unlocked;
};

const parseDailyDates = (value: unknown): string[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (d): d is string => typeof d === "string" && DATE_KEY_PATTERN.test(d),
          ),
        ),
      ]
        .sort()
        .slice(-MAX_TRACKED_DAILY_DATES)
    : [];

const parseLifetime = (value: unknown): LifetimeStats => {
  if (!isRecordObject(value)) return createEmptyAchievementRecord().lifetime;
  return {
    totalStacks: toCount(value.totalStacks),
    totalPerfects: toCount(value.totalPerfects),
    runsPlayed: toCount(value.runsPlayed),
    bossStacksCleared: toCount(value.bossStacksCleared),
    bestPerfectRun: toCount(value.bestPerfectRun),
    bestCombo: toCount(value.bestCombo),
    bestZenStacks: toCount(value.bestZenStacks),
    bestTimeAttackScore: toCount(value.bestTimeAttackScore),
    dailyDates: parseDailyDates(value.dailyDates),
    bestWorld: Math.max(1, toCount(value.bestWorld)),
  };
};

/**
 * Reads the achievement record. Validation is per field: a corrupted field
 * falls back to its default without discarding the valid ones, and
 * unparseable JSON (or a storage access failure) yields the empty record.
 * Never throws.
 */
export const getAchievementRecord = (): AchievementRecord => {
  try {
    const raw = localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY);
    if (!raw) return createEmptyAchievementRecord();
    const parsed: unknown = JSON.parse(raw);
    if (!isRecordObject(parsed)) return createEmptyAchievementRecord();
    return {
      unlocked: parseUnlocked(parsed.unlocked),
      lifetime: parseLifetime(parsed.lifetime),
    };
  } catch (e) {
    console.error("Failed to load achievements", e);
    return createEmptyAchievementRecord();
  }
};

/**
 * Read-modify-write against the stored record (not a cached copy), so
 * another tab's unlocks and lifetime increments are merged rather than
 * clobbered. Returns the updated record even when persisting fails. Never
 * throws.
 */
export const updateAchievementRecord = (
  update: (current: AchievementRecord) => AchievementRecord,
): AchievementRecord => {
  const next = update(getAchievementRecord());
  try {
    localStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    console.error("Failed to save achievements", e);
  }
  return next;
};
