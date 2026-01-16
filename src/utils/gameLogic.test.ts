import { describe, it, expect } from "vitest";
import { calculateNextZoom } from "./gameLogic";

describe("game logic utilities", () => {
  describe("calculateNextZoom", () => {
    it("should increase target zoom when current size is smaller than reference", () => {
      const currentZoom = 1.0;
      const currentSize = 50;
      const referenceSize = 100;
      const factor = 1.0;

      // zoom = 1.0 * (100 / 50) * 1.0 = 2.0
      expect(
        calculateNextZoom(currentZoom, currentSize, referenceSize, factor)
      ).toBe(2.0);
    });

    it("should apply the factor correctly", () => {
      const currentZoom = 1.0;
      const currentSize = 50;
      const referenceSize = 100;
      const factor = 0.8;

      // zoom = 1.0 * (100 / 50) * 0.8 = 1.6
      expect(
        calculateNextZoom(currentZoom, currentSize, referenceSize, factor)
      ).toBe(1.6);
    });

    it("should return current zoom if current size is zero or negative to avoid division by zero", () => {
      expect(calculateNextZoom(1.0, 0, 100)).toBe(1.0);
      expect(calculateNextZoom(1.0, -10, 100)).toBe(1.0);
    });

    it("should accumulate zoom correctly over multiple calls", () => {
      let zoom = 1.0;
      const reference = 100;

      // First level up: shape is 50
      zoom = calculateNextZoom(zoom, 50, reference, 1.0); // 2.0
      expect(zoom).toBe(2.0);

      // Second level up: shape is 25 (relative to original 1.0 scale)
      // Note: in GameCanvas, activeShape.size is the internal unit, which gets smaller
      zoom = calculateNextZoom(zoom, 25, reference, 1.0); // 2.0 * (100 / 25) = 8.0
      expect(zoom).toBe(8.0);
    });
  });
});
