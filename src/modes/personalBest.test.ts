import { describe, it, expect } from "vitest";
import {
  advancePersonalBest,
  createPersonalBestState,
  getPersonalBestAnnouncement,
  getVisibleTarget,
  selectPreviousBest,
  type PersonalBestSource,
} from "./personalBest";

const source = (overrides: Partial<PersonalBestSource> = {}): PersonalBestSource => ({
  mode: "CLASSIC",
  dailyKey: null,
  practice: false,
  modeBest: 3300,
  dailyRecord: { best: 900, attempts: 2 },
  ...overrides,
});

describe("selectPreviousBest", () => {
  it("uses the mode's top score for Classic and Time Attack", () => {
    expect(selectPreviousBest(source())).toBe(3300);
    expect(selectPreviousBest(source({ mode: "TIME_ATTACK", modeBest: 1200 }))).toBe(
      1200,
    );
  });

  it("uses today's Daily best for a Daily run, not the Classic leaderboard", () => {
    expect(selectPreviousBest(source({ dailyKey: "2026-11-14" }))).toBe(900);
  });

  it("has no target for a Daily not played yet today", () => {
    expect(
      selectPreviousBest(
        source({ dailyKey: "2026-11-14", dailyRecord: { best: 0, attempts: 0 } }),
      ),
    ).toBeNull();
    expect(selectPreviousBest(source({ dailyKey: "2026-11-14", dailyRecord: null }))).toBe(
      null,
    );
  });

  it("has no target without a previous best (first run of the mode)", () => {
    expect(selectPreviousBest(source({ modeBest: undefined }))).toBeNull();
  });

  it("treats a best of 0 as nothing to chase", () => {
    expect(selectPreviousBest(source({ modeBest: 0 }))).toBeNull();
    expect(
      selectPreviousBest(
        source({ dailyKey: "2026-11-14", dailyRecord: { best: 0, attempts: 3 } }),
      ),
    ).toBeNull();
  });

  it("ignores corrupted values", () => {
    expect(selectPreviousBest(source({ modeBest: Number.NaN }))).toBeNull();
    expect(selectPreviousBest(source({ modeBest: -10 }))).toBeNull();
  });

  it("excludes Zen and practice runs", () => {
    expect(selectPreviousBest(source({ mode: "ZEN" }))).toBeNull();
    expect(selectPreviousBest(source({ practice: true }))).toBeNull();
  });
});

describe("advancePersonalBest", () => {
  it("never crosses without a previous best", () => {
    const state = createPersonalBestState(null);
    const step = advancePersonalBest(state, 10_000);
    expect(step.crossed).toBe(false);
    expect(step.state).toBe(state);
    expect(getVisibleTarget(step.state)).toBeNull();
  });

  it("does not count a score equal to the best", () => {
    const step = advancePersonalBest(createPersonalBestState(3300), 3300);
    expect(step.crossed).toBe(false);
    expect(getVisibleTarget(step.state)).toBe(3300);
  });

  it("crosses once, on the first score above the best", () => {
    let state = createPersonalBestState(3300);
    const crossings: number[] = [];
    for (const score of [100, 3300, 3301, 3500, 9000]) {
      const step = advancePersonalBest(state, score);
      if (step.crossed) crossings.push(score);
      state = step.state;
    }
    expect(crossings).toEqual([3301]);
    expect(state.passed).toBe(true);
    expect(getVisibleTarget(state)).toBeNull();
  });

  it("stays passed if the score later drops back under the best", () => {
    const passed = advancePersonalBest(createPersonalBestState(500), 600).state;
    const step = advancePersonalBest(passed, 100);
    expect(step.crossed).toBe(false);
    expect(step.state.passed).toBe(true);
  });

  it("is immutable and ignores non-finite scores", () => {
    const state = createPersonalBestState(500);
    expect(advancePersonalBest(state, Number.NaN).state).toBe(state);
    advancePersonalBest(state, 600);
    expect(state.passed).toBe(false);
  });

  it("sanitises the target", () => {
    expect(createPersonalBestState(0).target).toBeNull();
    expect(createPersonalBestState(Number.POSITIVE_INFINITY).target).toBeNull();
  });
});

describe("getPersonalBestAnnouncement", () => {
  it("names the kind of best and the score beaten", () => {
    expect(getPersonalBestAnnouncement(3300, false)).toBe(
      "New personal best. Previous best 3300 beaten",
    );
    expect(getPersonalBestAnnouncement(900, true)).toBe(
      "New daily best. Previous best 900 beaten",
    );
  });
});
