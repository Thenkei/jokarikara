import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getHighScores,
  saveHighScore,
  getSettings,
  saveSettings,
} from "./storage";

const SCORES_KEY = "shape-stack-high-scores-v2";
const SETTINGS_KEY = "shape-stack-settings";

describe("storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getHighScores", () => {
    it("returns an empty array when nothing is stored", () => {
      expect(getHighScores()).toEqual([]);
    });

    it("returns scores sorted in descending order", () => {
      const unsorted = [
        { score: 5, date: "1/1/2025" },
        { score: 20, date: "1/2/2025" },
        { score: 10, date: "1/3/2025" },
      ];
      localStorage.setItem(SCORES_KEY, JSON.stringify(unsorted));

      const result = getHighScores();

      expect(result[0].score).toBe(20);
      expect(result[1].score).toBe(10);
      expect(result[2].score).toBe(5);
    });

    it("returns an empty array on corrupted JSON", () => {
      localStorage.setItem(SCORES_KEY, "not-valid-json{]");

      expect(getHighScores()).toEqual([]);
    });
  });

  describe("saveHighScore", () => {
    it("saves a new score that can be retrieved via getHighScores", () => {
      saveHighScore(42);

      const scores = getHighScores();

      expect(scores).toHaveLength(1);
      expect(scores[0].score).toBe(42);
    });

    it("records today's date with the score", () => {
      const today = new Date().toLocaleDateString();

      saveHighScore(99);

      expect(getHighScores()[0].date).toBe(today);
    });

    it("keeps only the top 3 scores when more than 3 have been saved", () => {
      saveHighScore(10);
      saveHighScore(50);
      saveHighScore(30);
      saveHighScore(5); // 4th entry, below all existing scores – should be dropped

      const scores = getHighScores();

      expect(scores).toHaveLength(3);
      expect(scores.map((s) => s.score)).toEqual([50, 30, 10]);
    });

    it("displaces the lowest score when a higher one is saved", () => {
      saveHighScore(10);
      saveHighScore(20);
      saveHighScore(30);
      saveHighScore(100); // should knock out 10

      const scores = getHighScores();

      expect(scores[0].score).toBe(100);
      expect(scores.map((s) => s.score)).not.toContain(10);
    });

    it("does not throw when localStorage.setItem throws (e.g. quota exceeded)", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("QuotaExceededError");
      });

      expect(() => saveHighScore(99)).not.toThrow();
    });
  });

  describe("getSettings", () => {
    it("returns the default settings when nothing is stored", () => {
      expect(getSettings()).toEqual({ reducedFx: false });
    });

    it("returns stored settings with reducedFx: true", () => {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ reducedFx: true }));

      expect(getSettings()).toEqual({ reducedFx: true });
    });

    it("falls back to the default for reducedFx when the stored value is not a boolean", () => {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ reducedFx: "yes" }),
      );

      expect(getSettings().reducedFx).toBe(false);
    });

    it("returns the default settings when JSON is corrupted", () => {
      localStorage.setItem(SETTINGS_KEY, "{{bad");

      expect(getSettings()).toEqual({ reducedFx: false });
    });
  });

  describe("saveSettings", () => {
    it("persists a partial settings update", () => {
      saveSettings({ reducedFx: true });

      expect(getSettings().reducedFx).toBe(true);
    });

    it("merges with previously saved settings", () => {
      saveSettings({ reducedFx: true });
      saveSettings({ reducedFx: false });

      expect(getSettings().reducedFx).toBe(false);
    });

    it("does not throw when localStorage.setItem throws", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("QuotaExceededError");
      });

      expect(() => saveSettings({ reducedFx: true })).not.toThrow();
    });
  });
});
