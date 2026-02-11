import type { GameState, StackQuality } from "../types";
import type { Shape } from "../utils/geometry";
import { createActiveShape, createInitialShapeForWorld } from "../shapes";
import { getVertices, isContained, isPointInShape } from "../utils/geometry";
import {
  MIN_GROWTH_SPEED,
  MAX_GROWTH_SPEED,
  STACKS_PER_LEVEL,
  getZoomForLevel,
  getWorldMechanics,
  type WorldMechanics,
  TIME_ATTACK_START_TIME,
  PERFECT_STACK_TIME_BONUS,
  REFERENCE_INITIAL_SIZE,
  ZEN_MAX_LIVES,
  getBossConfigForScore,
  computeProgression,
} from "../constants/game";
import type { GameMode } from "../types";

const STYLE_SCORE_BY_QUALITY: Record<StackQuality, number> = {
  PERFECT: 140,
  GREAT: 90,
  GOOD: 50,
  OK: 25,
};

export const getStackQuality = (sizeRatio: number): StackQuality => {
  if (sizeRatio >= 0.97) return "PERFECT";
  if (sizeRatio >= 0.92) return "GREAT";
  if (sizeRatio >= 0.82) return "GOOD";
  return "OK";
};

/**
 * Create the initial game state.
 * @param viewportSize - The smaller of viewport width/height
 */
