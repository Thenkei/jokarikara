import { afterEach, describe, expect, it } from "vitest";
import {
  describeDailyButton,
  describeNextDaily,
  formatCountdown,
  formatCountdownSpoken,
  getDailyEndTime,
  getDailyStreakLabel,
  getNextLocalMidnight,
  msUntilNextDaily,
  selectStreakLabel,
} from "./dailyStreak";
import { getLocalDateKey } from "./daily";
import { getTranslator } from "../i18n";

const EN = getTranslator("en");

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Node re-reads process.env.TZ on assignment, so local-time maths can be
 * exercised in real zones. Restored after each test (forks pool: one process
 * per file, but keep the process clean anyway).
 */
// The app tsconfig has no Node types; vitest runs in Node regardless.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } })
  .process.env;
const ORIGINAL_TZ = env.TZ;
const useTimeZone = (tz: string) => {
  env.TZ = tz;
};
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete env.TZ;
  else env.TZ = ORIGINAL_TZ;
});

describe("getNextLocalMidnight / msUntilNextDaily", () => {
  it("returns the start of the next local day", () => {
    useTimeZone("Europe/Paris");
    const next = getNextLocalMidnight(new Date(2026, 10, 14, 16, 48));
    expect(getLocalDateKey(next)).toBe("2026-11-15");
    expect([next.getHours(), next.getMinutes(), next.getSeconds()]).toEqual([0, 0, 0]);
    expect(msUntilNextDaily(new Date(2026, 10, 14, 16, 48))).toBe(7 * HOUR + 12 * MINUTE);
  });

  it("rolls over months and years", () => {
    useTimeZone("Europe/Paris");
    expect(getLocalDateKey(getNextLocalMidnight(new Date(2026, 0, 31, 12)))).toBe("2026-02-01");
    expect(getLocalDateKey(getNextLocalMidnight(new Date(2026, 11, 31, 23, 59)))).toBe(
      "2027-01-01",
    );
  });

  it("gives the end of a Daily day from its key", () => {
    useTimeZone("America/New_York");
    // Fall-back day: the Nov 1 challenge lasts 25 h.
    expect(getDailyEndTime("2026-11-01")).toBe(Date.parse("2026-11-02T05:00:00Z"));
    expect(getDailyEndTime("2026-12-31")).toBe(new Date(2027, 0, 1).getTime());
    expect(getDailyEndTime("garbage")).toBeNull();
  });

  it("is a full day away at exactly midnight", () => {
    useTimeZone("Europe/Paris");
    expect(msUntilNextDaily(new Date(2026, 10, 15, 0, 0))).toBe(24 * HOUR);
  });

  // Instants are given in UTC so the injected dates do not depend on the zone
  // the suite runs in; the expected values are real elapsed durations.
  describe.each([
    {
      tz: "Europe/Paris",
      // Spring forward: Sun 2026-03-29, 02:00 CET → 03:00 CEST (23 h day).
      springDayStart: "2026-03-28T23:30:00Z", // 00:30 CET
      springNextMidnight: "2026-03-29T22:00:00Z", // Mon 00:00 CEST
      // Fall back: Sun 2026-10-25, 03:00 CEST → 02:00 CET (25 h day).
      fallDayStart: "2026-10-24T22:30:00Z", // 00:30 CEST
      fallNextMidnight: "2026-10-25T23:00:00Z", // Mon 00:00 CET
      dayBeforeSpring: "2026-03-28T22:30:00Z", // Sat 23:30 CET
    },
    {
      tz: "America/New_York",
      // Spring forward: Sun 2026-03-08, 02:00 EST → 03:00 EDT.
      springDayStart: "2026-03-08T05:30:00Z", // 00:30 EST
      springNextMidnight: "2026-03-09T04:00:00Z", // Mon 00:00 EDT
      // Fall back: Sun 2026-11-01, 02:00 EDT → 01:00 EST.
      fallDayStart: "2026-11-01T04:30:00Z", // 00:30 EDT
      fallNextMidnight: "2026-11-02T05:00:00Z", // Mon 00:00 EST
      dayBeforeSpring: "2026-03-08T04:30:00Z", // Sat 23:30 EST
    },
  ])("DST in $tz", (zone) => {
    it("counts the real 23 h of a spring-forward day", () => {
      useTimeZone(zone.tz);
      const now = new Date(zone.springDayStart);
      expect(now.getHours()).toBe(0); // the zone really applies
      expect(getNextLocalMidnight(now).toISOString()).toBe(
        new Date(zone.springNextMidnight).toISOString(),
      );
      expect(msUntilNextDaily(now)).toBe(22 * HOUR + 30 * MINUTE);
      expect(formatCountdown(EN, msUntilNextDaily(now))).toBe("22h 30m");
    });

    it("counts the real 25 h of a fall-back day", () => {
      useTimeZone(zone.tz);
      const now = new Date(zone.fallDayStart);
      expect(getNextLocalMidnight(now).toISOString()).toBe(
        new Date(zone.fallNextMidnight).toISOString(),
      );
      expect(msUntilNextDaily(now)).toBe(24 * HOUR + 30 * MINUTE);
      expect(formatCountdown(EN, msUntilNextDaily(now))).toBe("24h 30m");
    });

    it("lands on the transition day itself, not an hour off", () => {
      useTimeZone(zone.tz);
      const now = new Date(zone.dayBeforeSpring);
      const next = getNextLocalMidnight(now);
      expect(getLocalDateKey(next)).toBe(getLocalDateKey(new Date(zone.springDayStart)));
      expect(next.getHours()).toBe(0);
      expect(msUntilNextDaily(now)).toBe(30 * MINUTE);
    });
  });
});

