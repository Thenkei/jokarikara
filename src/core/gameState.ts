import type {
  EndReason,
  GameState,
  MissMargin,
  MissReason,
  StackQuality,
} from "../types";
import type { Shape } from "../utils/geometry";
import { createActiveShape, createInitialShapeForWorld } from "../shapes";
import {
  getLargestFittingSize,
  getVertices,
  isContained,
  isPointInShape,
} from "../utils/geometry";
import {
  MIN_GROWTH_SPEED,
  MAX_GROWTH_SPEED,
  STACKS_PER_LEVEL,
  LEVELS_PER_WORLD,
  getZoomForLevel,
  getWorldMechanics,
  type WorldMechanics,
  TIME_ATTACK_START_TIME,
  PERFECT_STACK_TIME_BONUS,
  GREAT_STACK_TIME_BONUS,
  TIME_ATTACK_MISS_PENALTY,
  REFERENCE_INITIAL_SIZE,
  STYLE_QUALITY_THRESHOLDS,
  STYLE_QUALITY_POINTS,
  STYLE_STREAK_BONUS_PER_STACK,
  ZEN_MAX_LIVES,
  getBossConfigForScore,
  computeProgression,
} from "../constants/game";
import type { GameMode } from "../types";
import { nextRandomUnit, seedRng } from "../utils/random";
import {
  containsPrevious,
  createReverseSeed,
  getLargestArenaSize,
  getReverseQualityRatio,
  getReverseWrapSize,
  getReverseZoom,
  isReverseWorld,
  isWithinArena,
  REVERSE_SPAWN_RATIO,
} from "../gameplay/reverse";
import { getBeatPhase, getHeartbeatMultiplier } from "../gameplay/heartbeat";
import { getPerfectBandEntrySize } from "../gameplay/guide";
import { isTapBlockedByFracture } from "../gameplay/fracture";

/** Regular worlds: a new shape starts at this fraction of its container. */
const NORMAL_SPAWN_RATIO = 0.05;

/** Size a freshly spawned (or reset) growing shape starts at in this world. */
const getSpawnSize = (world: number, lastShape: Shape | null): number | null =>
  lastShape
    ? lastShape.size *
      (isReverseWorld(world) ? REVERSE_SPAWN_RATIO : NORMAL_SPAWN_RATIO)
    : null;

/** Camera target for a world/level given the current top of the stack. */
export const getTargetZoomFor = (
  world: number,
  level: number,
  initialSize: number,
  lastShape: Shape | undefined,
): number =>
  isReverseWorld(world) && lastShape
    ? getReverseZoom(initialSize, lastShape.size)
    : getZoomForLevel(level);

const STYLE_SCORE_BY_QUALITY: Record<StackQuality, number> = {
  PERFECT: STYLE_QUALITY_POINTS.perfect,
  GREAT: STYLE_QUALITY_POINTS.great,
  GOOD: STYLE_QUALITY_POINTS.good,
  OK: STYLE_QUALITY_POINTS.ok,
};

export const getStackQuality = (sizeRatio: number): StackQuality => {
  if (sizeRatio >= STYLE_QUALITY_THRESHOLDS.perfectMinRatio) return "PERFECT";
  if (sizeRatio >= STYLE_QUALITY_THRESHOLDS.greatMinRatio) return "GREAT";
  if (sizeRatio >= STYLE_QUALITY_THRESHOLDS.goodMinRatio) return "GOOD";
  return "OK";
};

