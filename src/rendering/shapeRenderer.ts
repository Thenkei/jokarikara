import type { Shape } from "../utils/geometry";
import { getStarVertices } from "../utils/geometry";
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
  size: number,
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
 * Draw a circle path centered at origin.
 */
export const drawCirclePath = (
  ctx: CanvasRenderingContext2D,
  size: number,
): void => {
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
};

/**
 * Draw a square path centered at origin.
 */
export const drawSquarePath = (
  ctx: CanvasRenderingContext2D,
  size: number,
): void => {
  ctx.beginPath();
  ctx.rect(-size / 2, -size / 2, size, size);
};

/**
 * Draw a rectangle path centered at origin.
 */
export const drawRectanglePath = (
  ctx: CanvasRenderingContext2D,
  size: number,
): void => {
  const height = size * 0.6;
  ctx.beginPath();
  ctx.rect(-size / 2, -height / 2, size, height);
};

/**
 * Draw a diamond path centered at origin.
 */
export const drawDiamondPath = (
  ctx: CanvasRenderingContext2D,
  size: number,
): void => {
  const height = size * 0.7;
  ctx.beginPath();
  ctx.moveTo(0, -height / 2);
  ctx.lineTo(size / 2, 0);
  ctx.lineTo(0, height / 2);
  ctx.lineTo(-size / 2, 0);
  ctx.closePath();
};

/**
 * Draw a star path centered at origin.
 */
export const drawStarPath = (
  ctx: CanvasRenderingContext2D,
  size: number,
): void => {
  const starVertices = getStarVertices(size, 0);
  ctx.beginPath();
  starVertices.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
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
  stackIndex: number = 0,
  isContainer: boolean = false,
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

  let opacity = shape.opacity;
  if (mechanics.eclipseEffect && isStacked) {
    // In Eclipse mode, stacked shapes are almost invisible unless they are the container pulsing
    opacity = isContainer ? 0.05 : 0.02;
  }
  ctx.globalAlpha = opacity;

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

  switch (shape.type) {
    case "circle":
      drawCirclePath(ctx, size);
      break;
    case "square":
      drawSquarePath(ctx, size);
      break;
    case "triangle":
      drawRegularPolygonPath(ctx, 3, size);
      break;
    case "rectangle":
      drawRectanglePath(ctx, size);
      break;
    case "pentagon":
      drawRegularPolygonPath(ctx, 5, size);
      break;
    case "hexagon":
      drawRegularPolygonPath(ctx, 6, size);
      break;
    case "octagon":
      drawRegularPolygonPath(ctx, 8, size);
      break;
    case "diamond":
      drawDiamondPath(ctx, size);
      break;
    case "star":
      drawStarPath(ctx, size);
      break;
  }

  ctx.fill();

  let strokeStyle = "rgba(255, 255, 255, 0.4)";
  let lineWidth = 3;

  if (mechanics.eclipseEffect && isContainer) {
    // Pulse the outline of the container shape
    const pulse =
      (Math.sin(time * Math.PI * 2 * mechanics.eclipsePulseSpeed) + 1) / 2;
    strokeStyle = `rgba(255, 255, 255, ${0.1 + pulse * 0.5})`;
    lineWidth = 4;
  }

  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
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
  pulse: number,
  mechanics?: WorldMechanics,
): void => {
  const centerX = width / 2;
  const centerY = height / 2;

  if (mechanics?.eclipseEffect) {
    // Pitch black background for Eclipse
    ctx.fillStyle = "#100e0eff";
    ctx.fillRect(0, 0, width, height);

    // Very subtle center glow
    const grad = ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      width * 0.5,
    );
    grad.addColorStop(0, `rgba(255, 255, 255, ${0.01 + pulse * 0.005})`);
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  ctx.beginPath();
  const grad = ctx.createRadialGradient(
    centerX,
    centerY,
    0,
    centerX,
    centerY,
    width * 0.8,
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
  time: number,
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
  height: number,
): void => {
  ctx.clearRect(0, 0, width, height);
};
