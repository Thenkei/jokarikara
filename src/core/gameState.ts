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
  LEVELS_PER_WORLD,
  TIME_ATTACK_START_TIME,
  PERFECT_STACK_TIME_BONUS,
  BOSS_SHAPES,
} from "../constants/game";
import type { GameMode } from "../types";

/**
 * Create the initial game state.
 * @param viewportSize - The smaller of viewport width/height
 */
export const createInitialState = (
  viewportSize: number,
  mode: GameMode = "CLASSIC"
): GameState => {
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
    mode,
    timeRemaining: mode === "TIME_ATTACK" ? TIME_ATTACK_START_TIME : undefined,
    isBossLevel: false,
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

  // Boss mechanics: Check if current level/score triggers a boss
  const isBossLevel = state.mode !== "ZEN" && !!BOSS_SHAPES[state.score + 1];

  let activeShape = createActiveShape(state.level, lastShape);

  if (isBossLevel) {
    const bossConfig = BOSS_SHAPES[state.score + 1];
    activeShape = {
      ...activeShape,
      type: bossConfig.type,
      color: bossConfig.hueShift ? "#ffffff" : activeShape.color, // white by default for boss
    };
  }

  const currentSpeed = generateRandomSpeed();

  return {
    ...state,
    activeShape,
    currentSpeed,
    isBossLevel,
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

  let bossMultiplier = 1;
  let bossRotationMultiplier = 1;

  if (state.isBossLevel) {
    const bossConfig = BOSS_SHAPES[state.score + 1];
    if (bossConfig) {
      bossMultiplier = bossConfig.growthSpeedMultiplier;
      bossRotationMultiplier = bossConfig.rotationSpeedMultiplier;
    }
  }

  const difficultyMultiplier = 1 + state.score * 0.05;
  const growthIncrement =
    (state.currentSpeed *
      difficultyMultiplier *
      growthPatternMultiplier *
      bossMultiplier) /
    state.zoom;
  const rotationSpeed =
    (0.5 + Math.min(state.score * 0.05, 1.5)) * bossRotationMultiplier;

  let color = state.activeShape.color;
  if (state.isBossLevel) {
    const time = Date.now() / 1000;
    const hue = (time * 100) % 360;
    color = `hsl(${hue}, 80%, 60%)`;
  }

  const updatedShape: Shape = {
    ...state.activeShape,
    size: state.activeShape.size + growthIncrement * dt,
    rotation: state.activeShape.rotation + rotationSpeed * dt,
    color,
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
  isPerfect: boolean;
} => {
  if (!state.activeShape) {
    return {
      state,
      leveledUp: false,
      newLevel: state.level,
      worldUp: false,
      isPerfect: false,
    };
  }

  const lastShape = state.shapes[state.shapes.length - 1];
  const sizeRatio = state.activeShape.size / lastShape.size;
  // A perfect stack is within 95% of the last shape's size
  const isPerfect = sizeRatio > 0.95;

  const newShapes = [...state.shapes, { ...state.activeShape, opacity: 1 }];
  const newScore = state.score + 1;

  // Time Attack: Bonus for perfect stack
  let newTimeRemaining = state.timeRemaining;
  if (
    state.mode === "TIME_ATTACK" &&
    isPerfect &&
    newTimeRemaining !== undefined
  ) {
    newTimeRemaining += PERFECT_STACK_TIME_BONUS;
  }

  const totalLevels = Math.floor(newScore / STACKS_PER_LEVEL);
  const newWorld = Math.floor(totalLevels / LEVELS_PER_WORLD) + 1;
  const newLevel = (totalLevels % LEVELS_PER_WORLD) + 1;

  const worldUp = newWorld > state.world;
  const leveledUp = worldUp || (newLevel > state.level && !worldUp);

  let finalShapes = newShapes;

  if (worldUp) {
    // Reset stack but keep the first shape as base
    const firstShape = newShapes[0];
    finalShapes = [{ ...firstShape, opacity: 1 }];
  }

  const newTargetZoom = getZoomForLevel(newLevel);

  return {
    state: {
      ...state,
      shapes: finalShapes,
      activeShape: null,
      world: newWorld,
      score: newScore,
      level: newLevel,
      targetZoom: newTargetZoom,
      timeRemaining: newTimeRemaining,
    },
    leveledUp,
    newLevel,
    worldUp,
    isPerfect,
  };
};

/**
 * Handle a missed stack based on the game mode.
 */
export const handleMiss = (state: GameState): GameState => {
  if (state.mode === "ZEN") {
    // In Zen mode, just reset the active shape size
    if (!state.activeShape) return state;
    return {
      ...state,
      activeShape: {
        ...state.activeShape,
        size: state.shapes[state.shapes.length - 1].size * 0.05, // Restart at initial size
      },
    };
  }
  return setGameOver(state);
};

/**
 * Update the timer for Time Attack mode.
 */
export const updateTimer = (state: GameState, dt: number): GameState => {
  if (state.mode !== "TIME_ATTACK" || state.timeRemaining === undefined)
    return state;

  const newTime = Math.max(0, state.timeRemaining - dt);
  const isGameOver = newTime <= 0;

  return {
    ...state,
    timeRemaining: newTime,
    isGameOver: isGameOver || state.isGameOver,
  };
};

/**
 * Restart the current active shape in Zen Mode (reset its size).
 */
export const restartActiveShape = (state: GameState): GameState => {
  if (!state.activeShape) {
    return state;
  }

  const lastShape = state.shapes[state.shapes.length - 1] ?? null;
  const newActiveShape = createActiveShape(state.level, lastShape);
  const currentSpeed = generateRandomSpeed();

  return {
    ...state,
    activeShape: newActiveShape,
    currentSpeed,
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