const consumeRandom = (state: GameState): { state: GameState; value: number } => {
  const next = nextRandomUnit(state.rngState);
  return {
    state: {
      ...state,
      rngState: next.nextState,
    },
    value: next.value,
  };
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
  startWorld: number = 1,
): GameState => {
  // Practice runs start at level 1 of a later world. The stack count is set
  // to that world's first stack so progression, difficulty and bosses match
  // what a player arriving there naturally would face.
  const world = Math.max(1, Math.floor(startWorld));
  const stackCount = (world - 1) * STACKS_PER_LEVEL * LEVELS_PER_WORLD;
  const baseShape = createInitialShapeForWorld(
    viewportSize,
    world,
    runSeed,
    reducedFx,
  );
  const initialSize = baseShape.size;
  const initialShape = isReverseWorld(world)
    ? createReverseSeed(baseShape, initialSize)
    : baseShape;
  const zoom = getTargetZoomFor(world, 1, initialSize, initialShape);
  return {
    shapes: [initialShape],
    activeShape: null,
    activeOffset: { x: 0, y: 0 },
    world,
    score: 0,
    stackCount,
    scoreHistory: [],
    level: 1,
    zoom,
    targetZoom: zoom,
    initialSize,
    currentSpeed: MIN_GROWTH_SPEED,
    isGameOver: false,
    mode,
    timeRemaining: mode === "TIME_ATTACK" ? TIME_ATTACK_START_TIME : undefined,
    zenLivesRemaining: mode === "ZEN" ? ZEN_MAX_LIVES : undefined,
    isBossLevel: false,
    runSeed,
    rngState: seedRng(runSeed),
    elapsedTime: 0,
    lastMissReason: null,
    lastMissMargin: null,
    perfectBandEnteredAt: null,
    styleScore: 0,
    streak: 0,
    bestStreak: 0,
    perfectCount: 0,
    lastStackQuality: null,
  };
};

/**
 * Generate a random growth speed for the active shape.
 */
export const generateRandomSpeed = (randomValue: number = Math.random()): number => {
  const clamped = Math.min(0.999999999, Math.max(0, randomValue));
  return MIN_GROWTH_SPEED + clamped * (MAX_GROWTH_SPEED - MIN_GROWTH_SPEED);
};

/**
 * Create a new active shape and update the state.
 */
