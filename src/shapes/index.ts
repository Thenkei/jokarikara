import type { Shape, ShapeType } from "../utils/geometry";
import type { ShapeCreationOptions } from "../types";
import { COLORS, getUnlockedShapes } from "../constants/game";

/**
 * Shape factory following Open/Closed Principle.
 * Centralizes shape creation logic and allows extension.
 */

/**
 * Get a random color different from the last used color.
 */
export const getNextColor = (lastColor: string | null): string => {
  let nextColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  if (nextColor === lastColor) {
    const idx = COLORS.indexOf(nextColor);
    nextColor = COLORS[(idx + 1) % COLORS.length];
  }
  return nextColor;
};

/**
 * Get a random shape type from the unlocked shapes at the given level.
 */
export const getRandomShapeType = (level: number): ShapeType => {
  const unlockedShapes = getUnlockedShapes(level);
  return unlockedShapes[Math.floor(Math.random() * unlockedShapes.length)];
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
 * Create a new active shape based on game state.
 * @param level - Current game level (determines available shapes)
 * @param lastShape - The previous shape (to avoid color repetition)
 */
export const createActiveShape = (
  level: number,
  lastShape: Shape | null
): Shape => {
  const type = getRandomShapeType(level);
  const lastColor = lastShape?.color ?? null;
  const color = getNextColor(lastColor);

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
