import { describe, it, expect } from "vitest";
import {
  buildDailyShareText,
  formatDailyLabel,
  getDailySeed,
  getLocalDateKey,
  qualitiesFromScoreHistory,
  SHARE_TRAIL_LENGTH,
} from "./daily";
import { STYLE_QUALITY_POINTS } from "../constants/game";

describe("daily challenge", () => {
  it("builds a zero-padded local date key", () => {
    expect(getLocalDateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(getLocalDateKey(new Date(2026, 10, 14, 0, 0))).toBe("2026-11-14");
  });

  it("derives a stable unsigned 32-bit seed per day", () => {
    const seed = getDailySeed("2026-11-14");
    expect(seed).toBe(getDailySeed("2026-11-14"));
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
  });

  it("gives consecutive days different seeds", () => {
    const seeds = new Set(
      Array.from({ length: 60 }, (_, i) =>
        getDailySeed(getLocalDateKey(new Date(2026, 0, 1 + i))),
      ),
    );
    expect(seeds.size).toBe(60);
  });

  it("formats a readable label and falls back on malformed keys", () => {
    expect(formatDailyLabel("2026-11-14", "en-US")).toBe("Nov 14");
    expect(formatDailyLabel("garbage")).toBe("garbage");
  });

  it("maps awarded points back to qualities, ignoring unknown values", () => {
    const { perfect, great, good, ok } = STYLE_QUALITY_POINTS;
    expect(qualitiesFromScoreHistory([perfect, great, 7, good, ok])).toEqual([
      "PERFECT",
      "GREAT",
      "GOOD",
      "OK",
    ]);
  });

  it("builds a spoiler-free share text with a capped quality trail", () => {
    const text = buildDailyShareText({
      dateKey: "2026-11-14",
      score: 1240,
      world: 2,
      level: 3,
      stackCount: 20,
      qualities: Array.from({ length: 20 }, (_, i) =>
        i % 2 === 0 ? "PERFECT" : "OK",
      ),
    });
    const lines = text.split("\n");
    expect(lines[0]).toBe("Shape Stack Daily 2026-11-14");
    expect(lines[1]).toBe("1240 pts · 20 stacks · W2 L3");
    expect(lines[2].endsWith(` +${20 - SHARE_TRAIL_LENGTH}`)).toBe(true);
    expect([...lines[2].split(" ")[0]].length).toBe(SHARE_TRAIL_LENGTH);
  });

  it("omits the trail line when no stack was made", () => {
    const text = buildDailyShareText({
      dateKey: "2026-11-14",
      score: 0,
      world: 1,
      level: 1,
      stackCount: 0,
      qualities: [],
    });
    expect(text.split("\n")).toHaveLength(2);
  });
});