export const spawnActiveShape = (
  state: GameState,
  reducedFx: boolean = false,
): GameState => {
  let nextState = state;
  const lastShape = nextState.shapes[nextState.shapes.length - 1] ?? null;

  // Boss mechanics: Check if the upcoming stack count triggers a boss
  // We keep bosses in ZEN mode for visual variety and testing,
  // but they won't end the game on miss.
  const bossConfig = getBossConfigForScore(nextState.stackCount + 1);
  const isBossLevel = !!bossConfig;

  const shapeRandom = consumeRandom(nextState);
  nextState = shapeRandom.state;
  const colorRandom = consumeRandom(nextState);
  nextState = colorRandom.state;
  let activeShape = createActiveShape(
    nextState.level,
    lastShape,
    nextState.world,
    nextState.runSeed,
    reducedFx,
    {
      shapeRoll: shapeRandom.value,
      colorRoll: colorRandom.value,
    },
  );

  if (isBossLevel && bossConfig) {
    activeShape = {
      ...activeShape,
      type: bossConfig.type,
      color: bossConfig.hueShift ? "#ffffff" : activeShape.color, // white by default for boss
    };
  }

  const spawnSize = getSpawnSize(nextState.world, lastShape);
  if (spawnSize !== null) {
    activeShape = { ...activeShape, size: spawnSize };
  }

  const speedRandom = consumeRandom(nextState);
  nextState = speedRandom.state;
  const currentSpeed = generateRandomSpeed(speedRandom.value);

  return {
    ...nextState,
    activeShape,
    currentSpeed,
    isBossLevel,
    activeOffset: { x: 0, y: 0 },
    perfectBandEnteredAt: null,
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
  const stackPositionInLevel = state.stackCount % STACKS_PER_LEVEL;
  const growthPatternMultiplier = getGrowthMultiplier(
    mechanics.growthPattern,
    stackPositionInLevel
  );

  let bossMultiplier = 1;
  let bossRotationMultiplier = 1;
  let pulseOffset = 0;
  let finalRotationSpeed = 0;

  // Game clock, not wall clock: frozen while paused.
  const time = state.elapsedTime;

  if (state.isBossLevel) {
    const bossConfig = getBossConfigForScore(state.stackCount + 1);
    if (bossConfig) {
      bossMultiplier = bossConfig.growthSpeedMultiplier;
      bossRotationMultiplier = bossConfig.rotationSpeedMultiplier;

      if (bossConfig.pulseEnabled) {
        // Pulsing: adds a sinusoidal oscillation to the size
        // Speed and amplitude scale with stack count/difficulty
        const pulseSpeed = 4 + state.stackCount * 0.1;
        const pulseAmplitude = 5 + state.stackCount * 0.2;
        pulseOffset = Math.sin(time * pulseSpeed) * pulseAmplitude;
      }

      const baseRotationSpeed =
        (0.5 + Math.min(state.stackCount * 0.05, 1.5)) *
        bossRotationMultiplier;

      if (bossConfig.erraticRotationEnabled) {
        // Erratic rotation: varies the rotation speed over time
        const erraticFreq = 2 + state.stackCount * 0.05;
        finalRotationSpeed =
          baseRotationSpeed * (1 + Math.sin(time * erraticFreq) * 0.5);
      } else {
        finalRotationSpeed = baseRotationSpeed;
      }
    }
  } else {
    finalRotationSpeed = 0.5 + Math.min(state.stackCount * 0.05, 1.5);
  }

  const heartbeatMultiplier = mechanics.heartbeat
    ? getHeartbeatMultiplier(getBeatPhase(time, mechanics.heartbeatBpm))
    : 1;

  const difficultyMultiplier = 1 + state.stackCount * 0.05;
  // Normalize growth speed by initial shape size so gameplay feels consistent across screen sizes
  const sizeNormalization = state.initialSize / REFERENCE_INITIAL_SIZE;
  const growthIncrement =
    (state.currentSpeed *
      difficultyMultiplier *
      growthPatternMultiplier *
      heartbeatMultiplier *
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
    perfectBandEnteredAt: trackPerfectBandEntry(
      state,
      updatedShapeWithPulse.size,
      dt,
    ),
  };
};

/**
 * Clock time the growing shape entered the PERFECT band, updated for a frame
 * that grew it from `state.activeShape.size` to `newSize`. The loop advances
 * the clock before growing, so the frame spans [elapsedTime − dt,
 * elapsedTime]; the crossing is interpolated linearly inside it. A shape
 * already past the band entry (spawned or forced there) counts from the frame
 * start. Numbers only: no allocation in the per-frame path.
 */
const trackPerfectBandEntry = (
  state: GameState,
  newSize: number,
  dt: number,
): number | null => {
  const known = state.perfectBandEnteredAt ?? null;
  const last = state.shapes[state.shapes.length - 1];
  if (known !== null || !last || !state.activeShape) return known;
  const entry = getPerfectBandEntrySize(state.world, last.size);
  if (newSize < entry) return null;
  const frameStart = state.elapsedTime - dt;
  const oldSize = state.activeShape.size;
  if (oldSize >= entry || newSize <= oldSize) return frameStart;
  return frameStart + (dt * (entry - oldSize)) / (newSize - oldSize);
};

/**
 * Advance the game clock. Call once per simulated frame, before other updates.
 */
export const advanceClock = (state: GameState, dt: number): GameState =>
  dt > 0 ? { ...state, elapsedTime: state.elapsedTime + dt } : state;

/**
 * Check if the active shape is still contained within the last stacked shape.
 */
export const checkContainment = (state: GameState): boolean => {
  if (!state.activeShape) return true;
  // Reverse worlds: the only continuous limit is the arena edge.
  if (isReverseWorld(state.world)) return isWithinArena(state);
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
 * Whether a tap right now would produce a valid stack (ignores fractures).
 * Regular worlds: the growing shape is inside the container. Reverse worlds:
 * it contains the previous shape and is still inside the arena.
 */
export const isStackValid = (state: GameState): boolean => {
  if (!state.activeShape) return false;
  if (isReverseWorld(state.world)) {
    return isWithinArena(state) && containsPrevious(state);
  }
  return checkContainment(state);
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
  const sizeRatio = isReverseWorld(state.world)
    ? getReverseQualityRatio(state.activeShape.size, lastShape.size)
    : state.activeShape.size / lastShape.size;
  const quality = getStackQuality(sizeRatio);
  const isPerfect = quality === "PERFECT";
  const awardedScore = STYLE_SCORE_BY_QUALITY[quality];

  const newShapes = [...state.shapes, { ...state.activeShape, opacity: 1 }];
  const newScore = state.score + awardedScore;
  const newStackCount = state.stackCount + 1;
  const newScoreHistory = [...state.scoreHistory, awardedScore];

  // Time Attack: precise stacks buy time.
  let newTimeRemaining = state.timeRemaining;
  if (state.mode === "TIME_ATTACK" && newTimeRemaining !== undefined) {
    newTimeRemaining += getTimeBonus(quality);
  }

  const { world: newWorld, level: newLevel } = computeProgression(newStackCount);

  const worldUp = newWorld > state.world;
  const leveledUp = worldUp || (newLevel > state.level && !worldUp);

  let finalShapes = newShapes;

  if (worldUp) {
    // Reset the stack to a single base. Regular worlds restart from the
    // full-size base; reverse worlds start from a small central seed.
    const firstShape = newShapes[0];
    finalShapes = isReverseWorld(newWorld)
      ? [createReverseSeed(firstShape, state.initialSize)]
      : [{ ...firstShape, size: state.initialSize, opacity: 1 }];
  }

  const newTargetZoom = getTargetZoomFor(
    newWorld,
    newLevel,
    state.initialSize,
    finalShapes[finalShapes.length - 1],
  );
  const styleEnabled = state.mode !== "ZEN";
  const streak = styleEnabled ? state.streak + 1 : state.streak;
  const styleIncrement = styleEnabled
    ? STYLE_SCORE_BY_QUALITY[quality] + streak * STYLE_STREAK_BONUS_PER_STACK
    : 0;
  const bestStreak = styleEnabled ? Math.max(state.bestStreak, streak) : 0;

  return {
    state: {
      ...state,
      shapes: finalShapes,
      activeShape: null,
      activeOffset: { x: 0, y: 0 },
      perfectBandEnteredAt: null,
      world: newWorld,
      score: newScore,
      stackCount: newStackCount,
      scoreHistory: newScoreHistory,
      level: newLevel,
      targetZoom: newTargetZoom,
      timeRemaining: newTimeRemaining,
      styleScore: styleEnabled ? state.styleScore + styleIncrement : state.styleScore,
      streak,
      bestStreak,
      perfectCount: state.perfectCount + (isPerfect ? 1 : 0),
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
/** Seconds a stack of this quality adds in Time Attack. */
export const getTimeBonus = (quality: StackQuality): number =>
  quality === "PERFECT"
    ? PERFECT_STACK_TIME_BONUS
    : quality === "GREAT"
      ? GREAT_STACK_TIME_BONUS
      : 0;

/** Growing shape reset to its spawn size after a non-terminal miss. */
const resetActiveAfterMiss = (state: GameState): Shape | null =>
  state.activeShape
    ? {
        ...state.activeShape,
        size:
          getSpawnSize(state.world, state.shapes[state.shapes.length - 1]) ??
          state.activeShape.size,
      }
    : null;

export const handleMiss = (
  state: GameState,
  reason: MissReason = "overflow",
): GameState => {
  // Measured before the miss resets the growing shape.
  return handleMissInner({
    ...state,
    lastMissReason: reason,
    lastMissMargin: getMissMargin(state, reason),
  });
};

/** Simulation step used to look ahead for a fracture clearing (one 60 Hz frame). */
export const FRACTURE_CLEAR_STEP = 1 / 60;
/** Look-ahead limit for a fracture clearing, in seconds of game clock. */
export const FRACTURE_CLEAR_HORIZON = 3;

/**
 * Seconds of play until a tap blocked by a fracture would have been free,
 * simulating the run forward from `state` with the loop's own pure updates
 * (clock, growth, rotation and drift, camera, stack drift), so the answer
 * accounts for the shape and the sectors both moving. Null when the tap is
 * not blocked, when the shape would have broken its limit first (waiting
 * would not have saved the stack), or when nothing clears within
 * {@link FRACTURE_CLEAR_HORIZON}. Event-only: up to 180 simulated frames.
 */
export const getFractureClearDelay = (
  state: GameState,
  horizon: number = FRACTURE_CLEAR_HORIZON,
): number | null => {
  if (!state.activeShape || !isTapBlockedByFracture(state, state.elapsedTime)) {
    return null;
  }
  const steps = Math.floor(horizon / FRACTURE_CLEAR_STEP);
  let next = state;
  for (let i = 1; i <= steps; i += 1) {
    next = advanceClock(next, FRACTURE_CLEAR_STEP);
    next = updateActiveShape(next, FRACTURE_CLEAR_STEP);
    next = updateZoom(next, FRACTURE_CLEAR_STEP);
    next = updateShapeRotations(next, FRACTURE_CLEAR_STEP);
    if (!isStackValid(next)) return null;
    if (!isTapBlockedByFracture(next, next.elapsedTime)) {
      return i * FRACTURE_CLEAR_STEP;
    }
  }
  return null;
};

const lateMargin = (size: number, fit: number | null): MissMargin | null =>
  fit === null || fit <= 0 ? null : { kind: "late", fraction: (size - fit) / fit };

/**
 * Seconds of game clock between the growing shape entering the PERFECT band
 * and `state` (the overflow frame). Null when it never entered the band, e.g.
 * a rotated or drifting shape that could not fit up to PERFECT.
 */
export const getOverflowLateness = (state: GameState): MissMargin | null => {
  const enteredAt = state.perfectBandEnteredAt ?? null;
  if (enteredAt === null) return null;
  return { kind: "lateTime", seconds: Math.max(0, state.elapsedTime - enteredAt) };
};

/**
 * How far a miss was off, from the state at the moment of the miss (before
 * it is handled). See {@link MissMargin} for the exact definitions. Pure and
 * event-only (a few dozen containment checks), never per frame. Null when the
 * shape was within its limits after all, or when no number is meaningful
 * (e.g. its centre drifted out of the container).
 */
export const getMissMargin = (
  state: GameState,
  reason: MissReason,
): MissMargin | null => {
  const active = state.activeShape;
  if (!active) return null;

  if (reason === "fracture") {
    const clearInSec = getFractureClearDelay(state);
    return clearInSec === null ? null : { kind: "fracture", clearInSec };
  }

  // Untapped overflow (container edge or arena ring): caught on the frame it
  // crosses, so its size overshoot is always about one frame of growth. Tell
  // how long PERFECT had been open instead (null if it never opened).
  if (reason === "overflow") return getOverflowLateness(state);

  if (isReverseWorld(state.world)) {
    // A reverse tap past the ring (only reachable when forced) is "late";
    // otherwise a failed reverse tap is one that did not wrap the previous
    // shape yet.
    if (!isWithinArena(state)) {
      return lateMargin(active.size, getLargestArenaSize(state));
    }
    if (reason !== "badTap") return null;
    const wrap = getReverseWrapSize(state);
    return wrap === null
      ? null
      : { kind: "early", fraction: (wrap - active.size) / wrap };
  }

  const container = state.shapes[state.shapes.length - 1];
  if (!container) return null;
  return lateMargin(
    active.size,
    getLargestFittingSize(active, container, state.activeOffset),
  );
};

/**
 * Why the run ended, from its final state. Mode-level causes (clock, lives)
 * take precedence over the last miss that triggered them.
 */
export const getEndReason = (state: GameState): EndReason | null => {
  if (!state.isGameOver) return null;
  if (state.mode === "TIME_ATTACK" && (state.timeRemaining ?? 1) <= 0) {
    return "timeout";
  }
  if (state.mode === "ZEN" && (state.zenLivesRemaining ?? 1) <= 0) {
    return "lives";
  }
  return state.lastMissReason;
};

const handleMissInner = (state: GameState): GameState => {
  if (
    state.mode === "TIME_ATTACK" &&
    TIME_ATTACK_MISS_PENALTY !== undefined &&
    state.timeRemaining !== undefined
  ) {
    // Against the clock a miss costs time, not the run.
    if (!state.activeShape) return state;
    const timeRemaining = Math.max(0, state.timeRemaining - TIME_ATTACK_MISS_PENALTY);
    const nextState: GameState = {
      ...state,
      timeRemaining,
      streak: 0,
      lastStackQuality: null,
      activeShape: resetActiveAfterMiss(state),
      perfectBandEnteredAt: null,
      activeOffset: { x: 0, y: 0 },
    };
    return timeRemaining <= 0 ? setGameOver(nextState) : nextState;
  }
  if (state.mode === "ZEN") {
    if (!state.activeShape) return state;
    const nextLives = Math.max(
      0,
      (state.zenLivesRemaining ?? ZEN_MAX_LIVES) - 1,
    );
    const nextState: GameState = {
      ...state,
      zenLivesRemaining: nextLives,
      activeShape: resetActiveAfterMiss(state),
      perfectBandEnteredAt: null,
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
  let nextState = state;
  const shapeRandom = consumeRandom(nextState);
  nextState = shapeRandom.state;
  const colorRandom = consumeRandom(nextState);
  nextState = colorRandom.state;
  const created = createActiveShape(
    nextState.level,
    lastShape,
    nextState.world,
    nextState.runSeed,
    reducedFx,
    {
      shapeRoll: shapeRandom.value,
      colorRoll: colorRandom.value,
    },
  );
  const spawnSize = getSpawnSize(nextState.world, lastShape);
  const newActiveShape =
    spawnSize !== null ? { ...created, size: spawnSize } : created;
  const speedRandom = consumeRandom(nextState);
  nextState = speedRandom.state;
  const currentSpeed = generateRandomSpeed(speedRandom.value);

  return {
    ...nextState,
    activeShape: newActiveShape,
    perfectBandEnteredAt: null,
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
  const lastAwarded = state.scoreHistory.at(-1) ?? 0;
  const newScore = Math.max(0, state.score - lastAwarded);
  const newStackCount = Math.max(0, state.stackCount - 1);
  const newScoreHistory = state.scoreHistory.slice(0, -1);

  // Recalculate level/world
  const { world: newWorld, level: newLevel } = computeProgression(newStackCount);
  const newTargetZoom = getTargetZoomFor(
    newWorld,
    newLevel,
    state.initialSize,
    newShapes[newShapes.length - 1],
  );

  return {
    ...state,
    shapes: newShapes,
    score: newScore,
    stackCount: newStackCount,
    scoreHistory: newScoreHistory,
    perfectCount:
      lastAwarded === STYLE_SCORE_BY_QUALITY.PERFECT
        ? Math.max(0, state.perfectCount - 1)
        : state.perfectCount,
    world: newWorld,
    level: newLevel,
    targetZoom: newTargetZoom,
    activeShape: null, // Force spawn of new shape
    perfectBandEnteredAt: null,
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
 * Reference frame duration. Legacy per-frame constants were tuned at 60 Hz;
 * expressing them per second keeps the original feel on 60 Hz screens while
 * making 120 Hz (ProMotion) and throttled 30 Hz devices behave identically.
 */
const REFERENCE_FRAME_DT = 1 / 60;

/** Stacked-shape drift, in radians per second (was 0.005 rad/frame @ 60 Hz). */
export const STACK_DRIFT_SPEED = 0.3;
/** Opacity lost per second by shapes deeper than {@link FADE_AGE_THRESHOLD}. */
export const STACK_FADE_SPEED = 0.3;
/** Shapes older than this many layers start fading out. */
export const FADE_AGE_THRESHOLD = 10;

/**
 * Update shape opacities (older shapes fade out).
 * Frame-rate independent; returns the same state reference when nothing fades
 * so the hot path does not allocate for small stacks.
 */
export const updateShapeOpacities = (
  state: GameState,
  dt: number = REFERENCE_FRAME_DT,
): GameState => {
  const { shapes } = state;
  if (shapes.length - 1 <= FADE_AGE_THRESHOLD) return state;

  const fade = STACK_FADE_SPEED * dt;
  let changed = false;
  const updatedShapes = shapes.map((shape, index) => {
    const age = shapes.length - 1 - index;
    if (age > FADE_AGE_THRESHOLD && shape.opacity > 0) {
      changed = true;
      return { ...shape, opacity: Math.max(0, shape.opacity - fade) };
    }
    return shape;
  });

  return changed ? { ...state, shapes: updatedShapes } : state;
};

/**
 * Apply subtle rotation drift to stacked shapes (frame-rate independent).
 */
export const updateShapeRotations = (
  state: GameState,
  dt: number = REFERENCE_FRAME_DT,
): GameState => {
  const mechanics = getWorldMechanics(state.world);
  const invertByLevel = mechanics.rotationInvertByLevel && state.level % 2 === 0;
  const invertForBoss = mechanics.rotationFlipOnBoss && state.isBossLevel;
  const inversion = (invertByLevel ? -1 : 1) * (invertForBoss ? -1 : 1);
  const step = STACK_DRIFT_SPEED * dt;

  const updatedShapes = state.shapes.map((shape, index) => {
    const direction = (index % 2 === 0 ? 1 : -1) * inversion;
    return {
      ...shape,
      rotation: shape.rotation + step * direction,
    };
  });

  return { ...state, shapes: updatedShapes };
};
