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
  // We keep bosses in ZEN mode for visual variety and testing,
  // but they won't end the game on miss.
  const isBossLevel = !!BOSS_SHAPES[state.score + 1];

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
  let pulseOffset = 0;
  let finalRotationSpeed = 0;

  const time = Date.now() / 1000;

  if (state.isBossLevel) {
    const bossConfig = BOSS_SHAPES[state.score + 1];
    if (bossConfig) {
      bossMultiplier = bossConfig.growthSpeedMultiplier;
      bossRotationMultiplier = bossConfig.rotationSpeedMultiplier;

      if (bossConfig.pulseEnabled) {
        // Pulsing: adds a sinusoidal oscillation to the size
        // Speed and amplitude scale with score/difficulty
        const pulseSpeed = 4 + state.score * 0.1;
        const pulseAmplitude = 5 + state.score * 0.2;
        pulseOffset = Math.sin(time * pulseSpeed) * pulseAmplitude;
      }

      const baseRotationSpeed =
        (0.5 + Math.min(state.score * 0.05, 1.5)) * bossRotationMultiplier;

      if (bossConfig.erraticRotationEnabled) {
        // Erratic rotation: varies the rotation speed over time
        const erraticFreq = 2 + state.score * 0.05;
        finalRotationSpeed =
          baseRotationSpeed * (1 + Math.sin(time * erraticFreq) * 0.5);
      } else {
        finalRotationSpeed = baseRotationSpeed;
      }
    }
  } else {
    finalRotationSpeed = 0.5 + Math.min(state.score * 0.05, 1.5);
  }

  const difficultyMultiplier = 1 + state.score * 0.05;
  const growthIncrement =
    (state.currentSpeed *
      difficultyMultiplier *
      growthPatternMultiplier *
      bossMultiplier) /
    state.zoom;

  let color = state.activeShape.color;
  if (state.isBossLevel) {
    const hue = (time * 100) % 360;
    color = `hsl(${hue}, 80%, 60%)`;
  }

  const baseSize = state.activeShape.size + growthIncrement * dt;
  const updatedShape: Shape = {
    ...state.activeShape,
    size: baseSize + pulseOffset * dt, // Apply pulse as a rate change or absolute offset?
    // If I apply it as pulseOffset * dt, it's more like a speed variation.
    // If I apply it as baseSize + pulseOffset, it's an oscillation around the base size.
    // Let's go with oscillation around base size for better visual "pulsing".
    rotation: state.activeShape.rotation + finalRotationSpeed * dt,
    color,
  };

  // However, if I use pulseOffset directly, it might jump since I'm not storing the "base size" separately.
  // Let's refine this to be a speed variation instead, or store baseSize in the state if needed.
  // Actually, a speed variation is easier to implement without changing state structure.

  const updatedShapeWithPulse: Shape = {
    ...updatedShape,
    size: baseSize + pulseOffset * 5 * dt, // Scale pulseOffset to be a speed change
  };

  return {
    ...state,
    activeShape: updatedShapeWithPulse,
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
 * Undo the last stack operation in Zen Mode.
 */
export const undoLastStack = (state: GameState): GameState => {
  if (state.mode !== "ZEN" || state.shapes.length <= 1) {
    return state;
  }

  // Remove the last shape
  const newShapes = state.shapes.slice(0, -1);
  const newScore = Math.max(0, state.score - 1);

  // Recalculate level/world
  const totalLevels = Math.floor(newScore / STACKS_PER_LEVEL);
  const newWorld = Math.floor(totalLevels / LEVELS_PER_WORLD) + 1;
  const newLevel = (totalLevels % LEVELS_PER_WORLD) + 1;
  const newTargetZoom = getZoomForLevel(newLevel);

  return {
    ...state,
    shapes: newShapes,
    score: newScore,
    world: newWorld,
    level: newLevel,
    targetZoom: newTargetZoom,
    activeShape: null, // Force spawn of new shape
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
