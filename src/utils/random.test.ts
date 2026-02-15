import { describe, it, expect } from "vitest";
import { seedRng, nextRandomUnit } from "./random";

describe("random utils", () => {
  it("creates deterministic sequence for same seed", () => {
    let stateA = seedRng(42);
    let stateB = seedRng(42);

    for (let i = 0; i < 10; i += 1) {
      const nextA = nextRandomUnit(stateA);
      const nextB = nextRandomUnit(stateB);
      expect(nextA.value).toBe(nextB.value);
      stateA = nextA.nextState;
      stateB = nextB.nextState;
    }
  });

  it("normalizes zero seed to non-zero state", () => {
    const state = seedRng(0);
    expect(state).not.toBe(0);
  });

  it("returns values in [0, 1)", () => {
    let state = seedRng(1337);
    for (let i = 0; i < 100; i += 1) {
      const next = nextRandomUnit(state);
      expect(next.value).toBeGreaterThanOrEqual(0);
      expect(next.value).toBeLessThan(1);
      state = next.nextState;
    }
  });
});
