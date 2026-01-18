import type { Shape } from "../utils/geometry";
import type { WorldMechanics } from "../constants/game";

/**
 * ShapeRenderer - Separates drawing logic from game loop (SRP).
 * All drawing functions are pure and don't mutate state.
 */

/**
 * Draw a regular polygon path centered at origin.
 */
export const drawRegularPolygonPath = (
  ctx: CanvasRenderingContext2D,
  sides: number,
  size: number
): void => {
  const radius = size / 2;
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
};

/**
 * Convert hex color to HSL and shift hue.
 */
const shiftHue = (hexColor: string, hueShift: number): string => {
  // Parse hex to RGB
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  // Apply hue shift
  h = (h * 360 + hueShift) % 360;

  return `hsl(${h}, ${s * 100}%, ${l * 100}%)`;
};

/**
 * Draw a shape at the specified position with zoom.
 * @param ctx - Canvas context
 * @param shape - The shape to draw
 * @param x - Center X position
 * @param y - Center Y position
 * @param zoom - Zoom level
 * @param mechanics - World mechanics configuration
 * @param time - Time in seconds (for animations)
 * @param isStacked - Whether this is a stacked shape (vs active)
 * @param stackIndex - Index of shape in stack (for phase offsets)
 */
export const drawShape = (
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  x: number,
  y: number,
  zoom: number,
  mechanics: WorldMechanics,
  time: number = 0,
  isStacked: boolean = false,
  stackIndex: number = 0
): void => {
  ctx.save();
  ctx.translate(x, y);

  // Wave effect: horizontal displacement (stacked shapes only)
  if (mechanics.waveEffect && isStacked) {
    const wave =
      Math.sin(time * mechanics.waveSpeed + stackIndex * 0.5) *
      mechanics.waveAmplitude;
    ctx.translate(wave, 0);
  }

  ctx.rotate(shape.rotation);
  ctx.globalAlpha = shape.opacity;

  // Color shift effect (stacked shapes only)
  let fillColor = shape.color;
  if (mechanics.colorShift && isStacked) {
    const hueShift = time * mechanics.colorShiftSpeed + stackIndex * 30;
    fillColor = shiftHue(shape.color, hueShift);
  }
  ctx.fillStyle = fillColor;

  // Calculate size with breathing effect (stacked shapes only)
  let sizeMultiplier = 1;
  if (mechanics.breathingEffect && isStacked) {
    sizeMultiplier =
      1 +
      Math.sin(time * mechanics.breathingSpeed + stackIndex * 0.3) *
        mechanics.breathingAmplitude;
  }

  const size = shape.size * zoom * sizeMultiplier;

  ctx.beginPath();
  if (shape.type === "circle") {
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  } else if (shape.type === "square") {
    ctx.rect(-size / 2, -size / 2, size, size);
  } else if (shape.type === "triangle") {
    drawRegularPolygonPath(ctx, 3, size);
  } else if (shape.type === "rectangle") {
    const height = size * 0.6;
    ctx.rect(-size / 2, -height / 2, size, height);
  } else if (shape.type === "pentagon") {
    drawRegularPolygonPath(ctx, 5, size);
  } else if (shape.type === "hexagon") {
    drawRegularPolygonPath(ctx, 6, size);
  } else if (shape.type === "octagon") {
    drawRegularPolygonPath(ctx, 8, size);
  }

  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.shadowBlur = 15;
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";

  ctx.restore();
};

/**
 * Draw the pulsating background gradient.
 */
export const drawBackground = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pulse: number
): void => {
  const centerX = width / 2;
  const centerY = height / 2;

  ctx.beginPath();
  const grad = ctx.createRadialGradient(
    centerX,
    centerY,
    0,
    centerX,
    centerY,
    width * 0.8
  );
  grad.addColorStop(0, `rgba(255, 255, 255, ${0.03 + pulse * 0.02})`);
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
};

/**
 * Draw all shapes in the stack.
 */
export const drawShapeStack = (
  ctx: CanvasRenderingContext2D,
  shapes: Shape[],
  centerX: number,
  centerY: number,
  zoom: number,
  mechanics: WorldMechanics,
  time: number
): void => {
  shapes.forEach((shape, index) => {
    drawShape(ctx, shape, centerX, centerY, zoom, mechanics, time, true, index);
  });
};

/**
 * Clear the canvas.
 */
export const clearCanvas = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void => {
  ctx.clearRect(0, 0, width, height);
};
