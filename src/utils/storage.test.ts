import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getAllHighScores,
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

    it("keeps only the top 5 scores", () => {
      [10, 50, 30, 20, 40, 5, 60].forEach((n) => saveHighScore(n));

      const scores = getHighScores();

      expect(scores).toHaveLength(5);
      expect(scores.map((s) => s.score)).toEqual([60, 50, 40, 30, 20]);
    });

    it("displaces the lowest score when a higher one is saved", () => {
      saveHighScore(10);
      saveHighScore(20);
      saveHighScore(30);
      saveHighScore(40);
      saveHighScore(50);
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
      expect(getSettings()).toEqual({ reducedFx: false, muted: false });
    });

    it("returns stored settings with reducedFx: true", () => {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ reducedFx: true }));

      expect(getSettings()).toEqual({ reducedFx: true, muted: false });
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

      expect(getSettings()).toEqual({ reducedFx: false, muted: false });
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

  describe("per-mode high scores", () => {
    it("keeps lists independent per mode", () => {
      saveHighScore(10, "CLASSIC");
      saveHighScore(99, "ZEN");
      saveHighScore(55, "TIME_ATTACK");

      expect(getHighScores("CLASSIC").map((s) => s.score)).toEqual([10]);
      expect(getHighScores("ZEN").map((s) => s.score)).toEqual([99]);
      expect(getAllHighScores().TIME_ATTACK[0].score).toBe(55);
    });

    it("migrates the legacy v2 list into CLASSIC only", () => {
      localStorage.setItem(
        SCORES_KEY,
        JSON.stringify([
          { score: 7, date: "1/1/2025" },
          { score: 70, date: "1/2/2025" },
        ]),
      );

      expect(getHighScores("CLASSIC").map((s) => s.score)).toEqual([70, 7]);
      expect(getHighScores("ZEN")).toEqual([]);

      saveHighScore(8, "CLASSIC");
      expect(getHighScores("CLASSIC").map((s) => s.score)).toEqual([70, 8, 7]);
    });

    it("reports isNewBest only when beating the previous best", () => {
      expect(saveHighScore(0, "ZEN").isNewBest).toBe(false);
      expect(saveHighScore(10, "ZEN").isNewBest).toBe(true);
      expect(saveHighScore(10, "ZEN").isNewBest).toBe(false);
      expect(saveHighScore(11, "ZEN").isNewBest).toBe(true);
      expect(saveHighScore(5, "ZEN").isNewBest).toBe(false);
    });

    it("tolerates corrupt storage", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      localStorage.setItem("shape-stack-high-scores-v3", "{nope");
      expect(getHighScores("ZEN")).toEqual([]);
    });
  });

  describe("reduced motion default", () => {
    const mockMatchMedia = (matches: boolean) => {
      vi.stubGlobal("matchMedia", () => ({ matches }));
    };

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("defaults reducedFx to true when the OS requests reduced motion", () => {
      mockMatchMedia(true);
      expect(getSettings().reducedFx).toBe(true);
    });

    it("prefers a stored value over the OS preference", () => {
      mockMatchMedia(true);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ reducedFx: false }));
      expect(getSettings().reducedFx).toBe(false);
    });

    it("defaults to false without the preference", () => {
      mockMatchMedia(false);
      expect(getSettings().reducedFx).toBe(false);
    });
  });
});
