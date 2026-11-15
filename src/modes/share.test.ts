import { describe, it, expect } from "vitest";
import {
  buildQualityBar,
  buildRunShareText,
  GAME_URL,
  SHARE_BAR_LENGTH,
  type RunShareInput,
} from "./share";
import { QUALITY_EMOJI } from "./daily";
import { MEDAL_THRESHOLDS } from "./medals";
import type { QualityBreakdown } from "./runInsights";
import { getTranslator } from "../i18n";

const EN = getTranslator("en");

const breakdown = (
  PERFECT: number,
  GREAT = 0,
  GOOD = 0,
  OK = 0,
): QualityBreakdown => ({ PERFECT, GREAT, GOOD, OK });

const base: RunShareInput = {
  mode: "CLASSIC",
  score: 1240,
  world: 3,
  level: 2,
  stackCount: 6,
  bestCombo: 4,
  breakdown: breakdown(3, 2, 0, 1),
};

const { PERFECT: P, GREAT: G, GOOD: D, OK: O } = QUALITY_EMOJI;
const cells = (bar: string) => [...bar].length;

/** Tweet-sized: X counts each emoji as 2, so count conservatively. */
const weightedLength = (text: string) =>
  [...text].reduce((sum, ch) => sum + (ch.codePointAt(0)! > 0xffff ? 2 : 1), 0);

const expectClean = (text: string) => {
  expect(text).not.toMatch(/undefined|NaN|null|Infinity/);
  expect(weightedLength(text)).toBeLessThanOrEqual(280);
};

describe("buildQualityBar", () => {
  it("is empty when no stack was made", () => {
    expect(buildQualityBar(breakdown(0))).toBe("");
  });

  it("draws one cell per stack, best first, for short runs", () => {
    expect(buildQualityBar(breakdown(2, 1, 0, 1))).toBe(`${P}${P}${G}${O}`);
  });

  it("scales long runs to a fixed width, proportionally", () => {
    const bar = buildQualityBar(breakdown(500, 300, 200, 0));
    expect(cells(bar)).toBe(SHARE_BAR_LENGTH);
    expect(bar).toBe(`${P.repeat(5)}${G.repeat(3)}${D.repeat(2)}`);
  });

  it("keeps a rare quality visible in a long run", () => {
    const bar = buildQualityBar(breakdown(1000, 0, 0, 1));
    expect(cells(bar)).toBe(SHARE_BAR_LENGTH);
    expect(bar.endsWith(O)).toBe(true);
    expect(bar).toBe(`${P.repeat(SHARE_BAR_LENGTH - 1)}${O}`);
  });

  it("ignores invalid counts instead of printing garbage", () => {
    expect(buildQualityBar(breakdown(NaN, -3, Infinity, 2))).toBe(`${O}${O}`);
  });
});

describe("buildRunShareText", () => {
  it("formats a Classic run with combo, bar and URL", () => {
    const text = buildRunShareText(EN, base);
    expect(text.split("\n")).toEqual([
      "Shape Stack · Classic",
      "1240 pts · 6 stacks · W3 L2 · combo x4",
      `${P}${P}${P}${G}${G}${O}`,
      GAME_URL,
    ]);
    expectClean(text);
  });

  it("formats a Time Attack run (below Bronze: no medal)", () => {
    const text = buildRunShareText(EN, { ...base, mode: "TIME_ATTACK", score: 640 });
    expect(text.split("\n")[0]).toBe("Shape Stack · Time Attack");
    expect(text).toContain("combo x4");
    expectClean(text);
  });

  it("names the Time Attack medal in words in the title", () => {
    const gold = buildRunShareText(EN, { ...base, mode: "TIME_ATTACK", score: MEDAL_THRESHOLDS.GOLD });
    expect(gold.split("\n")[0]).toBe("Shape Stack · Time Attack · Gold medal");
    const bronze = buildRunShareText(EN, {
      ...base,
      mode: "TIME_ATTACK",
      score: MEDAL_THRESHOLDS.SILVER - 5,
    });
    expect(bronze.split("\n")[0]).toBe("Shape Stack · Time Attack · Bronze medal");
    expect(bronze.split("\n")[1]).toMatch(/^1495 pts · /);
    expectClean(gold);
    expectClean(bronze);
  });

  it("says nothing about medals below Bronze or outside Time Attack", () => {
    const none = buildRunShareText(EN, {
      ...base,
      mode: "TIME_ATTACK",
      score: MEDAL_THRESHOLDS.BRONZE - 5,
    });
    expect(none).not.toMatch(/medal/i);
    const classic = buildRunShareText(EN, { ...base, score: MEDAL_THRESHOLDS.GOLD });
    expect(classic.split("\n")[0]).toBe("Shape Stack · Classic");
    expect(classic).not.toMatch(/medal/i);
  });

  it("omits the combo in Zen, which has none", () => {
    const text = buildRunShareText(EN, { ...base, mode: "ZEN", bestCombo: 9 });
    expect(text.split("\n")[0]).toBe("Shape Stack · Zen");
    expect(text).not.toContain("combo");
    expectClean(text);
  });

  it("labels Zen practice runs with their start world", () => {
    const text = buildRunShareText(EN, { ...base, mode: "ZEN", practiceWorld: 5 });
    expect(text.split("\n")[0]).toBe("Shape Stack · Zen practice from W5");
  });

  it("handles a run with zero stacks: no bar, no combo", () => {
    const text = buildRunShareText(EN, {
      ...base,
      score: 0,
      world: 1,
      level: 1,
      stackCount: 0,
      bestCombo: 0,
      breakdown: breakdown(0),
    });
    expect(text.split("\n")).toEqual([
      "Shape Stack · Classic",
      "0 pts · 0 stacks · W1 L1",
      GAME_URL,
    ]);
    expectClean(text);
  });

  it("uses the singular for a single stack", () => {
    const text = buildRunShareText(EN, { ...base, stackCount: 1, breakdown: breakdown(1) });
    expect(text).toContain(" · 1 stack · ");
  });

  it("keeps a very long run tweet-sized", () => {
    const text = buildRunShareText(EN, {
      ...base,
      mode: "TIME_ATTACK",
      score: 987_654_321,
      world: 10,
      level: 5,
      stackCount: 4_000,
      bestCombo: 3_999,
      breakdown: breakdown(2_500, 1_000, 400, 100),
      practiceWorld: null,
    });
    const bar = text.split("\n")[2];
    expect(cells(bar)).toBe(SHARE_BAR_LENGTH);
    expectClean(text);
  });

  it("never prints undefined / NaN for missing or broken inputs", () => {
    const text = buildRunShareText(EN, {
      mode: "CLASSIC",
      score: NaN,
      world: Number.NaN,
      level: 0,
      stackCount: undefined as unknown as number,
      bestCombo: undefined,
      breakdown: breakdown(NaN, NaN, NaN, NaN),
    });
    expect(text.split("\n")).toEqual([
      "Shape Stack · Classic",
      "0 pts · 0 stacks · W1 L1",
      GAME_URL,
    ]);
    expectClean(text);
  });
});