describe("formatCountdown", () => {
  it.each([
    [7 * HOUR + 12 * MINUTE, "7h 12m"],
    [7 * HOUR + 12 * MINUTE + 59_999, "7h 12m"], // floored, never overstates
    [7 * HOUR, "7h 0m"],
    [24 * HOUR, "24h 0m"],
    [45 * MINUTE, "45m"],
    [MINUTE, "1m"],
    [59_999, "<1m"],
    [0, "<1m"],
    [-5_000, "<1m"],
    [Number.NaN, "<1m"],
  ])("%d ms → %s", (ms, expected) => {
    expect(formatCountdown(EN, ms)).toBe(expected);
  });

  it.each([
    [7 * HOUR + 12 * MINUTE, "7 hours 12 minutes"],
    [HOUR + MINUTE, "1 hour 1 minute"],
    [HOUR, "1 hour"],
    [45 * MINUTE, "45 minutes"],
    [30_000, "less than a minute"],
  ])("spoken %d ms → %s", (ms, expected) => {
    expect(formatCountdownSpoken(EN, ms)).toBe(expected);
  });

  it("describes the next Daily for an instant", () => {
    useTimeZone("Europe/Paris");
    expect(describeNextDaily(EN, new Date(2026, 10, 14, 23, 15))).toEqual({
      text: "45m",
      spoken: "45 minutes",
    });
  });
});

describe("selectStreakLabel", () => {
  it.each([0, 1, -3, 2.5, Number.NaN])("shows nothing for streak %d", (streak) => {
    expect(selectStreakLabel(EN, streak, true)).toBeNull();
    expect(selectStreakLabel(EN, streak, false)).toBeNull();
  });

  it("celebrates a streak that includes today", () => {
    expect(selectStreakLabel(EN, 3, true)).toEqual({
      state: "kept",
      days: 3,
      text: "3-DAY STREAK",
      spoken: "3-day streak.",
    });
  });

  it("asks to keep a streak that today has not extended yet", () => {
    expect(selectStreakLabel(EN, 3, false)).toEqual({
      state: "at-risk",
      days: 3,
      text: "KEEP YOUR 3-DAY STREAK",
      spoken: "3-day streak, play today to keep it.",
    });
  });
});

describe("getDailyStreakLabel", () => {
  const now = new Date(2026, 10, 15, 10, 0);

  it("is at risk when yesterday was played but today is not", () => {
    expect(getDailyStreakLabel(EN, ["2026-11-13", "2026-11-14"], now)?.state).toBe("at-risk");
  });

  it("is kept once today is played", () => {
    expect(
      getDailyStreakLabel(EN, ["2026-11-13", "2026-11-14", "2026-11-15"], now),
    ).toMatchObject({ state: "kept", days: 3 });
  });

  it("is gone when a day was missed", () => {
    expect(getDailyStreakLabel(EN, ["2026-11-12", "2026-11-13"], now)).toBeNull();
    expect(getDailyStreakLabel(EN, ["2026-11-15"], now)).toBeNull();
  });
});

describe("describeDailyButton", () => {
  const now = new Date(2026, 10, 15, 16, 48);
  const dateLabel = new Date(2026, 10, 15).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  it("invites a first play without a streak or countdown", () => {
    const view = describeDailyButton({ i18n: EN, 
      now,
      record: { best: 0, attempts: 0 },
      dailyDates: [],
    });
    expect(view.meta).toBe(`${dateLabel} · NOT PLAYED`);
    expect(view.streak).toBeNull();
    expect(view.next).toBeNull();
    expect(view.ariaLabel).toBe(
      `Daily challenge for ${dateLabel}. Same shapes for everyone today. Not played yet.`,
    );
  });

  it("warns about an at-risk streak in the accessible name", () => {
    const view = describeDailyButton({ i18n: EN, 
      now,
      record: { best: 0, attempts: 0 },
      dailyDates: ["2026-11-12", "2026-11-13", "2026-11-14"],
    });
    expect(view.streak?.text).toBe("KEEP YOUR 3-DAY STREAK");
    expect(view.ariaLabel).toContain(
      "Not played yet. 3-day streak, play today to keep it.",
    );
  });

  it("shows the result, the kept streak and the countdown once played", () => {
    const view = describeDailyButton({ i18n: EN, 
      now,
      record: { best: 140, attempts: 2 },
      dailyDates: ["2026-11-14", "2026-11-15"],
    });
    expect(view.meta).toBe(`${dateLabel} · BEST 140 · 2 TRIES`);
    expect(view.streak?.text).toBe("2-DAY STREAK");
    expect(view.next).toEqual({ text: "7h 12m", spoken: "7 hours 12 minutes" });
    expect(view.ariaLabel).toBe(
      `Daily challenge for ${dateLabel}. Same shapes for everyone today. ` +
        "Best 140, 2 tries. 2-day streak. Next challenge in 7 hours 12 minutes.",
    );
  });

  it("uses the singular for a single try", () => {
    const view = describeDailyButton({ i18n: EN, 
      now,
      record: { best: 90, attempts: 1 },
      dailyDates: ["2026-11-15"],
    });
    expect(view.meta).toContain("1 TRY");
    expect(view.ariaLabel).toContain("Best 90, 1 try.");
  });
});
