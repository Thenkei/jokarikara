import { describe, expect, it } from "vitest";
import type { EndReason, GameMode } from "../types";
import {
  getGameOverHeadline,
  getTimeUpAnnouncement,
  selectEndFeedback,
} from "./endFeedback";
import { MEDALS, type Medal } from "./medals";

const MODES: readonly GameMode[] = ["CLASSIC", "ZEN", "TIME_ATTACK"];

describe("selectEndFeedback", () => {
  it.each<[Medal | null]>([[null], ...MEDALS.map((medal): [Medal] => [medal])])(
    "ends a Time Attack timeout on time, never on the fail buzz (medal %s)",
    (medal) => {
      const feedback = selectEndFeedback("timeout", "TIME_ATTACK", medal);
      expect(feedback).toEqual({
        cue: { kind: "timeUp", medal },
        effect: "timeUp",
        haptic: "levelUp",
        hold: "timeUp",
        timeUpBanner: true,
      });
    },
  );

  it.each<[EndReason, GameMode]>([
    ["overflow", "CLASSIC"],
    ["badTap", "CLASSIC"],
    ["fracture", "CLASSIC"],
    ["lives", "ZEN"],
  ])("keeps a real failure (%s in %s) a fail", (reason, mode) => {
    // Even with a medal at hand: only the clock ending is a time-up.
    const feedback = selectEndFeedback(reason, mode, "GOLD");
    expect(feedback).toEqual({
      cue: { kind: "fail" },
      effect: "fail",
      haptic: "fail",
      hold: "fail",
      timeUpBanner: false,
    });
  });

  it("closes a finished Zen session calmly and at once", () => {
    expect(selectEndFeedback("finished", "ZEN", null)).toEqual({
      cue: { kind: "finish" },
      effect: "none",
      haptic: "levelUp",
      hold: "none",
      timeUpBanner: false,
    });
  });

  it("only treats a timeout as time-up in Time Attack", () => {
    for (const mode of MODES.filter((m) => m !== "TIME_ATTACK")) {
      expect(selectEndFeedback("timeout", mode, null).cue.kind).toBe("fail");
    }
  });

  it("reads an unknown reason as a failure (conservative default)", () => {
    expect(selectEndFeedback(null, "TIME_ATTACK", "SILVER").cue.kind).toBe("fail");
  });

  it("never plays the fail haptic or effect without the fail cue", () => {
    const reasons: (EndReason | null)[] = [
      "overflow",
      "badTap",
      "fracture",
      "timeout",
      "lives",
      "finished",
      null,
    ];
    for (const reason of reasons) {
      for (const mode of MODES) {
        for (const medal of [null, ...MEDALS]) {
          const feedback = selectEndFeedback(reason, mode, medal);
          const fail = feedback.cue.kind === "fail";
          expect(feedback.effect === "fail").toBe(fail);
          expect(feedback.haptic === "fail").toBe(fail);
          expect(feedback.hold === "fail").toBe(fail);
        }
      }
    }
  });
});

describe("getTimeUpAnnouncement", () => {
  it("states the score, and the medal when one was earned", () => {
    expect(getTimeUpAnnouncement({ score: 820, medal: null })).toBe("Time! Score 820");
    expect(getTimeUpAnnouncement({ score: 1240, medal: "BRONZE" })).toBe(
      "Time! Score 1240. Bronze medal",
    );
    expect(getTimeUpAnnouncement({ score: 2300, medal: "GOLD" })).toBe(
      "Time! Score 2300. Gold medal",
    );
  });
});

describe("getGameOverHeadline", () => {
  it("only says GAME OVER for a lost run", () => {
    expect(getGameOverHeadline("finished")).toBe("SESSION COMPLETE");
    expect(getGameOverHeadline("timeout")).toBe("TIME!");
    for (const reason of ["overflow", "badTap", "fracture", "lives", null, undefined] as const) {
      expect(getGameOverHeadline(reason)).toBe("GAME OVER");
    }
  });
});
