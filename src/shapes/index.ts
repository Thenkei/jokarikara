import type { Shape, ShapeType } from "../utils/geometry";
import type { ShapeCreationOptions } from "../types";
import { COLORS, getUnlockedShapes } from "../constants/game";
import { getWorldPalette } from "../visual/theme";

/**
 * Shape factory following Open/Closed Principle.
 * Centralizes shape creation logic and allows extension.
 */

/**
 * Get a random color different from the last used color.
 */
export const getNextColor = (lastColor: string | null): string => {
  return getNextColorWithRoll(lastColor, Math.random());
};

/**
 * Deterministic color picker using an injected random roll.
 */
export const getNextColorWithRoll = (
  lastColor: string | null,
  randomValue: number,
): string => {
  const clamped = Math.min(0.999999999, Math.max(0, randomValue));
  let nextColor = COLORS[Math.floor(clamped * COLORS.length)];
  if (nextColor === lastColor) {
    const idx = COLORS.indexOf(nextColor);
    nextColor = COLORS[(idx + 1) % COLORS.length];
  }
  return nextColor;
};

/**
 * Get a random color from the provided palette, avoiding immediate repetition.
 */
export const getNextColorFromPalette = (
  palette: string[],
  lastColor: string | null,
  randomValue: number = Math.random(),
): string => {
  if (palette.length === 0) {
    return getNextColorWithRoll(lastColor, randomValue);
  }

  const clamped = Math.min(0.999999999, Math.max(0, randomValue));
  let nextColor = palette[Math.floor(clamped * palette.length)];
  if (nextColor === lastColor) {
    const idx = palette.indexOf(nextColor);
    nextColor = palette[(idx + 1) % palette.length];
  }
  return nextColor;
};

/**
 * Get a random shape type from the unlocked shapes at the given level.
 */
export const getRandomShapeType = (
  level: number,
  randomValue: number = Math.random(),
): ShapeType => {
  const unlockedShapes = getUnlockedShapes(level);
  const clamped = Math.min(0.999999999, Math.max(0, randomValue));
  return unlockedShapes[Math.floor(clamped * unlockedShapes.length)];
};

/**
 * Create a new shape with the given options.
 * Uses sensible defaults for any unspecified options.
 */
export const createShape = (options: ShapeCreationOptions = {}): Shape => {
  return {
    type: options.type ?? "circle",
    size: options.size ?? 100,
    rotation: options.rotation ?? 0,
    color: options.color ?? COLORS[0],
    opacity: options.opacity ?? 1,
  };
};

/**
 * Create the initial base shape for the game.
 * @param viewportSize - The smaller of viewport width/height
 */
export const createInitialShape = (viewportSize: number): Shape => {
  const size = viewportSize * 0.45;
  return createShape({
    type: "circle",
    size,
    color: COLORS[0],
    opacity: 1,
  });
};

/**
 * Create initial shape using the world-generated palette.
 */
export const createInitialShapeForWorld = (
  viewportSize: number,
  world: number,
  runSeed: number,
  reducedFx: boolean,
): Shape => {
  const palette = getWorldPalette(world, runSeed, reducedFx);
  return createShape({
    type: "circle",
    size: viewportSize * 0.45,
    color: palette[0] ?? COLORS[0],
    opacity: 1,
  });
};

/**
 * Create a new active shape based on game state.
 * @param level - Current game level (determines available shapes)
 * @param lastShape - The previous shape (to avoid color repetition)
 */
export const createActiveShape = (
  level: number,
  lastShape: Shape | null,
  world: number = 1,
  runSeed: number = 0,
  reducedFx: boolean = false,
  randoms?: {
    shapeRoll?: number;
    colorRoll?: number;
  },
): Shape => {
  const type = getRandomShapeType(level, randoms?.shapeRoll);
  const lastColor = lastShape?.color ?? null;
  const palette = getWorldPalette(world, runSeed, reducedFx);
  const color = getNextColorFromPalette(palette, lastColor, randoms?.colorRoll);

  // Start at a fraction of the last shape's size
  const startSize = lastShape ? lastShape.size * 0.05 : 10;

  return createShape({
    type,
    size: startSize,
    color,
    rotation: 0,
    opacity: 0.8,
  });
};
