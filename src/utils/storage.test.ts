import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getAllHighScores,
  getHighScores,
  saveHighScore,
  getSettings,
  saveSettings,
  getDailyRecord,
  saveDailyResult,
  MAX_DAILY_RECORDS,
} from "./storage";
import { getLocalDateKey } from "../modes/daily";

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

    it("records today's local date key with the score (formatted when shown)", () => {
      const today = getLocalDateKey();

      saveHighScore(99);

      expect(getHighScores()[0].date).toBe(today);
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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
      expect(getSettings()).toEqual({ reducedFx: false, muted: false, music: true, haptics: true, timingCue: false, language: "auto" });
    });

    it("returns stored settings with reducedFx: true", () => {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ reducedFx: true }));

      expect(getSettings()).toEqual({ reducedFx: true, muted: false, music: true, haptics: true, timingCue: false, language: "auto" });
    });

    it("falls back to the default for reducedFx when the stored value is not a boolean", () => {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ reducedFx: "yes" }),
      );

      expect(getSettings().reducedFx).toBe(false);
    });

    it("falls back to music on when the stored value is not a boolean", () => {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ music: "off" }));

      expect(getSettings().music).toBe(true);
    });

    it("returns the default settings when JSON is corrupted", () => {
      localStorage.setItem(SETTINGS_KEY, "{{bad");

      expect(getSettings()).toEqual({ reducedFx: false, muted: false, music: true, haptics: true, timingCue: false, language: "auto" });
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

    it("persists the music preference without touching other settings", () => {
      saveSettings({ reducedFx: true, muted: true });
      saveSettings({ music: false });

      expect(getSettings()).toEqual({ reducedFx: true, muted: true, music: false, haptics: true, timingCue: false, language: "auto" });
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

describe("daily records", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns an empty record for an unplayed day", () => {
    expect(getDailyRecord("2026-11-14")).toEqual({ best: 0, attempts: 0 });
  });

  it("counts attempts and keeps the best score", () => {
    expect(saveDailyResult("2026-11-14", 300)).toEqual({
      best: 300,
      attempts: 1,
      isNewBest: true,
    });
    expect(saveDailyResult("2026-11-14", 120)).toEqual({
      best: 300,
      attempts: 2,
      isNewBest: false,
    });
    expect(getDailyRecord("2026-11-14")).toEqual({ best: 300, attempts: 2 });
  });

  it("never flags a zero score as a new best", () => {
    expect(saveDailyResult("2026-11-14", 0).isNewBest).toBe(false);
  });

  it("prunes the oldest days beyond the retention window", () => {
    for (let day = 1; day <= MAX_DAILY_RECORDS + 5; day += 1) {
      const key = `2026-01-${String(day).padStart(2, "0")}`;
      saveDailyResult(key, day);
    }
    expect(getDailyRecord("2026-01-01")).toEqual({ best: 0, attempts: 0 });
    expect(getDailyRecord(`2026-01-${MAX_DAILY_RECORDS + 5}`).attempts).toBe(1);
  });

  it("ignores corrupted daily storage", () => {
    localStorage.setItem("shape-stack-daily-v1", "{nope");
    expect(getDailyRecord("2026-11-14")).toEqual({ best: 0, attempts: 0 });
    localStorage.setItem(
      "shape-stack-daily-v1",
      JSON.stringify({ "2026-11-14": { best: "x", attempts: -1 } }),
    );
    expect(getDailyRecord("2026-11-14")).toEqual({ best: 0, attempts: 0 });
  });
});

describe("haptics setting", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to on and persists independently", () => {
    expect(getSettings().haptics).toBe(true);
    saveSettings({ haptics: false });
    expect(getSettings()).toMatchObject({ haptics: false, muted: false, music: true });
  });

  it("ignores a non-boolean stored value", () => {
    localStorage.setItem("shape-stack-settings", JSON.stringify({ haptics: "no" }));
    expect(getSettings().haptics).toBe(true);
  });
});

describe("timing cue setting", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to off", () => {
    expect(getSettings().timingCue).toBe(false);
  });

  it("keeps settings saved before the cue existed (off, others intact)", () => {
    localStorage.setItem(
      "shape-stack-settings",
      JSON.stringify({ reducedFx: true, muted: true, music: false, haptics: false }),
    );
    expect(getSettings()).toEqual({
      reducedFx: true,
      muted: true,
      music: false,
      haptics: false,
      timingCue: false,
      language: "auto",
    });
  });

  it("persists independently of the other settings", () => {
    saveSettings({ timingCue: true });
    expect(getSettings()).toMatchObject({ timingCue: true, muted: false, haptics: true });
    saveSettings({ muted: true });
    expect(getSettings()).toMatchObject({ timingCue: true, muted: true });
  });

  it("ignores a non-boolean stored value", () => {
    for (const value of ["yes", 1, null, {}]) {
      localStorage.setItem("shape-stack-settings", JSON.stringify({ timingCue: value }));
      expect(getSettings().timingCue).toBe(false);
    }
  });
});

describe("language setting", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to auto, also for settings saved before languages existed", () => {
    expect(getSettings().language).toBe("auto");
    localStorage.setItem("shape-stack-settings", JSON.stringify({ muted: true }));
    expect(getSettings()).toMatchObject({ language: "auto", muted: true });
  });

  it("persists each choice independently of the other settings", () => {
    for (const language of ["fr", "en", "auto"] as const) {
      saveSettings({ language });
      expect(getSettings().language).toBe(language);
    }
    saveSettings({ language: "fr" });
    saveSettings({ muted: true });
    expect(getSettings()).toMatchObject({ language: "fr", muted: true });
  });

  it("falls back to auto for an unknown or malformed stored value", () => {
    for (const value of ["de", "FR", "fr-FR", "", 1, null, {}, ["fr"]]) {
      localStorage.setItem(
        "shape-stack-settings",
        JSON.stringify({ language: value, haptics: false }),
      );
      // Only the bad field is reset; valid neighbours survive.
      expect(getSettings()).toMatchObject({ language: "auto", haptics: false });
    }
  });
});
