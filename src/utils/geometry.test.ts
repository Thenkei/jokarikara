import { describe, it, expect } from "vitest";
import {
  isContained,
  getRegularPolygonVertices,
  getVertices,
} from "./geometry";
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

    it("should correctly handle triangle containment", () => {
      const parent: Shape = {
        type: "triangle",
        size: 100,
        rotation: 0,
        color: "blue",
        opacity: 1,
      };
      const child: Shape = {
        type: "triangle",
        size: 50,
        rotation: 0,
        color: "red",
        opacity: 1,
      };
      expect(isContained(child, parent)).toBe(true);

      const largeChild: Shape = {
        type: "triangle",
        size: 110,
        rotation: 0,
        color: "red",
        opacity: 1,
      };
      expect(isContained(largeChild, parent)).toBe(false);
    });

    it("should correctly handle rectangle containment", () => {
      const parent: Shape = {
        type: "rectangle",
        size: 100,
        rotation: 0,
        color: "blue",
        opacity: 1,
      };
      const child: Shape = {
        type: "rectangle",
        size: 80,
        rotation: 0,
        color: "red",
        opacity: 1,
      };
      expect(isContained(child, parent)).toBe(true);

      const wideChild: Shape = {
        type: "rectangle",
        size: 110,
        rotation: 0,
        color: "red",
        opacity: 1,
      };
      expect(isContained(wideChild, parent)).toBe(false);
    });

    it("should correctly handle regular polygon containment (pentagon, octagon)", () => {
      const parent: Shape = {
        type: "octagon",
        size: 100,
        rotation: 0,
        color: "blue",
        opacity: 1,
      };
      const child: Shape = {
        type: "pentagon",
        size: 50,
        rotation: 0,
        color: "red",
        opacity: 1,
      };
      expect(isContained(child, parent)).toBe(true);

      const largePentagon: Shape = {
        type: "pentagon",
        size: 100, // Pentagon of size 100 will likely poke out of Octagon of size 100
        rotation: 0,
        color: "red",
        opacity: 1,
      };
      expect(isContained(largePentagon, parent)).toBe(false);
    });

    it("should handle mixed shape containment", () => {
      // Circle inside Square
      const square: Shape = {
        type: "square",
        size: 100,
        rotation: 0,
        color: "blue",
        opacity: 1,
      };
      const circleInside: Shape = {
        type: "circle",
        size: 100, // Diameter 100 inside Side 100
        rotation: 0,
        color: "red",
        opacity: 1,
      };
      // For circle we sample perimeter, all should be within or on edge of square
      expect(isContained(circleInside, square)).toBe(true);

      const circleOutside: Shape = {
        type: "circle",
        size: 102,
        rotation: 0,
        color: "red",
        opacity: 1,
      };
      expect(isContained(circleOutside, square)).toBe(false);
    });

    it("should correctly handle diamond containment", () => {
      const parent: Shape = {
        type: "diamond",
        size: 100,
        rotation: 0,
        color: "blue",
        opacity: 1,
      };
      const child: Shape = {
        type: "diamond",
        size: 80,
        rotation: 0,
        color: "red",
        opacity: 1,
      };
      expect(isContained(child, parent)).toBe(true);

      const rotatedChild: Shape = {
        type: "diamond",
        size: 80,
        rotation: Math.PI / 4,
        color: "red",
        opacity: 1,
      };
      expect(isContained(rotatedChild, parent)).toBe(false);
    });

    it("should correctly handle star containment", () => {
      const parent: Shape = {
        type: "star",
        size: 100,
        rotation: 0,
        color: "blue",
        opacity: 1,
      };
      const child: Shape = {
        type: "star",
        size: 50,
        rotation: 0,
        color: "red",
        opacity: 1,
      };
      expect(isContained(child, parent)).toBe(true);

      const largeStar: Shape = {
        type: "star",
        size: 110,
        rotation: 0,
        color: "red",
        opacity: 1,
      };
      expect(isContained(largeStar, parent)).toBe(false);
    });
  });

  describe("getRegularPolygonVertices", () => {
    it("should generate the correct number of vertices", () => {
      const v3 = getRegularPolygonVertices(3, 100, 0);
      expect(v3.length).toBe(3);
      const v8 = getRegularPolygonVertices(8, 100, 0);
      expect(v8.length).toBe(8);
    });

    it("should follow symmetry for 0 rotation", () => {
      // Triangle with 0 rotation: first point should be at (0, -radius)
      const v3 = getRegularPolygonVertices(3, 100, 0);
      expect(v3[0].x).toBeCloseTo(0);
      expect(v3[0].y).toBeCloseTo(-50);
    });
  });

  describe("getVertices", () => {
    it("should return sample points for circles", () => {
      const circle: Shape = {
        type: "circle",
        size: 100,
        rotation: 0,
        color: "red",
        opacity: 1,
      };
      const v = getVertices(circle);
      expect(v.length).toBe(12); // Based on our implementation
    });

    it("should return correctly rotated square vertices", () => {
      const square: Shape = {
        type: "square",
        size: 100,
        rotation: Math.PI / 2,
        color: "red",
        opacity: 1,
      };
      const v = getVertices(square);
      // At 90 degrees rotation, points shift index but relative positions stay same.
      // (Originally -50,-50 becomes 50,-50 at 90deg CW)
      expect(v[0].x).toBeCloseTo(50);
      expect(v[0].y).toBeCloseTo(-50);
    });
  });
});
