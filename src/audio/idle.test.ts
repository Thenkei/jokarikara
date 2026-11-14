import { describe, expect, it } from "vitest";
import {
  extendAudibleUntil,
  IDLE_SUSPEND_GRACE_SECONDS,
  REVERB_TAIL_SECONDS,
  secondsUntilIdle,
  shouldSuspend,
} from "./idle";
import { DEFAULT_IMPULSE_RESPONSE } from "./reverb";

describe("idle suspension rules", () => {
  const base = { now: 10, audibleUntil: 8, keepAwake: false, graceSeconds: 2.5 };

  it("waits for the grace after the last audible moment", () => {
    expect(secondsUntilIdle(base)).toBeCloseTo(0.5, 9);
    expect(shouldSuspend(base)).toBe(false);
    expect(shouldSuspend({ ...base, now: 10.5 })).toBe(true);
    expect(secondsUntilIdle({ ...base, now: 12 })).toBe(0); // never negative
  });

  it("suspends right away when nothing has ever played", () => {
    expect(secondsUntilIdle({ ...base, audibleUntil: -Infinity })).toBe(0);
  });

  it("never suspends while kept awake (music, a run in progress)", () => {
    const awake = { ...base, now: 1000, keepAwake: true };
    expect(secondsUntilIdle(awake)).toBeNull();
    expect(shouldSuspend(awake)).toBe(false);
  });

  it("needs no grace when muted, only the in-flight audio", () => {
    const muted = { ...base, graceSeconds: 0 };
    expect(secondsUntilIdle({ ...muted, now: 7 })).toBe(1);
    expect(secondsUntilIdle({ ...muted, now: 8 })).toBe(0);
    expect(secondsUntilIdle({ ...muted, graceSeconds: -3, now: 7 })).toBe(1); // clamped
  });

  it("waits a full grace on a corrupt clock instead of suspending blindly", () => {
    expect(secondsUntilIdle({ ...base, now: Number.NaN })).toBe(2.5);
  });

  it("extends the deadline by the reverb tail and never moves it earlier", () => {
    expect(extendAudibleUntil(-Infinity, 1)).toBe(1 + REVERB_TAIL_SECONDS);
    expect(extendAudibleUntil(5, 1)).toBe(5);
    expect(extendAudibleUntil(5, 4, 2)).toBe(6);
    expect(extendAudibleUntil(5, Number.NaN)).toBe(5);
    expect(extendAudibleUntil(5, Infinity)).toBe(5);
  });

  it("covers the real reverb tail and a grace long enough to ride out menu clicks", () => {
    expect(REVERB_TAIL_SECONDS).toBe(DEFAULT_IMPULSE_RESPONSE.seconds);
    expect(IDLE_SUSPEND_GRACE_SECONDS).toBeGreaterThanOrEqual(2);
    expect(IDLE_SUSPEND_GRACE_SECONDS).toBeLessThanOrEqual(3);
  });
});
