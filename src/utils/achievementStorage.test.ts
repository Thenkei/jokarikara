import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmptyAchievementRecord,
  getAchievementRecord,
  updateAchievementRecord,
} from "./storage";
import { MAX_TRACKED_DAILY_DATES } from "../progression/achievements";

const KEY = "shape-stack-achievements-v1";

describe("achievement storage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an empty record when nothing is stored", () => {
    expect(getAchievementRecord()).toEqual(createEmptyAchievementRecord());
  });

  it("round-trips through updateAchievementRecord", () => {
    const saved = updateAchievementRecord((current) => ({
      unlocked: { ...current.unlocked, "first-stack": 1700000000000 },
      lifetime: { ...current.lifetime, totalStacks: 3, dailyDates: ["2026-11-14"] },
    }));
    expect(getAchievementRecord()).toEqual(saved);
    expect(saved.unlocked["first-stack"]).toBe(1700000000000);
  });

  it("updates against the stored value, merging changes from elsewhere", () => {
    updateAchievementRecord((r) => ({ ...r, unlocked: { "world-2": 1 } }));
    // Simulate another tab writing directly.
    const other = JSON.parse(localStorage.getItem(KEY)!);
    other.unlocked["time-lord"] = 2;
    localStorage.setItem(KEY, JSON.stringify(other));

    const next = updateAchievementRecord((r) => ({
      ...r,
      unlocked: { ...r.unlocked, "architect": 3 },
    }));
    expect(Object.keys(next.unlocked).sort()).toEqual(["architect", "time-lord", "world-2"]);
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["a JSON array", "[1,2,3]"],
    ["a JSON string", '"hello"'],
    ["null", "null"],
  ])("falls back to defaults on %s", (_label, raw) => {
    localStorage.setItem(KEY, raw);
    expect(getAchievementRecord()).toEqual(createEmptyAchievementRecord());
  });

  it("validates field by field, keeping valid data", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        unlocked: {
          "first-stack": 123,
          "world-2": "yesterday",
          "time-lord": -5,
          "removed-achievement": 1,
          "zen-master": null,
        },
        lifetime: {
          totalStacks: 42,
          totalPerfects: -1,
          runsPlayed: 2.5,
          bossStacksCleared: "3",
          bestCombo: Number.MAX_SAFE_INTEGER + 10,
          dailyDates: ["2026-11-02", "2026-11-01", "2026-11-02", "garbage", 7, null],
        },
      }),
    );

    const record = getAchievementRecord();
    expect(record.unlocked).toEqual({ "first-stack": 123 });
    expect(record.lifetime).toEqual({
      ...createEmptyAchievementRecord().lifetime,
      totalStacks: 42,
      dailyDates: ["2026-11-01", "2026-11-02"],
    });
  });

  it("bounds stored daily dates", () => {
    const dates = Array.from({ length: MAX_TRACKED_DAILY_DATES + 10 }, (_, i) =>
      new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
    );
    localStorage.setItem(KEY, JSON.stringify({ lifetime: { dailyDates: dates } }));
    const { lifetime } = getAchievementRecord();
    expect(lifetime.dailyDates).toHaveLength(MAX_TRACKED_DAILY_DATES);
    expect(lifetime.dailyDates.at(-1)).toBe(dates.at(-1));
  });

  it("never throws when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(getAchievementRecord()).toEqual(createEmptyAchievementRecord());
    const next = updateAchievementRecord((r) => ({
      ...r,
      unlocked: { "first-stack": 1 },
    }));
    // The in-memory result is still returned so the session keeps working.
    expect(next.unlocked["first-stack"]).toBe(1);
  });

  it("defaults bestWorld to 1 and rejects invalid values", () => {
    expect(getAchievementRecord().lifetime.bestWorld).toBe(1);
    localStorage.setItem(KEY, JSON.stringify({ lifetime: { bestWorld: 0 } }));
    expect(getAchievementRecord().lifetime.bestWorld).toBe(1);
    localStorage.setItem(KEY, JSON.stringify({ lifetime: { bestWorld: "9" } }));
    expect(getAchievementRecord().lifetime.bestWorld).toBe(1);
    localStorage.setItem(KEY, JSON.stringify({ lifetime: { bestWorld: 7 } }));
    expect(getAchievementRecord().lifetime.bestWorld).toBe(7);
  });

  it("keeps the hidden achievement across reads and ignores unknown ids", () => {
    // Older records (no hidden id) and records from a newer version (ids this
    // build does not know) both load without losing anything it understands.
    localStorage.setItem(
      KEY,
      JSON.stringify({
        unlocked: { "first-stack": 1, "curious-mind": 2, "from-the-future": 3 },
        lifetime: { totalStacks: 4 },
      }),
    );
    const record = getAchievementRecord();
    expect(record.unlocked).toEqual({ "first-stack": 1, "curious-mind": 2 });
    expect(record.lifetime.totalStacks).toBe(4);
  });
});
