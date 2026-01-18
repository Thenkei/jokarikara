import type { GameState } from "../types";
import type { Shape } from "../utils/geometry";
import { createActiveShape, createInitialShape } from "../shapes";
import { isContained } from "../utils/geometry";
import {
  MIN_GROWTH_SPEED,
  MAX_GROWTH_SPEED,
  STACKS_PER_LEVEL,
  getZoomForLevel,
  getWorldMechanics,
  type WorldMechanics,
} from "../constants/game";

/**
 * Create the initial game state.
 * @param viewportSize - The smaller of viewport width/height
 */
export const createInitialState = (viewportSize: number): GameState => {
  const initialShape = createInitialShape(viewportSize);
  return {
    shapes: [initialShape],
    activeShape: null,
    world: 1,
    score: 0,
    level: 1,
    zoom: getZoomForLevel(1),
    targetZoom: getZoomForLevel(1),
    initialSize: initialShape.size,
    currentSpeed: MIN_GROWTH_SPEED,
    isGameOver: false,
  };
};

/**
 * Generate a random growth speed for the active shape.
 */
export const generateRandomSpeed = (): number => {
  return (
    MIN_GROWTH_SPEED + Math.random() * (MAX_GROWTH_SPEED - MIN_GROWTH_SPEED)
  );
};

/**
 * Create a new active shape and update the state.
 */
export const spawnActiveShape = (state: GameState): GameState => {
  const lastShape = state.shapes[state.shapes.length - 1] ?? null;
  const activeShape = createActiveShape(state.level, lastShape);
  const currentSpeed = generateRandomSpeed();

  return {
    ...state,
    activeShape,
    currentSpeed,
  };
};

/**
 * Calculate growth speed multiplier based on world mechanics pattern.
 * @param pattern - The growth pattern from world mechanics
 * @param stackPositionInLevel - Current stack position within the level (0 to STACKS_PER_LEVEL-1)
 */
export const getGrowthMultiplier = (
  pattern: WorldMechanics["growthPattern"],
  stackPositionInLevel: number
): number => {
  switch (pattern) {
    case "linear":
      return 1;
    case "accelerating":
      // Speed increases each stack within level: 1x, 1.25x, 1.5x (for STACKS_PER_LEVEL=3)
      return 1 + stackPositionInLevel * 0.25;
    case "wave":
      // Sinusoidal pattern across level
      return (
        1 + Math.sin((stackPositionInLevel / STACKS_PER_LEVEL) * Math.PI) * 0.5
      );
  }
};

/**
 * Update the active shape's size and rotation based on delta time.
 * @param state - Current game state
 * @param dt - Delta time in seconds
 */
export const updateActiveShape = (state: GameState, dt: number): GameState => {
  if (!state.activeShape) return state;

  // Get world mechanics for growth pattern
  const mechanics = getWorldMechanics(state.world);
  const stackPositionInLevel = state.score % STACKS_PER_LEVEL;
  const growthPatternMultiplier = getGrowthMultiplier(
    mechanics.growthPattern,
    stackPositionInLevel
  );

  const difficultyMultiplier = 1 + state.score * 0.05;
  const growthIncrement =
    (state.currentSpeed * difficultyMultiplier * growthPatternMultiplier) /
    state.zoom;
  const rotationSpeed = 0.5 + Math.min(state.score * 0.05, 1.5);

  const updatedShape: Shape = {
    ...state.activeShape,
    size: state.activeShape.size + growthIncrement * dt,
    rotation: state.activeShape.rotation + rotationSpeed * dt,
  };

  return {
    ...state,
    activeShape: updatedShape,
  };
};

/**
 * Check if the active shape is still contained within the last stacked shape.
 */
export const checkContainment = (state: GameState): boolean => {
  if (!state.activeShape) return true;
  const lastShape = state.shapes[state.shapes.length - 1];
  return isContained(state.activeShape, lastShape);
};

/**
 * Stack the active shape and update score/level.
 * Returns the new state and whether a level-up occurred.
 */
export const stackActiveShape = (
  state: GameState
): {
  state: GameState;
  leveledUp: boolean;
  newLevel: number;
  worldUp: boolean;
} => {
  if (!state.activeShape) {
    return { state, leveledUp: false, newLevel: state.level, worldUp: false };
  }

  const newShapes = [...state.shapes, { ...state.activeShape, opacity: 1 }];
  const newScore = state.score + 1;
  let newLevel = Math.floor(newScore / STACKS_PER_LEVEL) + 1;
  let newWorld = state.world;
  let leveledUp = newLevel > state.level;
  let worldUp = false;

  let finalShapes = newShapes;

  if (newLevel > 5) {
    newWorld++;
    newLevel = 1;
    worldUp = true;
    leveledUp = true; // World up also counts as level up (to level 1 of next world)

    // Reset stack but keep the first shape as base
    const firstShape = newShapes[0];
    finalShapes = [{ ...firstShape, opacity: 1 }];
  }

  let newTargetZoom = state.targetZoom;
  if (leveledUp) {
    newTargetZoom = getZoomForLevel(newLevel);
  }

  return {
    state: {
      ...state,
      shapes: finalShapes,
      activeShape: null,
      world: newWorld,
      score: newScore,
      level: newLevel,
      targetZoom: newTargetZoom,
    },
    leveledUp,
    newLevel,
    worldUp,
  };
};

/**
 * Set the game over state.
 */
export const setGameOver = (state: GameState): GameState => {
  return {
    ...state,
    isGameOver: true,
  };
};

/**
 * Interpolate zoom smoothly towards target.
 * @param state - Current game state
 * @param dt - Delta time in seconds
 * @param lerpSpeed - Interpolation speed (default: 2)
 */
export const updateZoom = (
  state: GameState,
  dt: number,
  lerpSpeed: number = 2
): GameState => {
  if (Math.abs(state.zoom - state.targetZoom) <= 0.001) {
    return { ...state, zoom: state.targetZoom };
  }

  const newZoom = state.zoom + (state.targetZoom - state.zoom) * lerpSpeed * dt;
  return { ...state, zoom: newZoom };
};

/**
 * Update shape opacities (older shapes fade out).
 */
export const updateShapeOpacities = (state: GameState): GameState => {
  const updatedShapes = state.shapes.map((shape, index) => {
    const age = state.shapes.length - 1 - index;
    if (age > 10) {
      return { ...shape, opacity: Math.max(0, shape.opacity - 0.005) };
    }
    return shape;
  });

  return { ...state, shapes: updatedShapes };
};

/**
 * Apply subtle rotation drift to stacked shapes.
 */
export const updateShapeRotations = (state: GameState): GameState => {
  const updatedShapes = state.shapes.map((shape, index) => ({
    ...shape,
    rotation: shape.rotation + 0.005 * (index % 2 === 0 ? 1 : -1),
  }));

  return { ...state, shapes: updatedShapes };
};
