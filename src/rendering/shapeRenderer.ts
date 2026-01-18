import type { Shape } from "../utils/geometry";

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
 * Draw a shape at the specified position with zoom.
 */
export const drawShape = (
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  x: number,
  y: number,
  zoom: number,
  world: number = 1,
  time: number = 0
): void => {
  ctx.save();
  ctx.translate(x, y);
  console.log("wave", world);
  if (world >= 2) {
    // Waving effect: horizontal displacement based on time and vertical position (approx by size/index)
    // Using shape's size as a seed for variety if we don't have index
    const wave = Math.sin(time * 3 + shape.size * 0.1) * 15;
    console.log(wave);
    ctx.translate(wave, 0);
  }

  ctx.rotate(shape.rotation);
  ctx.globalAlpha = shape.opacity;
  ctx.fillStyle = shape.color;

  const size = shape.size * zoom;

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
  zoom: number
): void => {
  shapes.forEach((shape) => {
    drawShape(ctx, shape, centerX, centerY, zoom);
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
