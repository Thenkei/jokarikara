import type { Shape } from "../utils/geometry";
import { getStarVertices } from "../utils/geometry";
import type { WorldMechanics } from "../constants/game";
import type { FractureOverlay } from "../gameplay/fracture";
import {
  arenaDangerColor,
  DEFAULT_DANGER,
  MONO_HUE,
  toMonoColor,
  type DangerColors,
  type WorldTheme,
} from "../visual/theme";

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
  offsetX: number = 0,
  offsetY: number = 0,
): void => {
  const radius = size / 2;
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const x = offsetX + Math.cos(angle) * radius;
    const y = offsetY + Math.sin(angle) * radius;
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
  offsetX: number = 0,
  offsetY: number = 0,
): void => {
  ctx.beginPath();
  ctx.arc(offsetX, offsetY, size / 2, 0, Math.PI * 2);
};

/**
 * Draw a square path centered at origin.
 */
export const drawSquarePath = (
  ctx: CanvasRenderingContext2D,
  size: number,
  offsetX: number = 0,
  offsetY: number = 0,
): void => {
  ctx.beginPath();
  ctx.rect(offsetX - size / 2, offsetY - size / 2, size, size);
};

/**
 * Draw a rectangle path centered at origin.
 */
export const drawRectanglePath = (
  ctx: CanvasRenderingContext2D,
  size: number,
  offsetX: number = 0,
  offsetY: number = 0,
): void => {
  const height = size * 0.6;
  ctx.beginPath();
  ctx.rect(offsetX - size / 2, offsetY - height / 2, size, height);
};

/**
 * Draw a diamond path centered at origin.
 */
export const drawDiamondPath = (
  ctx: CanvasRenderingContext2D,
  size: number,
  offsetX: number = 0,
  offsetY: number = 0,
): void => {
  const height = size * 0.7;
  ctx.beginPath();
  ctx.moveTo(offsetX, offsetY - height / 2);
  ctx.lineTo(offsetX + size / 2, offsetY);
  ctx.lineTo(offsetX, offsetY + height / 2);
  ctx.lineTo(offsetX - size / 2, offsetY);
  ctx.closePath();
};

/**
 * Draw a star path centered at origin.
 */
export const drawStarPath = (
  ctx: CanvasRenderingContext2D,
  size: number,
  offsetX: number = 0,
  offsetY: number = 0,
): void => {
  const starVertices = getStarVertices(size, 0);
  ctx.beginPath();
  starVertices.forEach((p, i) => {
    if (i === 0) ctx.moveTo(offsetX + p.x, offsetY + p.y);
    else ctx.lineTo(offsetX + p.x, offsetY + p.y);
  });
  ctx.closePath();
};

type Hsl = { h: number; s: number; l: number };

/**
 * Palette colours are a small, fixed set per world, but colour-shift worlds
 * re-derive HSL for every stacked shape on every frame. Memoising the parse
 * removes that work from the hot path. Bounded to avoid unbounded growth if
 * callers ever feed dynamic colours.
 */
const HSL_CACHE_LIMIT = 256;
const hslCache = new Map<string, Hsl>();

const hexToHsl = (hexColor: string): Hsl => {
  const cached = hslCache.get(hexColor);
  if (cached) return cached;

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

  const result: Hsl = { h: h * 360, s: s * 100, l: l * 100 };
  if (hslCache.size >= HSL_CACHE_LIMIT) hslCache.clear();
  hslCache.set(hexColor, result);
  return result;
};

/**
 * Trace the path of a shape of the given type, centred at the origin or at
 * an offset in the current (rotated) frame. Caller is responsible for
 * transforms, fill and stroke.
 */
