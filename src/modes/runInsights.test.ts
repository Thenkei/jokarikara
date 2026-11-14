import { describe, it, expect } from "vitest";
import { getEndInsight, getQualityBreakdown } from "./runInsights";
import { STYLE_QUALITY_POINTS } from "../constants/game";
import { createInitialState, getEndReason, handleMiss, spawnActiveShape, updateTimer } from "../core/gameState";
import type { EndReason } from "../types";

describe("end insight", () => {
  it("explains every end reason with a title and a tip", () => {
    const reasons: EndReason[] = ["overflow", "badTap", "fracture", "timeout", "lives"];
    for (const reason of reasons) {
      const insight = getEndInsight(reason, 1);
      expect(insight?.title.length).toBeGreaterThan(5);
      expect(insight?.tip.length).toBeGreaterThan(10);
    }
    expect(getEndInsight(null, 1)).toBeNull();
    expect(getEndInsight(undefined, 1)).toBeNull();
  });

  it("adapts the advice to Reverse Stack", () => {
    expect(getEndInsight("badTap", 9)?.tip).toContain("Reverse Stack");
    expect(getEndInsight("overflow", 9)?.title).toContain("ring");
    expect(getEndInsight("overflow", 1)?.title).toContain("edge");
  });
});

describe("end reason", () => {
  const fresh = (mode: "CLASSIC" | "ZEN" | "TIME_ATTACK") =>
    spawnActiveShape(createInitialState(1000, mode, 5));

  it("is null while the run is alive", () => {
    expect(getEndReason(fresh("CLASSIC"))).toBeNull();
  });

  it("reports the miss that ended a Classic run", () => {
    expect(getEndReason(handleMiss(fresh("CLASSIC"), "fracture"))).toBe("fracture");
    expect(getEndReason(handleMiss(fresh("CLASSIC")))).toBe("overflow");
  });

  it("prefers mode-level causes: clock and lives", () => {
    const ta = updateTimer({ ...fresh("TIME_ATTACK"), timeRemaining: 0.01 }, 0.02);
    expect(getEndReason(ta)).toBe("timeout");

    const zen = handleMiss({ ...fresh("ZEN"), zenLivesRemaining: 1 }, "badTap");
    expect(zen.isGameOver).toBe(true);
    expect(getEndReason(zen)).toBe("lives");
  });
});

describe("quality breakdown", () => {
  it("counts stacks by quality and ignores unknown values", () => {
    const { perfect, great, good, ok } = STYLE_QUALITY_POINTS;
    expect(getQualityBreakdown([perfect, perfect, great, ok, 3, good])).toEqual({
      PERFECT: 2,
      GREAT: 1,
      GOOD: 1,
      OK: 1,
    });
    expect(getQualityBreakdown([])).toEqual({ PERFECT: 0, GREAT: 0, GOOD: 0, OK: 0 });
  });
});
