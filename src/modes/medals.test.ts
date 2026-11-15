import { describe, expect, it } from "vitest";
import {
  MEDALS,
  MEDAL_THRESHOLDS,
  advanceMedalRun,
  createMedalRun,
  getMedal,
  getMedalAfter,
  getMedalAnnouncement,
  getMedalResult,
  getMedalShareLabel,
  getMedalTarget,
  getNextMedal,
  hasMedals,
  selectHudGoal,
} from "./medals";

const { BRONZE, SILVER, GOLD } = MEDAL_THRESHOLDS;

describe("thresholds", () => {
  it("are strictly increasing, positive and reachable with stack points (multiples of 5)", () => {
    const values = MEDALS.map((m) => MEDAL_THRESHOLDS[m]);
    expect(values[0]).toBeGreaterThan(0);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
    // Every stack quality is worth a multiple of 5 points.
    for (const value of values) expect(value % 5).toBe(0);
  });

  it("keep the calibrated values (see the PR calibration table)", () => {
    expect(MEDAL_THRESHOLDS).toEqual({ BRONZE: 1000, SILVER: 1500, GOLD: 2200 });
  });
});

describe("getMedal", () => {
  it.each([
    [0, null],
    [BRONZE - 1, null],
    [BRONZE, "BRONZE"],
    [BRONZE + 1, "BRONZE"],
    [SILVER - 1, "BRONZE"],
    [SILVER, "SILVER"],
    [GOLD - 1, "SILVER"],
    [GOLD, "GOLD"],
    [GOLD * 10, "GOLD"],
  ])("score %d -> %s", (score, medal) => {
    expect(getMedal(score)).toBe(medal);
  });

  it("treats invalid scores as 0 and floors fractions", () => {
    expect(getMedal(NaN)).toBeNull();
    expect(getMedal(-5000)).toBeNull();
    expect(getMedal(Infinity)).toBeNull();
    expect(getMedal(BRONZE - 0.5)).toBeNull();
  });
});

describe("getNextMedal", () => {
  it.each([
    [0, { medal: "BRONZE", threshold: BRONZE, toGo: BRONZE }],
    [BRONZE - 1, { medal: "BRONZE", threshold: BRONZE, toGo: 1 }],
    [BRONZE, { medal: "SILVER", threshold: SILVER, toGo: SILVER - BRONZE }],
    [SILVER - 230, { medal: "SILVER", threshold: SILVER, toGo: 230 }],
    [SILVER, { medal: "GOLD", threshold: GOLD, toGo: GOLD - SILVER }],
    [GOLD - 1, { medal: "GOLD", threshold: GOLD, toGo: 1 }],
  ])("score %d -> %o", (score, next) => {
    expect(getNextMedal(score)).toEqual(next);
  });

  it("is null once Gold is earned", () => {
    expect(getNextMedal(GOLD)).toBeNull();
    expect(getNextMedal(GOLD + 1)).toBeNull();
  });

  it("never reports less than 1 point to go, even for broken input", () => {
    expect(getNextMedal(NaN)).toEqual({ medal: "BRONZE", threshold: BRONZE, toGo: BRONZE });
    expect(getNextMedal(BRONZE - 0.5)?.toGo).toBe(1);
  });
});

describe("getMedalAfter / getMedalTarget", () => {
  it("walks the ladder and stops after Gold", () => {
    expect(getMedalAfter(null)).toBe("BRONZE");
    expect(getMedalAfter("BRONZE")).toBe("SILVER");
    expect(getMedalAfter("SILVER")).toBe("GOLD");
    expect(getMedalAfter("GOLD")).toBeNull();
    expect(getMedalTarget(null)).toEqual({ medal: "BRONZE", threshold: BRONZE });
    expect(getMedalTarget("SILVER")).toEqual({ medal: "GOLD", threshold: GOLD });
    expect(getMedalTarget("GOLD")).toBeNull();
  });
});