export const createInitialState = (
  viewportSize: number,
  mode: GameMode = "CLASSIC",
  runSeed: number = 0,
  reducedFx: boolean = false,
): GameState => {
  const initialShape = createInitialShapeForWorld(
    viewportSize,
    1,
    runSeed,
    reducedFx,
  );
  return {
    shapes: [initialShape],
    activeShape: null,
    activeOffset: { x: 0, y: 0 },
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
    zenLivesRemaining: mode === "ZEN" ? ZEN_MAX_LIVES : undefined,
    isBossLevel: false,
    runSeed,
    styleScore: 0,
    streak: 0,
    bestStreak: 0,
    lastStackQuality: null,
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
export const spawnActiveShape = (
  state: GameState,
  reducedFx: boolean = false,
): GameState => {
  const lastShape = state.shapes[state.shapes.length - 1] ?? null;

  // Boss mechanics: Check if current level/score triggers a boss
  // We keep bosses in ZEN mode for visual variety and testing,
  // but they won't end the game on miss.
  const bossConfig = getBossConfigForScore(state.score + 1);
  const isBossLevel = !!bossConfig;

  let activeShape = createActiveShape(
    state.level,
    lastShape,
    state.world,
    state.runSeed,
    reducedFx,
  );

  if (isBossLevel && bossConfig) {
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
    activeOffset: { x: 0, y: 0 },
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
    const bossConfig = getBossConfigForScore(state.score + 1);
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
  // Normalize growth speed by initial shape size so gameplay feels consistent across screen sizes
  const sizeNormalization = state.initialSize / REFERENCE_INITIAL_SIZE;
  const growthIncrement =
    (state.currentSpeed *
      difficultyMultiplier *
      growthPatternMultiplier *
      bossMultiplier *
      sizeNormalization) /
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

  let activeOffset = state.activeOffset ?? { x: 0, y: 0 };
  if (mechanics.gravityDrift) {
    const drift = mechanics.gravityDriftSpeed * sizeNormalization * dt;
    activeOffset = { x: activeOffset.x, y: activeOffset.y + drift };
  }

  return {
    ...state,
    activeShape: updatedShapeWithPulse,
    activeOffset,
  };
};

/**
 * Check if the active shape is still contained within the last stacked shape.
 */
export const checkContainment = (state: GameState): boolean => {
  if (!state.activeShape) return true;
  const lastShape = state.shapes[state.shapes.length - 1];
  const offset = state.activeOffset;
  if (!offset || (offset.x === 0 && offset.y === 0)) {
    return isContained(state.activeShape, lastShape);
  }
  const childVertices = getVertices(state.activeShape);
  return childVertices.every((v) =>
    isPointInShape({ x: v.x + offset.x, y: v.y + offset.y }, lastShape)
  );
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
  quality: StackQuality;
} => {
  if (!state.activeShape) {
    return {
      state,
      leveledUp: false,
      newLevel: state.level,
      worldUp: false,
      isPerfect: false,
      quality: "OK",
    };
  }

  const lastShape = state.shapes[state.shapes.length - 1];
  const sizeRatio = state.activeShape.size / lastShape.size;
  const quality = getStackQuality(sizeRatio);
  const isPerfect = quality === "PERFECT";

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

  const { world: newWorld, level: newLevel } = computeProgression(newScore);

  const worldUp = newWorld > state.world;
  const leveledUp = worldUp || (newLevel > state.level && !worldUp);

  let finalShapes = newShapes;

  if (worldUp) {
    // Reset stack but keep the first shape as base
    const firstShape = newShapes[0];
    finalShapes = [{ ...firstShape, opacity: 1 }];
  }

  const newTargetZoom = getZoomForLevel(newLevel);
  const styleEnabled = state.mode !== "ZEN";
  const streak = styleEnabled ? state.streak + 1 : state.streak;
  const styleIncrement = styleEnabled
    ? STYLE_SCORE_BY_QUALITY[quality] + streak * 5
    : 0;
  const bestStreak = styleEnabled ? Math.max(state.bestStreak, streak) : 0;

  return {
    state: {
      ...state,
      shapes: finalShapes,
      activeShape: null,
      activeOffset: { x: 0, y: 0 },
      world: newWorld,
      score: newScore,
      level: newLevel,
      targetZoom: newTargetZoom,
      timeRemaining: newTimeRemaining,
      styleScore: styleEnabled ? state.styleScore + styleIncrement : state.styleScore,
      streak,
      bestStreak,
      lastStackQuality: styleEnabled ? quality : null,
    },
    leveledUp,
    newLevel,
    worldUp,
    isPerfect,
    quality,
  };
};

/**
 * Handle a missed stack based on the game mode.
 */
export const handleMiss = (state: GameState): GameState => {
  if (state.mode === "ZEN") {
    if (!state.activeShape) return state;
    const nextLives = Math.max(
      0,
      (state.zenLivesRemaining ?? ZEN_MAX_LIVES) - 1,
    );
    const nextState: GameState = {
      ...state,
      zenLivesRemaining: nextLives,
      activeShape: {
        ...state.activeShape,
        size: state.shapes[state.shapes.length - 1].size * 0.05, // Restart at initial size
      },
      activeOffset: { x: 0, y: 0 },
    };
    if (nextLives <= 0) {
      return setGameOver(nextState);
    }
    return nextState;
  }
  return setGameOver({
    ...state,
    streak: 0,
    lastStackQuality: null,
  });
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
export const restartActiveShape = (
  state: GameState,
  reducedFx: boolean = false,
): GameState => {
  if (!state.activeShape) {
    return state;
  }

  const lastShape = state.shapes[state.shapes.length - 1] ?? null;
  const newActiveShape = createActiveShape(
    state.level,
    lastShape,
    state.world,
    state.runSeed,
    reducedFx,
  );
  const currentSpeed = generateRandomSpeed();

  return {
    ...state,
    activeShape: newActiveShape,
    currentSpeed,
    activeOffset: { x: 0, y: 0 },
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
  const { world: newWorld, level: newLevel } = computeProgression(newScore);
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
  const mechanics = getWorldMechanics(state.world);
  const invertByLevel = mechanics.rotationInvertByLevel && state.level % 2 === 0;
  const invertForBoss = mechanics.rotationFlipOnBoss && state.isBossLevel;
  const inversion = (invertByLevel ? -1 : 1) * (invertForBoss ? -1 : 1);

  const updatedShapes = state.shapes.map((shape, index) => {
    const direction = (index % 2 === 0 ? 1 : -1) * inversion;
    return {
      ...shape,
      rotation: shape.rotation + 0.005 * direction,
    };
  });

  return { ...state, shapes: updatedShapes };
};
