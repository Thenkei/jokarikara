export interface HighScore {
  score: number;
  date: string;
}

const STORAGE_KEY = "shape-stack-high-scores-v2";
const SETTINGS_STORAGE_KEY = "shape-stack-settings";

export interface GameSettings {
  reducedFx: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
  reducedFx: false,
};

export const getHighScores = (): HighScore[] => {
  try {
    const scores = localStorage.getItem(STORAGE_KEY);
    if (!scores) return [];
    return JSON.parse(scores).sort(
      (a: HighScore, b: HighScore) => b.score - a.score
    );
  } catch (e) {
    console.error("Failed to load high scores", e);
    return [];
  }
};

export const saveHighScore = (score: number) => {
  try {
    const scores = getHighScores();
    const newScore: HighScore = {
      score,
      date: new Date().toLocaleDateString(),
    };
    scores.push(newScore);
    const topScores = scores
      .sort((a: HighScore, b: HighScore) => b.score - a.score)
      .slice(0, 3); // Keep top 3
    localStorage.setItem(STORAGE_KEY, JSON.stringify(topScores));
  } catch (e) {
    console.error("Failed to save high score", e);
  }
};

export const getSettings = (): GameSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      reducedFx:
        typeof parsed.reducedFx === "boolean"
          ? parsed.reducedFx
          : DEFAULT_SETTINGS.reducedFx,
    };
  } catch (e) {
    console.error("Failed to load settings", e);
    return DEFAULT_SETTINGS;
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
