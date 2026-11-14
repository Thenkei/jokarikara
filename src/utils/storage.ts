import type { GameMode } from "../types";

export interface HighScore {
  score: number;
  date: string;
}

export type HighScoresByMode = Record<GameMode, HighScore[]>;

export const GAME_MODES: readonly GameMode[] = ["CLASSIC", "ZEN", "TIME_ATTACK"];

/** Legacy single list (pre per-mode); migrated into CLASSIC on first read. */
const LEGACY_STORAGE_KEY = "shape-stack-high-scores-v2";
const STORAGE_KEY = "shape-stack-high-scores-v3";
const SETTINGS_STORAGE_KEY = "shape-stack-settings";
const DAILY_STORAGE_KEY = "shape-stack-daily-v1";
/** Daily records older than this many entries are pruned (oldest first). */
export const MAX_DAILY_RECORDS = 30;
export const MAX_HIGH_SCORES = 5;

export interface GameSettings {
  reducedFx: boolean;
  muted: boolean;
  /** Background soundtrack (independent from `muted`, which silences all). */
  music: boolean;
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
  const entry: HighScore = { score, date: new Date().toLocaleDateString() };
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
