export interface HighScore {
  score: number;
  date: string;
}

const STORAGE_KEY = "shape-stack-high-scores";

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
