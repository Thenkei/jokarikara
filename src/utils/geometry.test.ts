import { describe, it, expect } from "vitest";
import { isContained } from "./geometry";
import type { Shape } from "./geometry";

describe("geometry utilities", () => {
  describe("isContained", () => {
    it("should return true when a small circle is inside a large circle", () => {
      const parent: Shape = {
        type: "circle",
        size: 100,
        rotation: 0,
        color: "blue",
        opacity: 1,
      };
      const child: Shape = {
        type: "circle",
        size: 50,
        rotation: 0,
        color: "red",
        opacity: 1,
      };
      expect(isContained(child, parent)).toBe(true);
    });

    it("should return false when a child circle is larger than parent circle", () => {
      const parent: Shape = {
        type: "circle",
        size: 50,
        rotation: 0,
        color: "blue",
        opacity: 1,
      };
      const child: Shape = {
        type: "circle",
        size: 100,
        rotation: 0,
        color: "red",
        opacity: 1,
      };
      expect(isContained(child, parent)).toBe(false);
    });

    it("should return true when a square is inside a circle", () => {
      const parent: Shape = {
        type: "circle",
        size: 100,
        rotation: 0,
        color: "blue",
        opacity: 1,
      };
      const child: Shape = {
        type: "square",
        size: 50,
        rotation: 0,
        color: "red",
        opacity: 1,
      };
      // Square side 50, diagonal is 50 * sqrt(2) approx 70.7
      // Circle diameter is 100. It should fit.
      expect(isContained(child, parent)).toBe(true);
    });

    it("should return false when a square is too large for the circle", () => {
      const parent: Shape = {
        type: "circle",
        size: 100,
        rotation: 0,
        color: "blue",
        opacity: 1,
      };
      const child: Shape = {
        type: "square",
        size: 100,
        rotation: 0,
        color: "red",
        opacity: 1,
      };
      // Corners of square are at (+/-50, +/-50). Distance to origin is sqrt(50^2 + 50^2) = 70.7
      // Circle radius is 50. 70.7 > 50, so it should fail.
      expect(isContained(child, parent)).toBe(false);
    });

    it("should handle rotated shapes", () => {
      const parent: Shape = {
        type: "square",
        size: 100,
        rotation: 0,
        color: "blue",
        opacity: 1,
      };
      const child: Shape = {
        type: "square",
        size: 100,
        rotation: Math.PI / 4, // 45 degrees
        color: "red",
        opacity: 1,
      };
      // A square rotated by 45 degrees of same size will poke out of corners.
      expect(isContained(child, parent)).toBe(false);
    });

    it("should return true for identical shapes with same rotation", () => {
      const shape: Shape = {
        type: "hexagon",
        size: 80,
        rotation: 1,
        color: "green",
        opacity: 1,
      };
      expect(isContained(shape, shape)).toBe(true);
    });
  });
});
