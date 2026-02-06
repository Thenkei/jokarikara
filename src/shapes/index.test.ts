import { describe, it, expect, vi } from "vitest";
import {
  getNextColor,
  getNextColorFromPalette,
  getRandomShapeType,
  createShape,
  createInitialShape,
  createActiveShape,
} from "./index";
import { COLORS } from "../constants/game";
import { getWorldPalette } from "../visual/theme";

// Mock Math.random for predictable tests
describe("shapes factory", () => {
  describe("getNextColor", () => {
    it("should return a color from COLORS array", () => {
      const color = getNextColor(null);
      expect(COLORS).toContain(color);
    });

    it("should avoid repeating the last color", () => {
      const lastColor = COLORS[0];
      // Run multiple times to check it never returns the same color
      for (let i = 0; i < 10; i++) {
        vi.spyOn(Math, "random").mockReturnValue(0); // Would normally pick first color
        const color = getNextColor(lastColor);
        expect(color).not.toBe(lastColor);
        vi.restoreAllMocks();
      }
    });

    it("should pick next color in array when random picks same as last", () => {
      vi.spyOn(Math, "random").mockReturnValue(0); // Pick first color
      const color = getNextColor(COLORS[0]);
      expect(color).toBe(COLORS[1]); // Should advance to next
      vi.restoreAllMocks();
    });
  });

  describe("getNextColorFromPalette", () => {
    it("should choose a color from the supplied palette", () => {
      const palette = ["#111111", "#222222", "#333333"];
      const color = getNextColorFromPalette(palette, null);
      expect(palette).toContain(color);
    });

    it("should avoid immediate repeats within the supplied palette", () => {
      const palette = ["#111111", "#222222", "#333333"];
      vi.spyOn(Math, "random").mockReturnValue(0);
      const color = getNextColorFromPalette(palette, "#111111");
      expect(color).toBe("#222222");
      vi.restoreAllMocks();
    });
  });

  describe("getRandomShapeType", () => {
    it("should return circle or octagon at level 1", () => {
      const validTypes = ["circle", "octagon"];
      for (let i = 0; i < 20; i++) {
        const type = getRandomShapeType(1);
        expect(validTypes).toContain(type);
      }
    });

    it("should include pentagon and hexagon at level 2", () => {
      const validTypes = ["circle", "octagon", "pentagon", "hexagon"];
      for (let i = 0; i < 50; i++) {
        const type = getRandomShapeType(2);
        expect(validTypes).toContain(type);
      }
    });

    it("should include all shapes at level 5+", () => {
      const allTypes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        allTypes.add(getRandomShapeType(5));
      }
      // Should have at least 5 different types
      expect(allTypes.size).toBeGreaterThanOrEqual(5);
    });
  });

  describe("createShape", () => {
    it("should create shape with default values", () => {
      const shape = createShape();
      expect(shape.type).toBe("circle");
      expect(shape.size).toBe(100);
      expect(shape.rotation).toBe(0);
      expect(shape.opacity).toBe(1);
      expect(shape.color).toBe(COLORS[0]);
    });

    it("should override defaults with provided options", () => {
      const shape = createShape({
        type: "hexagon",
        size: 200,
        rotation: Math.PI / 4,
        color: "#ff0000",
        opacity: 0.5,
      });
      expect(shape.type).toBe("hexagon");
      expect(shape.size).toBe(200);
      expect(shape.rotation).toBe(Math.PI / 4);
      expect(shape.color).toBe("#ff0000");
      expect(shape.opacity).toBe(0.5);
    });
  });

  describe("createInitialShape", () => {
    it("should create circle at 45% of viewport size", () => {
      const shape = createInitialShape(1000);
      expect(shape.type).toBe("circle");
      expect(shape.size).toBe(450);
      expect(shape.opacity).toBe(1);
    });

    it("should work with various viewport sizes", () => {
      expect(createInitialShape(500).size).toBe(225);
      expect(createInitialShape(800).size).toBe(360);
    });
  });

  describe("createActiveShape", () => {
    it("should create shape at 5% of last shape size", () => {
      const lastShape = createShape({ size: 100 });
      const active = createActiveShape(1, lastShape);
      expect(active.size).toBe(5); // 100 * 0.05
    });

    it("should use 10 as size when no last shape", () => {
      const active = createActiveShape(1, null);
      expect(active.size).toBe(10);
    });

    it("should have 0.8 opacity", () => {
      const active = createActiveShape(1, null);
      expect(active.opacity).toBe(0.8);
    });

    it("should use deterministic world palette for the same world/seed", () => {
      const palette = getWorldPalette(3, 99, false);
      const active = createActiveShape(3, null, 3, 99, false);
      expect(active.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(palette).toContain(active.color);
    });

    it("should avoid same color as last shape in world palette", () => {
      const palette = getWorldPalette(2, 42, false);
      const lastShape = createShape({ color: palette[0] });
      vi.spyOn(Math, "random").mockReturnValue(0);
      const active = createActiveShape(2, lastShape, 2, 42, false);
      expect(active.color).not.toBe(lastShape.color);
      vi.restoreAllMocks();
    });
  });
});