export const traceShapePath = (
  ctx: CanvasRenderingContext2D,
  type: Shape["type"],
  size: number,
  offsetX: number = 0,
  offsetY: number = 0,
): void => {
  switch (type) {
    case "circle":
      drawCirclePath(ctx, size, offsetX, offsetY);
      break;
    case "square":
      drawSquarePath(ctx, size, offsetX, offsetY);
      break;
    case "triangle":
      drawRegularPolygonPath(ctx, 3, size, offsetX, offsetY);
      break;
    case "rectangle":
      drawRectanglePath(ctx, size, offsetX, offsetY);
      break;
    case "pentagon":
      drawRegularPolygonPath(ctx, 5, size, offsetX, offsetY);
      break;
    case "hexagon":
      drawRegularPolygonPath(ctx, 6, size, offsetX, offsetY);
      break;
    case "octagon":
      drawRegularPolygonPath(ctx, 8, size, offsetX, offsetY);
      break;
    case "diamond":
      drawDiamondPath(ctx, size, offsetX, offsetY);
      break;
    case "star":
      drawStarPath(ctx, size, offsetX, offsetY);
      break;
  }
};

/** Visual weight of the PERFECT guide: idle vs. while inside the band. */
export const PERFECT_GUIDE_ALPHA = { idle: 0.22, active: 0.75 } as const;

/**
 * Ghost outline of the active shape at the size that would score PERFECT.
 * It rotates with the active shape, so when it pokes outside the container the
 * player can see a PERFECT is not reachable at the current angle.
 */
export const drawPerfectGuide = (
  ctx: CanvasRenderingContext2D,
  active: Shape,
  perfectSize: number,
  x: number,
  y: number,
  zoom: number,
  inPerfectBand: boolean,
  color: string = "#ffffff",
): void => {
  if (perfectSize <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(active.rotation);
  traceShapePath(ctx, active.type, perfectSize * zoom);
  ctx.globalAlpha = inPerfectBand
    ? PERFECT_GUIDE_ALPHA.active
    : PERFECT_GUIDE_ALPHA.idle;
  ctx.strokeStyle = color;
  ctx.lineWidth = inPerfectBand ? 2.5 : 1.5;
  if (typeof ctx.setLineDash === "function") {
    ctx.setLineDash(inPerfectBand ? [] : [6, 6]);
  }
  ctx.stroke();
  ctx.restore();
};

/** Arena reach (growing shape radius / arena radius) where the rim warns. */
export const ARENA_WARNING_REACH = 0.8;

/**
 * Outer limit of reverse worlds: a circle the growing shape must not cross.
 * It brightens and warms to the danger colour as the growing shape approaches
 * it (red, or Mono's red-orange), and breathes with the scene pulse
 * (heartbeat-aware). Colours come from the theme's precomputed ramp and the
 * alpha goes through `globalAlpha`, so a frame builds no colour string.
 */
export const drawArena = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusPx: number,
  reach: number,
  pulse: number,
  danger: DangerColors = DEFAULT_DANGER,
): void => {
  if (radiusPx <= 0) return;
  const level = Math.min(
    1,
    Math.max(0, (reach - ARENA_WARNING_REACH) / (1 - ARENA_WARNING_REACH)),
  );
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
  ctx.globalAlpha = Math.min(1, 0.22 + level * 0.55 + pulse * 0.08);
  ctx.strokeStyle = arenaDangerColor(danger, level);
  ctx.lineWidth = 2 + level * 2;
  if (typeof ctx.setLineDash === "function") {
    ctx.setLineDash(level > 0 ? [] : [10, 8]);
  }
  ctx.stroke();
  ctx.restore();
};

/**
 * Convert hex color to HSL and shift hue.
 */
const shiftHue = (hexColor: string, hueShift: number): string => {
  const { h, s, l } = hexToHsl(hexColor);
  return `hsl(${(h + hueShift) % 360}, ${s}%, ${l}%)`;
};

/**
 * Cast shadow without shadowBlur. A Gaussian shadow blur is a full
 * convolution of the shape on every frame: measured with 4x CPU throttling on
 * a world-5 stack, it dropped the game to 8-15 FPS versus 61 FPS without it.
 *
 * Instead the shape's outline is stroked a little lower, under its own fill:
 * the fill hides the half that falls inside, and what is left is a dark band
 * along the lower edge, on the layer below. Two passes (a wide faint one, a
 * narrow darker one against the edge) read as a soft shadow for the cost of
 * two outline strokes: perimeter, not area.
 *
 * `offset` and `width` are in units of the theme's shadow depth; `alpha`
 * scales the theme's shadow colour.
 */
