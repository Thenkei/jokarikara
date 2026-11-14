import { describe, it, expect } from "vitest";
import { getComboTier, isComboMilestone } from "./combo";

describe("combo milestones", () => {
  it("celebrates the listed streaks only", () => {
    const hits = Array.from({ length: 60 }, (_, i) => i).filter(isComboMilestone);
    expect(hits).toEqual([5, 10, 20, 30, 50]);
  });

  it("keeps celebrating every 25 stacks past the last milestone", () => {
    expect(isComboMilestone(75)).toBe(true);
    expect(isComboMilestone(100)).toBe(true);
    expect(isComboMilestone(76)).toBe(false);
  });

  it("rejects invalid streaks", () => {
    expect(isComboMilestone(0)).toBe(false);
    expect(isComboMilestone(-5)).toBe(false);
    expect(isComboMilestone(5.5)).toBe(false);
  });

  it("ranks milestones into tiers", () => {
    expect(getComboTier(5)).toBe(1);
    expect(getComboTier(10)).toBe(2);
    expect(getComboTier(50)).toBe(5);
    expect(getComboTier(75)).toBe(5);
  });
});
