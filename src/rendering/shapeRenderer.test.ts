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
import type { WorldMechanics } from "../constants/game";

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

  // -------------------------------------------------------------------------
  // shiftHue (tested indirectly via drawShape with colorShift mechanics)
  // -------------------------------------------------------------------------

  describe("color shift effect (shiftHue)", () => {
    // Custom mechanics with a known colorShiftSpeed so we can compute the
    // expected HSL output deterministically.
    const colorShiftMechanics: WorldMechanics = {
      ...defaultMechanics,
      colorShift: true,
      colorShiftSpeed: 360, // degrees per second
    };

    it("applies an HSL fill color to stacked shapes when colorShift is enabled", () => {
      const ctx = createMockContext();
      const shape: Shape = {
        type: "circle",
        size: 100,
        rotation: 0,
        color: "#ff0000", // pure red (H=0, S=100%, L=50%)
        opacity: 1,
      };

      // time=0.5 s, stackIndex=0 → hueShift = 0.5*360*1 + 0*30 = 180
      // shiftHue("#ff0000", 180) → "hsl(180, 100%, 50%)" (cyan)
      drawShape(ctx, shape, 0, 0, 1, colorShiftMechanics, 0.5, true, 0);

      expect(ctx.fillStyle).toBe("hsl(180, 100%, 50%)");
    });

    it("does NOT shift the color for the active (non-stacked) shape", () => {
      const ctx = createMockContext();
      const shape: Shape = {
        type: "circle",
        size: 100,
        rotation: 0,
        color: "#ff0000",
        opacity: 1,
      };

      drawShape(ctx, shape, 0, 0, 1, colorShiftMechanics, 0.5, false, 0);

      // fillStyle should remain the original hex color
      expect(ctx.fillStyle).toBe("#ff0000");
    });
  });

  // -------------------------------------------------------------------------
  // Breathing effect
  // -------------------------------------------------------------------------

  describe("breathing effect", () => {
    const breathingMechanics: WorldMechanics = {
      ...defaultMechanics,
      breathingEffect: true,
      breathingAmplitude: 0.1, // 10 % size variation
      breathingSpeed: Math.PI, // π rad/s → sin(π·t)
    };

    it("increases the rendered arc radius for stacked shapes at peak phase", () => {
      const ctx = createMockContext();
      const shape: Shape = {
        type: "circle",
        size: 100,
        rotation: 0,
        color: "#ffffff",
        opacity: 1,
      };

      // time=0.5 s, stackIndex=0 → sin(π·0.5 + 0) ≈ 1
      // sizeMultiplier ≈ 1 + 1·0.1·1 = 1.1
      // radius ≈ (100·1·1.1)/2 = 55
      drawShape(ctx, shape, 0, 0, 1, breathingMechanics, 0.5, true, 0);

      // Use expect.closeTo to tolerate IEEE-754 rounding (e.g. 55.00000000000001)
      expect(ctx.arc).toHaveBeenCalledWith(
        0,
        0,
        expect.closeTo(55, 5),
        0,
        Math.PI * 2,
      );
    });

    it("does NOT apply breathing to the active shape", () => {
      const ctx = createMockContext();
      const shape: Shape = {
        type: "circle",
        size: 100,
        rotation: 0,
        color: "#ffffff",
        opacity: 1,
      };

      // isStacked=false → no breathing, radius stays 50
      drawShape(ctx, shape, 0, 0, 1, breathingMechanics, 0.5, false, 0);

      expect(ctx.arc).toHaveBeenCalledWith(0, 0, 50, 0, Math.PI * 2);
    });
  });

  // -------------------------------------------------------------------------
  // Wave effect
  // -------------------------------------------------------------------------

  describe("wave effect", () => {
    const waveMechanics: WorldMechanics = {
      ...defaultMechanics,
      waveEffect: true,
      waveAmplitude: 20,
      waveSpeed: Math.PI, // π rad/s
    };

    it("calls translate twice for stacked shapes – once for position, once for the wave offset", () => {
      const ctx = createMockContext();
      const shape: Shape = {
        type: "circle",
        size: 100,
        rotation: 0,
        color: "#ffffff",
        opacity: 1,
      };

      // time=0.5, stackIndex=0 → sin(π·0.5 + 0·0.5)·20 = sin(π/2)·20 = 20
      drawShape(ctx, shape, 400, 300, 1, waveMechanics, 0.5, true, 0);

      expect(ctx.translate).toHaveBeenCalledTimes(2);
      expect(ctx.translate).toHaveBeenNthCalledWith(1, 400, 300);
      expect(ctx.translate).toHaveBeenNthCalledWith(2, 20, 0);
    });

    it("does NOT add a wave translate for the active (non-stacked) shape", () => {
      const ctx = createMockContext();
      const shape: Shape = {
        type: "circle",
        size: 100,
        rotation: 0,
        color: "#ffffff",
        opacity: 1,
      };

      drawShape(ctx, shape, 400, 300, 1, waveMechanics, 0.5, false, 0);

      // Only one translate call (for position)
      expect(ctx.translate).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Eclipse effect
  // -------------------------------------------------------------------------

  describe("eclipse effect", () => {
    const eclipseMechanics: WorldMechanics = {
      ...defaultMechanics,
      eclipseEffect: true,
      eclipsePulseSpeed: 1,
    };

    it("sets globalAlpha to 0.05 for the container shape", () => {
      const ctx = createMockContext();
      const shape: Shape = {
        type: "circle",
        size: 100,
        rotation: 0,
        color: "#ffffff",
        opacity: 1,
      };

      drawShape(ctx, shape, 0, 0, 1, eclipseMechanics, 0, true, 0, true);

      expect(ctx.globalAlpha).toBe(0.05);
    });

    it("sets globalAlpha to 0.02 for non-container stacked shapes", () => {
      const ctx = createMockContext();
      const shape: Shape = {
        type: "circle",
        size: 100,
        rotation: 0,
        color: "#ffffff",
        opacity: 1,
      };

      drawShape(ctx, shape, 0, 0, 1, eclipseMechanics, 0, true, 0, false);

      expect(ctx.globalAlpha).toBe(0.02);
    });
  });

  // -------------------------------------------------------------------------
  // Combined effects (World 5: breathing + color shift)
  // -------------------------------------------------------------------------

  describe("combined effects", () => {
    const combinedMechanics: WorldMechanics = {
      ...defaultMechanics,
      breathingEffect: true,
      breathingAmplitude: 0.1,
      breathingSpeed: Math.PI,
      colorShift: true,
      colorShiftSpeed: 360,
    };

    it("applies both breathing and color shift simultaneously to stacked shapes", () => {
      const ctx = createMockContext();
      const shape: Shape = {
        type: "circle",
        size: 100,
        rotation: 0,
        color: "#ff0000",
        opacity: 1,
      };

      // time=0.5, isStacked=true, stackIndex=0
      // breathing: sizeMultiplier≈1.1 → radius≈55
      // color shift: hueShift=180 → hsl(180, 100%, 50%)
      drawShape(ctx, shape, 0, 0, 1, combinedMechanics, 0.5, true, 0);

      expect(ctx.arc).toHaveBeenCalledWith(
        0,
        0,
        expect.closeTo(55, 5),
        0,
        Math.PI * 2,
      );
      expect(ctx.fillStyle).toBe("hsl(180, 100%, 50%)");
    });
  });
});
