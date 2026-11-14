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
export const MAX_HIGH_SCORES = 5;

export interface GameSettings {
  reducedFx: boolean;
  muted: boolean;
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