export const CAST_SHADOW: ReadonlyArray<{
  offset: number;
  width: number;
  alpha: number;
}> = [
  { offset: 1, width: 2, alpha: 0.55 },
  { offset: 0.5, width: 1, alpha: 1 },
];

/** Without a theme (tests, fallbacks): a neutral shadow and rim. */
const DEFAULT_MATERIAL = {
  stroke: "rgba(255, 255, 255, 0.34)",
  lineWidth: 1.25,
  activeStroke: "rgba(255, 255, 255, 0.88)",
  activeLineWidth: 2,
  shadow: "rgba(0, 0, 0, 0.26)",
  depth: 4,
} as const;

/**
 * Below this alpha a shape contributes nothing visible; skipping it saves a
 * full path + fill + blurred stroke.
 */
export const MIN_VISIBLE_OPACITY = 0.01;

/** Eclipse container outline (alpha pulses per frame, as before). */
const eclipseStroke = (alpha: number, mono: boolean): string =>
  mono ? `hsla(${MONO_HUE}, 100%, 88%, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;

const drawFractureOverlay = (
  ctx: CanvasRenderingContext2D,
  size: number,
  shapeRotation: number,
  overlay: FractureOverlay,
  reducedFx: boolean,
  colors: DangerColors["fracture"] = DEFAULT_DANGER.fracture,
): void => {
  const radius = size / 2;
  const halfWidth = overlay.widthRad / 2;

  ctx.save();
  ctx.strokeStyle = reducedFx ? colors.reduced : colors.stroke;
  const lineWidth = reducedFx ? Math.max(4, size * 0.03) : Math.max(6, size * 0.045);
  ctx.lineCap = "round";

  for (const center of overlay.centers) {
    const correctedCenter = center - shapeRotation;
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      radius,
      correctedCenter - halfWidth,
      correctedCenter + halfWidth,
    );
    if (!reducedFx) {
      // Wide faint stroke instead of shadowBlur (see CAST_SHADOW).
      ctx.strokeStyle = colors.glow;
      ctx.lineWidth = lineWidth + Math.max(10, size * 0.07);
      ctx.stroke();
      ctx.strokeStyle = colors.stroke;
    }
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  ctx.restore();
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
 * @param castShadow - Lift the shape off the layer below with a cast
 *   shadow (two offset strokes, never shadowBlur: see CAST_SHADOW). Off for
 *   deep layers, which are mostly covered.
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
  theme?: WorldTheme,
  fractureOverlay?: FractureOverlay,
  castShadow: boolean = true,
): void => {
  if (shape.opacity < MIN_VISIBLE_OPACITY) return;

  ctx.save();
  ctx.translate(x, y);

  // Wave effect: horizontal displacement (stacked shapes only)
  if (mechanics.waveEffect && isStacked) {
    const waveMultiplier = theme?.fx.waveMultiplier ?? 1;
    const wave =
      Math.sin(time * mechanics.waveSpeed + stackIndex * 0.5) *
      mechanics.waveAmplitude *
      waveMultiplier;
    ctx.translate(wave, 0);
  }

  ctx.rotate(shape.rotation);

  let opacity = shape.opacity;
  if (mechanics.eclipseEffect && isStacked) {
    // In Eclipse mode, stacked shapes are almost invisible unless they are the container pulsing
    opacity = isContainer ? 0.05 : 0.02;
  }
  ctx.globalAlpha = opacity;

  // Color shift effect (stacked shapes only; off in Mono, which is one hue)
  const mono = theme?.mono ?? false;
  let fillColor = mono ? toMonoColor(shape.color) : shape.color;
  if (mechanics.colorShift && isStacked && !mono) {
    const hueShiftMultiplier = theme?.fx.hueShiftMultiplier ?? 1;
    const hueShift =
      time * mechanics.colorShiftSpeed * hueShiftMultiplier + stackIndex * 30;
    fillColor = shiftHue(shape.color, hueShift);
  }
  ctx.fillStyle = fillColor;

  // Calculate size with breathing effect (stacked shapes only)
  let sizeMultiplier = 1;
  if (mechanics.breathingEffect && isStacked) {
    const breathingMultiplier = theme?.fx.breathingMultiplier ?? 1;
    sizeMultiplier =
      1 +
      Math.sin(time * mechanics.breathingSpeed + stackIndex * 0.3) *
        mechanics.breathingAmplitude *
        breathingMultiplier;
  }

  const size = shape.size * zoom * sizeMultiplier;
  const material = theme?.shape ?? DEFAULT_MATERIAL;

  if (castShadow && material.depth > 0) {
    // "Down" on screen, expressed in the shape's rotated frame, so the
    // shadow falls the same way whatever the shape's angle. The offset goes
    // into the path itself: no extra transform per pass.
    const downX = Math.sin(shape.rotation) * material.depth;
    const downY = Math.cos(shape.rotation) * material.depth;
    const baseAlpha = ctx.globalAlpha;
    ctx.lineJoin = "round"; // wide strokes must not grow spiky miters
    ctx.strokeStyle = material.shadow;
    for (const pass of CAST_SHADOW) {
      traceShapePath(ctx, shape.type, size, downX * pass.offset, downY * pass.offset);
      ctx.globalAlpha = baseAlpha * pass.alpha;
      ctx.lineWidth = material.depth * pass.width;
      ctx.stroke();
    }
    ctx.globalAlpha = baseAlpha;
  }

  traceShapePath(ctx, shape.type, size);

  ctx.fill();

  // Lit rim: the growing shape's is brighter and heavier, since its edge is
  // the one the player times.
  let strokeStyle = isStacked ? material.stroke : material.activeStroke;
  let lineWidth = isStacked ? material.lineWidth : material.activeLineWidth;

  if (mechanics.eclipseEffect && isContainer) {
    // Pulse the outline of the container shape
    const pulse =
      (Math.sin(time * Math.PI * 2 * mechanics.eclipsePulseSpeed) + 1) / 2;
    const flash = theme?.fx.flashMultiplier ?? 1;
    strokeStyle = eclipseStroke(0.1 + pulse * 0.5 * flash, mono);
    lineWidth = 4;
  }

  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  if (isContainer && fractureOverlay) {
    drawFractureOverlay(
      ctx,
      size,
      shape.rotation,
      fractureOverlay,
      theme?.reducedFx ?? false,
      theme?.danger.fracture,
    );
  }

  ctx.restore();
};

/** Share of the ground's centre light left during an eclipse. */
export const ECLIPSE_GROUND_LIGHT = 0.3;

/**
 * Draw the ground: a deep tone of the world's hue, lit at the centre.
 */
export const drawBackground = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pulse: number,
  mechanics?: WorldMechanics,
  theme?: WorldTheme,
): void => {
  const centerX = width / 2;
  const centerY = height / 2;

  if (mechanics?.eclipseEffect) {
    // Lights out: the ground keeps only a trace of its lit centre.
    ctx.fillStyle = theme?.background.base ?? "#100e0eff";
    ctx.fillRect(0, 0, width, height);

    const grad = ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      width * 0.5,
    );
    grad.addColorStop(0, theme?.background.innerGlow ?? `rgba(255, 255, 255, ${0.01 + pulse * 0.005})`);
    grad.addColorStop(1, theme?.background.vignette ?? "rgba(0, 0, 0, 0)");
    const baseAlpha = ctx.globalAlpha;
    if (theme) ctx.globalAlpha = baseAlpha * ECLIPSE_GROUND_LIGHT;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = baseAlpha;
    return;
  }

  ctx.fillStyle = theme?.background.base ?? "#0c0c0e";
  ctx.fillRect(0, 0, width, height);

  const grad = ctx.createRadialGradient(
    centerX,
    centerY,
    0,
    centerX,
    centerY,
    width * 0.8,
  );
  grad.addColorStop(
    0,
    theme?.background.innerGlow ?? `rgba(255, 255, 255, ${0.03 + pulse * 0.02})`,
  );
  grad.addColorStop(1, theme?.background.outerGlow ?? "rgba(0, 0, 0, 0)");
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
  theme?: WorldTheme,
): void => {
  shapes.forEach((shape, index) => {
    drawShape(
      ctx,
      shape,
      centerX,
      centerY,
      zoom,
      mechanics,
      time,
      true,
      index,
      false,
      theme,
    );
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
