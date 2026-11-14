import { describe, expect, it } from "vitest";
import { EMPTY_LIFETIME_STATS, type LifetimeStats } from "./achievements";
import {
  NO_VALUE,
  STAT_IDS,
  buildStatRows,
  currentDailyStreak,
  isFirstEverProfile,
  perfectRatePercent,
} from "./stats";

const lifetime = (overrides: Partial<LifetimeStats> = {}): LifetimeStats => ({
  ...EMPTY_LIFETIME_STATS,
  ...overrides,
});

/** Local noon: far from midnight, so the local date key is unambiguous. */
const TODAY = new Date(2026, 10, 14, 12, 0, 0);

const valueOf = (rows: ReturnType<typeof buildStatRows>, id: string) =>
  rows.find((row) => row.id === id)?.value;

describe("isFirstEverProfile", () => {
  it("is true only when nothing was played or stacked", () => {
    expect(isFirstEverProfile(lifetime())).toBe(true);
    expect(isFirstEverProfile(lifetime({ runsPlayed: 1 }))).toBe(false);
    // A run abandoned before commit can still leave stacks behind.
    expect(isFirstEverProfile(lifetime({ totalStacks: 3 }))).toBe(false);
  });
});

describe("perfectRatePercent", () => {
  it("is null with no stacks", () => {
    expect(perfectRatePercent(0, 0)).toBeNull();
  });

  it("rounds to the nearest whole percent", () => {
    expect(perfectRatePercent(1, 3)).toBe(33);
    expect(perfectRatePercent(2, 3)).toBe(67);
    expect(perfectRatePercent(1, 8)).toBe(13); // 12.5 rounds half up
    expect(perfectRatePercent(150, 200)).toBe(75);
  });

  it("reserves 100% and 0% for exact outcomes", () => {
    expect(perfectRatePercent(10, 10)).toBe(100);
    expect(perfectRatePercent(0, 10)).toBe(0);
    expect(perfectRatePercent(199, 200)).toBe(99);
    expect(perfectRatePercent(1, 1000)).toBe(1);
  });

  it("clamps impossible ratios from tampered storage", () => {
    expect(perfectRatePercent(12, 10)).toBe(100);
  });
});

describe("currentDailyStreak", () => {
  it("is 0 with no daily history", () => {
    expect(currentDailyStreak([], TODAY)).toBe(0);
  });

  it("counts consecutive days ending today", () => {
    expect(
      currentDailyStreak(["2026-11-12", "2026-11-13", "2026-11-14"], TODAY),
    ).toBe(3);
  });

  it("stays alive through yesterday when today is not played yet", () => {
    expect(currentDailyStreak(["2026-11-12", "2026-11-13"], TODAY)).toBe(2);
  });

  it("stops at the first gap", () => {
    expect(
      currentDailyStreak(
        ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-11", "2026-11-13", "2026-11-14"],
        TODAY,
      ),
    ).toBe(2);
  });

  it("is 0 when the last played day is before yesterday", () => {
    expect(currentDailyStreak(["2026-11-10", "2026-11-11", "2026-11-12"], TODAY)).toBe(
      0,
    );
  });

  it("crosses month and year boundaries", () => {
    const newYear = new Date(2027, 0, 1, 12);
    expect(currentDailyStreak(["2026-12-30", "2026-12-31", "2027-01-01"], newYear)).toBe(3);
    const march = new Date(2028, 2, 1, 12); // 2028 is a leap year
    expect(currentDailyStreak(["2028-02-28", "2028-02-29", "2028-03-01"], march)).toBe(3);
  });

  it("is order- and duplicate-insensitive and ignores future dates", () => {
    expect(
      currentDailyStreak(
        ["2026-11-14", "2026-11-20", "2026-11-13", "2026-11-14", "2026-11-12"],
        TODAY,
      ),
    ).toBe(3);
  });

  it("uses the local day, not UTC", () => {
    // 00:30 local on Nov 15 is still Nov 14 in UTC for any positive offset;
    // the streak must follow the player's calendar.
    const justAfterMidnight = new Date(2026, 10, 15, 0, 30);
    expect(currentDailyStreak(["2026-11-14", "2026-11-15"], justAfterMidnight)).toBe(2);
  });
});

describe("buildStatRows", () => {
  it("returns every stat once, in display order", () => {
    const rows = buildStatRows(lifetime(), TODAY);
    expect(rows.map((row) => row.id)).toEqual([...STAT_IDS]);
    for (const row of rows) expect(row.label.length).toBeGreaterThan(0);
  });

  it("renders empty stats without NaN and with a placeholder rate", () => {
    const rows = buildStatRows(lifetime(), TODAY);
    expect(Object.fromEntries(rows.map((row) => [row.id, row.value]))).toEqual({
      "runs-played": "0",
      "total-stacks": "0",
      "perfect-rate": NO_VALUE,
      "best-combo": "0",
      "best-perfect-run": "0",
      "best-world": "1",
      "best-zen-stacks": "0",
      "best-time-attack": "0",
      "daily-played": "0",
      "daily-streak": "0",
    });
  });

  it("maps each lifetime field to its row", () => {
    const rows = buildStatRows(
      lifetime({
        runsPlayed: 42,
        totalStacks: 1234,
        totalPerfects: 617,
        bestCombo: 31,
        bestPerfectRun: 12,
        bestWorld: 7,
        bestZenStacks: 58,
        bestTimeAttackScore: 4560,
        dailyDates: ["2026-11-01", "2026-11-13", "2026-11-14"],
      }),
      TODAY,
    );
    expect(valueOf(rows, "runs-played")).toBe("42");
    expect(valueOf(rows, "total-stacks")).toBe("1,234");
    expect(valueOf(rows, "perfect-rate")).toBe("50%");
    expect(valueOf(rows, "best-combo")).toBe("31");
    expect(valueOf(rows, "best-perfect-run")).toBe("12");
    expect(valueOf(rows, "best-world")).toBe("7");
    expect(valueOf(rows, "best-zen-stacks")).toBe("58");
    expect(valueOf(rows, "best-time-attack")).toBe("4,560");
    expect(valueOf(rows, "daily-played")).toBe("3");
    expect(valueOf(rows, "daily-streak")).toBe("2");
  });

  it("does not mutate its input", () => {
    const input = Object.freeze(
      lifetime({ dailyDates: Object.freeze(["2026-11-14"]) as readonly string[] }),
    );
    expect(() => buildStatRows(input, TODAY)).not.toThrow();
  });
});
