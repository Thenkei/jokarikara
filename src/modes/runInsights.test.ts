import { describe, it, expect } from "vitest";
import { getEndInsight, getFinishedInsight, getQualityBreakdown } from "./runInsights";
import { STYLE_QUALITY_POINTS } from "../constants/game";
import { createInitialState, getEndReason, handleMiss, spawnActiveShape, updateTimer } from "../core/gameState";
import type { EndReason } from "../types";
import { getTranslator } from "../i18n";

const EN = getTranslator("en");

describe("end insight", () => {
  it("explains every end reason with a title and a tip", () => {
    const reasons: EndReason[] = [
      "overflow",
      "badTap",
      "fracture",
      "timeout",
      "lives",
      "finished",
    ];
    for (const reason of reasons) {
      const insight = getEndInsight(EN, reason, 1);
      expect(insight?.title.length).toBeGreaterThan(5);
      expect(insight?.tip.length).toBeGreaterThan(10);
    }
    expect(getEndInsight(EN, null, 1)).toBeNull();
    expect(getEndInsight(EN, undefined, 1)).toBeNull();
  });

  it("leads with how far the final miss was off, without repeating it", () => {
    const NBSP = "\u00a0";
    // Untapped overflow: time since PERFECT opened, plus a reading hint.
    const late = getEndInsight(EN, "overflow", 1, { kind: "lateTime", seconds: 0.4 });
    expect(late?.margin).toBe(`Late by 0.4${NBSP}s`);
    expect(late?.marginHint).toBe(`PERFECT opened 0.4${NBSP}s before the edge.`);
    // The sentence drops its own "Too late:" once the headline says it.
    expect(late?.title).toBe("The shape crossed the edge.");
    expect(late?.tip).toContain("earlier");

    const ring = getEndInsight(EN, "overflow", 9, { kind: "lateTime", seconds: 1.2 });
    expect(ring?.marginHint).toBe(`PERFECT opened 1.2${NBSP}s before the ring.`);
    expect(ring?.title).toBe("Your shape crossed the ring.");

    const corner = getEndInsight(EN, "badTap", 1, { kind: "late", fraction: 0.04 });
    expect(corner?.margin).toBe(`Too late by 4${NBSP}%`);
    expect(corner?.marginHint).toBeUndefined();
    expect(corner?.title).toBe("That tap didn't fit.");
    expect(getEndInsight(EN, "badTap", 1, { kind: "late", fraction: 0.003 })?.margin).toBe(
      "Too late by a hair",
    );

    const early = getEndInsight(EN, "badTap", 9, { kind: "early", fraction: 0.07 });
    expect(early?.margin).toBe(`Too early by 7${NBSP}%`);
    expect(early?.title).toBe("It didn't wrap the last shape.");
    expect(
      getEndInsight(EN, "fracture", 3, { kind: "fracture", clearInSec: 0.4 })?.margin,
    ).toBe(`Sector clear 0.4${NBSP}s later`);
  });

  it("keeps the full sentence when there is no margin", () => {
    expect(getEndInsight(EN, "overflow", 1)?.title).toBe(
      "Too late: the shape crossed the edge.",
    );
    expect(getEndInsight(EN, "badTap", 9, null)?.title).toBe(
      "Too early: it didn't wrap the last shape.",
    );
  });

  it("has no margin headline without a margin or for mode-level ends", () => {
    expect(getEndInsight(EN, "overflow", 1)?.margin).toBeUndefined();
    expect(getEndInsight(EN, "fracture", 3, null)?.margin).toBeUndefined();
    expect(
      getEndInsight(EN, "lives", 1, { kind: "late", fraction: 0.04 })?.margin,
    ).toBeUndefined();
    expect(
      getEndInsight(EN, "timeout", 1, { kind: "late", fraction: 0.04 })?.margin,
    ).toBeUndefined();
  });

  it("reads a Time Attack timeout calmly and every lost run as danger", () => {
    expect(getEndInsight(EN, "timeout", 1)?.tone).toBe("calm");
    for (const reason of ["overflow", "badTap", "fracture", "lives"] as const) {
      expect(getEndInsight(EN, reason, 1)?.tone).toBeUndefined();
    }
  });

  it("adapts the advice to Reverse Stack", () => {
    expect(getEndInsight(EN, "badTap", 9)?.tip).toContain("Reverse Stack");
    expect(getEndInsight(EN, "overflow", 9)?.title).toContain("ring");
    expect(getEndInsight(EN, "overflow", 1)?.title).toContain("edge");
  });
});

describe("finished insight (Zen FINISH RUN)", () => {
  const { perfect, great, good, ok } = STYLE_QUALITY_POINTS;

  it("is a calm 'Session complete.' with no margin, whatever the last miss was", () => {
    const insight = getEndInsight(EN, "finished", 9, { kind: "late", fraction: 0.04 }, [perfect]);
    expect(insight?.tone).toBe("calm");
    expect(insight?.title).toBe("Session complete.");
    expect(insight?.margin).toBeUndefined();
    expect(insight?.marginHint).toBeUndefined();
    // Failure reasons keep the danger tone.
    expect(getEndInsight(EN, "lives", 1)?.tone).toBeUndefined();
  });

  it("derives its tip from the stacks landed this run", () => {
    expect(getFinishedInsight(EN, []).tip).toContain("Nothing stacked");
    expect(getFinishedInsight(EN, [perfect]).tip).toBe(
      "Your only stack was PERFECT. Flawless timing.",
    );
    expect(getFinishedInsight(EN, [perfect, perfect, perfect]).tip).toBe(
      "All 3 stacks were PERFECT. Flawless timing.",
    );
    // 3 of 5 PERFECT: dialled in.
    expect(getFinishedInsight(EN, [perfect, great, perfect, ok, perfect]).tip).toBe(
      "60% PERFECT over 5 stacks: your timing is dialled in. Classic puts it on the line.",
    );
    expect(getFinishedInsight(EN, [perfect, great, good, ok]).tip).toBe(
      "1 PERFECT of 4 stacks (25%). Next session, aim for one more.",
    );
    expect(getFinishedInsight(EN, [great, good]).tip).toContain("1 of 2 stacks landed GREAT");
    expect(getFinishedInsight(EN, [ok, good]).tip).toContain("closer to the edge");
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
