import { describe, it, expect } from "vitest";
import { getWorldMechanics, getZoomForLevel, getUnlockedShapes } from "./selectors";

describe("gameplay config", () => {
  it("should preserve world mechanics progression", () => {
    const world1 = getWorldMechanics(1);
    const world2 = getWorldMechanics(2);
    const world3 = getWorldMechanics(3);
    const world4 = getWorldMechanics(4);
    const world5 = getWorldMechanics(5);
    const world6 = getWorldMechanics(6);

    expect(world1.breathingEffect).toBe(false);
    expect(world2.breathingEffect).toBe(true);
    expect(world3.growthPattern).toBe("accelerating");
    expect(world4.waveEffect).toBe(true);
    expect(world5.colorShift).toBe(true);
    expect(world6.eclipseEffect).toBe(true);
  });

  it("should fall back to the highest defined world", () => {
    const fallback = getWorldMechanics(99);
    expect(fallback.eclipseEffect).toBe(true);
  });

  it("should expose level zooms and unlocks", () => {
    expect(getZoomForLevel(1)).toBe(1.0);
    expect(getZoomForLevel(99)).toBe(12);

    expect(getUnlockedShapes(3)).toEqual([
      "circle",
      "octagon",
      "pentagon",
      "hexagon",
      "square",
    ]);
  });
});
