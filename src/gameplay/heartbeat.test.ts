import { describe, it, expect } from "vitest";
import {
  getBeatPhase,
  getHeartbeatMultiplier,
  getHeartbeatPulse,
} from "./heartbeat";

describe("heartbeat", () => {
  it("computes the phase within the current beat", () => {
    expect(getBeatPhase(0, 90)).toBe(0);
    expect(getBeatPhase(1 / 3, 90)).toBeCloseTo(0.5, 9); // 90 BPM: 2/3 s per beat
    expect(getBeatPhase(2 / 3, 90)).toBeCloseTo(0, 9);
    expect(getBeatPhase(5, 0)).toBe(0);
    expect(getBeatPhase(Number.NaN, 90)).toBe(0);
  });

  it("surges on the beat and nearly rests before the next", () => {
    expect(getHeartbeatMultiplier(0)).toBeGreaterThan(5);
    expect(getHeartbeatMultiplier(0.95)).toBeLessThan(0.05);
  });

  it("keeps the average growth speed unchanged over a beat", () => {
    const samples = 20_000;
    let sum = 0;
    for (let i = 0; i < samples; i += 1) {
      sum += getHeartbeatMultiplier((i + 0.5) / samples);
    }
    expect(sum / samples).toBeCloseTo(1, 4);
  });

  it("exposes a 0..1 visual pulse peaking on the beat", () => {
    expect(getHeartbeatPulse(0)).toBe(1);
    expect(getHeartbeatPulse(0.5)).toBeLessThan(0.1);
    expect(getHeartbeatPulse(2)).toBeGreaterThanOrEqual(0);
  });
});
