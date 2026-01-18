import { describe, it, expect, vi } from "vitest";
import {
  drawRegularPolygonPath,
  drawShape,
  drawBackground,
  clearCanvas,
  drawShapeStack,
} from "./shapeRenderer";
import type { Shape } from "../utils/geometry";
import { getWorldMechanics } from "../constants/game";

// Mock CanvasRenderingContext2D
const createMockContext = () => {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    createRadialGradient: vi.fn().mockReturnValue({
      addColorStop: vi.fn(),
    }),
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    shadowBlur: 0,
    shadowColor: "",
  } as unknown as CanvasRenderingContext2D;
};

// Helper: default world 1 mechanics (no effects)
const defaultMechanics = getWorldMechanics(1);

describe("shapeRenderer", () => {
  describe("drawRegularPolygonPath", () => {
    it("should call beginPath and closePath", () => {
      const ctx = createMockContext();
      drawRegularPolygonPath(ctx, 6, 100);

      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.closePath).toHaveBeenCalled();
    });

    it("should call moveTo for first vertex and lineTo for rest", () => {
      const ctx = createMockContext();
      drawRegularPolygonPath(ctx, 5, 100);

      expect(ctx.moveTo).toHaveBeenCalledTimes(1);
      expect(ctx.lineTo).toHaveBeenCalledTimes(4);
    });
  });

  describe("drawShape", () => {
    it("should save and restore context", () => {
      const ctx = createMockContext();
      const shape: Shape = {
        type: "circle",
        size: 100,
        rotation: 0,
        color: "#ff0000",
        opacity: 0.8,
      };

      drawShape(ctx, shape, 400, 300, 1, defaultMechanics);

      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it("should translate to shape position", () => {
      const ctx = createMockContext();
      const shape: Shape = {
        type: "square",
        size: 100,
        rotation: 0,
        color: "#00ff00",
        opacity: 1,
      };

      drawShape(ctx, shape, 400, 300, 1, defaultMechanics);

      expect(ctx.translate).toHaveBeenCalledWith(400, 300);
    });

    it("should apply rotation", () => {
      const ctx = createMockContext();
      const shape: Shape = {
        type: "hexagon",
        size: 100,
        rotation: Math.PI / 4,
        color: "#0000ff",
        opacity: 1,
      };

      drawShape(ctx, shape, 0, 0, 1, defaultMechanics);

      expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 4);
    });

    it("should apply zoom to size", () => {
      const ctx = createMockContext();
      const shape: Shape = {
        type: "circle",
        size: 100,
        rotation: 0,
        color: "#ff0000",
        opacity: 1,
      };

      drawShape(ctx, shape, 0, 0, 2, defaultMechanics);

      // Circle uses arc with radius = (size * zoom) / 2 = (100 * 2) / 2 = 100
      expect(ctx.arc).toHaveBeenCalledWith(0, 0, 100, 0, Math.PI * 2);
    });

    it("should use rect for square", () => {
      const ctx = createMockContext();
      const shape: Shape = {
        type: "square",
        size: 100,
        rotation: 0,
        color: "#ff0000",
        opacity: 1,
      };

      drawShape(ctx, shape, 0, 0, 1, defaultMechanics);

      expect(ctx.rect).toHaveBeenCalledWith(-50, -50, 100, 100);
    });
  });

  describe("clearCanvas", () => {
    it("should call clearRect with canvas dimensions", () => {
      const ctx = createMockContext();
      clearCanvas(ctx, 800, 600);

      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
    });
  });

  describe("drawBackground", () => {
    it("should create radial gradient", () => {
      const ctx = createMockContext();
      drawBackground(ctx, 800, 600, 0.5);

      expect(ctx.createRadialGradient).toHaveBeenCalled();
      expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
    });
  });

  describe("drawShapeStack", () => {
    it("should draw all shapes in stack", () => {
      const ctx = createMockContext();
      const shapes: Shape[] = [
        { type: "circle", size: 100, rotation: 0, color: "#f00", opacity: 1 },
        { type: "square", size: 80, rotation: 0, color: "#0f0", opacity: 1 },
        { type: "hexagon", size: 60, rotation: 0, color: "#00f", opacity: 1 },
      ];

      drawShapeStack(ctx, shapes, 400, 300, 1, defaultMechanics, 0);

      // Each shape calls save/restore
      expect(ctx.save).toHaveBeenCalledTimes(3);
      expect(ctx.restore).toHaveBeenCalledTimes(3);
    });
  });
});