describe("getMedalResult", () => {
  it("pairs the earned medal with the next goal", () => {
    expect(getMedalResult(SILVER - 230)).toEqual({
      earned: "BRONZE",
      next: { medal: "SILVER", threshold: SILVER, toGo: 230 },
    });
    expect(getMedalResult(120)).toEqual({
      earned: null,
      next: { medal: "BRONZE", threshold: BRONZE, toGo: BRONZE - 120 },
    });
    expect(getMedalResult(GOLD)).toEqual({ earned: "GOLD", next: null });
  });
});

describe("hasMedals", () => {
  it("is limited to regular Time Attack runs", () => {
    expect(hasMedals("TIME_ATTACK", false, false)).toBe(true);
    expect(hasMedals("TIME_ATTACK", true, false)).toBe(false);
    expect(hasMedals("TIME_ATTACK", false, true)).toBe(false);
    expect(hasMedals("CLASSIC", false, false)).toBe(false);
    expect(hasMedals("ZEN", false, false)).toBe(false);
  });
});

describe("advanceMedalRun", () => {
  it("does nothing for runs without medals", () => {
    const state = createMedalRun(false);
    const step = advanceMedalRun(state, GOLD);
    expect(step.crossed).toBeNull();
    expect(step.state).toBe(state);
  });

  it("reports each medal exactly once, on the update that reaches it", () => {
    let state = createMedalRun(true);
    const crossings: (string | null)[] = [];
    for (const score of [0, BRONZE - 5, BRONZE, BRONZE + 90, SILVER, SILVER, GOLD - 1, GOLD, GOLD + 140]) {
      const step = advanceMedalRun(state, score);
      crossings.push(step.crossed);
      state = step.state;
    }
    expect(crossings).toEqual([null, null, "BRONZE", null, "SILVER", null, null, "GOLD", null]);
    expect(state.earned).toBe("GOLD");
  });

  it("returns the same state object when nothing changes", () => {
    const state = createMedalRun(true);
    expect(advanceMedalRun(state, BRONZE - 1).state).toBe(state);
  });

  it("reports the highest medal when one update skips a threshold", () => {
    const step = advanceMedalRun(createMedalRun(true), SILVER + 5);
    expect(step.crossed).toBe("SILVER");
    expect(step.state.earned).toBe("SILVER");
  });

  it("never takes a medal back if the score were to drop", () => {
    const earned = advanceMedalRun(createMedalRun(true), SILVER).state;
    const step = advanceMedalRun(earned, 0);
    expect(step.crossed).toBeNull();
    expect(step.state.earned).toBe("SILVER");
  });
});

describe("labels", () => {
  it("share label is a plain phrase", () => {
    expect(getMedalShareLabel("GOLD")).toBe("Gold medal");
    expect(getMedalShareLabel("BRONZE")).toBe("Bronze medal");
  });

  it("announcement names the medal and the next goal", () => {
    expect(getMedalAnnouncement("BRONZE")).toBe(`Bronze medal. Next: Silver at ${SILVER}`);
    expect(getMedalAnnouncement("SILVER")).toBe(`Silver medal. Next: Gold at ${GOLD}`);
    expect(getMedalAnnouncement("GOLD")).toBe("Gold medal. Top medal earned");
  });
});

describe("selectHudGoal", () => {
  const bronze = { medal: "BRONZE" as const, threshold: BRONZE };

  it("shows the goal the score reaches first", () => {
    expect(selectHudGoal(700, bronze)).toEqual({ kind: "best", score: 700 });
    expect(selectHudGoal(1800, bronze)).toEqual({
      kind: "medal",
      medal: "BRONZE",
      threshold: BRONZE,
    });
  });

  it("needs one point more than the best: a best one below the medal goes to the medal", () => {
    expect(selectHudGoal(BRONZE - 2, bronze)).toEqual({ kind: "best", score: BRONZE - 2 });
    expect(selectHudGoal(BRONZE - 1, bronze)?.kind).toBe("medal");
    expect(selectHudGoal(BRONZE, bronze)?.kind).toBe("medal");
  });

  it("falls back to whichever goal exists", () => {
    expect(selectHudGoal(null, bronze)?.kind).toBe("medal");
    expect(selectHudGoal(2500, null)).toEqual({ kind: "best", score: 2500 });
    expect(selectHudGoal(null, null)).toBeNull();
    expect(selectHudGoal(NaN, null)).toBeNull();
  });
});
