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

  it("leads with how far the final miss was off, keeping the explanation", () => {
    const late = getEndInsight("overflow", 1, { kind: "late", fraction: 0.04 });
    expect(late?.margin).toBe("Too late by 4 %");
    expect(late?.title).toBe("Too late: the shape crossed the edge.");
    expect(late?.tip).toContain("earlier");

    expect(getEndInsight("overflow", 1, { kind: "late", fraction: 0.003 })?.margin).toBe(
      "Too late by a hair",
    );
    expect(getEndInsight("badTap", 9, { kind: "early", fraction: 0.07 })?.margin).toBe(
      "Too early by 7 %",
    );
    expect(
      getEndInsight("fracture", 3, { kind: "fracture", clearInSec: 0.4 })?.margin,
    ).toBe("Sector clear 0.4 s later");
  });

  it("has no margin headline without a margin or for mode-level ends", () => {
    expect(getEndInsight("overflow", 1)?.margin).toBeUndefined();
    expect(getEndInsight("fracture", 3, null)?.margin).toBeUndefined();
    expect(
      getEndInsight("lives", 1, { kind: "late", fraction: 0.04 })?.margin,
    ).toBeUndefined();
    expect(
      getEndInsight("timeout", 1, { kind: "late", fraction: 0.04 })?.margin,
    ).toBeUndefined();
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
