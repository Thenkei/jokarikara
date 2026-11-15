import { describe, expect, it } from "vitest";
import {
  FINISH_CONFIRM_GUARD_MS,
  FINISH_CONFIRM_WINDOW_MS,
  canFinishRun,
  stepFinishConfirm,
} from "./finishRun";

describe("canFinishRun", () => {
  it("is Zen only (Classic ends on a miss, Time Attack on its clock)", () => {
    expect(canFinishRun("ZEN")).toBe(true);
    expect(canFinishRun("CLASSIC")).toBe(false);
    expect(canFinishRun("TIME_ATTACK")).toBe(false);
  });
});

describe("stepFinishConfirm", () => {
  const armedAt = 10_000;

  it("arms on the first press", () => {
    expect(stepFinishConfirm(null, 0)).toBe("arm");
  });

  it("ignores a press too close to the arming one (double click)", () => {
    expect(stepFinishConfirm(armedAt, armedAt)).toBe("wait");
    expect(stepFinishConfirm(armedAt, armedAt + FINISH_CONFIRM_GUARD_MS - 1)).toBe("wait");
  });

  it("finishes on a deliberate second press inside the window", () => {
    expect(stepFinishConfirm(armedAt, armedAt + FINISH_CONFIRM_GUARD_MS)).toBe("finish");
    expect(stepFinishConfirm(armedAt, armedAt + FINISH_CONFIRM_WINDOW_MS - 1)).toBe("finish");
  });

  it("re-arms once the window has passed, or when the clock went backwards", () => {
    expect(stepFinishConfirm(armedAt, armedAt + FINISH_CONFIRM_WINDOW_MS)).toBe("arm");
    expect(stepFinishConfirm(armedAt, armedAt - 1)).toBe("arm");
  });
});
