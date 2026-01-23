import type { ShapeType } from "../utils/geometry";

/**
 * World-specific visual and gameplay effects configuration.
 * Effects are additive - higher worlds include all lower world effects.
 */
export interface WorldMechanics {
  /** Breathing: stacked shapes oscillate in size */
  breathingEffect: boolean;
  breathingAmplitude: number; // e.g., 0.03 = 3% size variation
  breathingSpeed: number; // radians/sec

  /** Growth pattern for active shape speed within a level */
  growthPattern: "linear" | "accelerating" | "wave";

  /** Wave: horizontal displacement of stacked shapes only */
  waveEffect: boolean;
  waveAmplitude: number; // pixels
  waveSpeed: number; // radians/sec

  /** Color shift: hue rotation for stacked shapes */
  colorShift: boolean;
  colorShiftSpeed: number; // degrees/sec

  /** Eclipse: darker background and pulsing container visibility */
  eclipseEffect: boolean;
  eclipsePulseSpeed: number; // pulses per second (relative)
}

const DEFAULT_MECHANICS: WorldMechanics = {
  breathingEffect: false,
  breathingAmplitude: 0,
  breathingSpeed: 0,
  growthPattern: "linear",
  waveEffect: false,
  waveAmplitude: 0,
  waveSpeed: 0,
  colorShift: false,
  colorShiftSpeed: 0,
  eclipseEffect: false,
  eclipsePulseSpeed: 0,
};

/**
 * World mechanics configuration map.
 * Each world adds new effects while keeping previous ones.
 */
export const WORLD_MECHANICS: Record<number, WorldMechanics> = {
  1: { ...DEFAULT_MECHANICS },
  2: {
    ...DEFAULT_MECHANICS,
    breathingEffect: true,
    breathingAmplitude: 0.03,
    breathingSpeed: 2,
  },
  3: {
    ...DEFAULT_MECHANICS,
    breathingEffect: true,
    breathingAmplitude: 0.03,
    breathingSpeed: 2,
    growthPattern: "accelerating",
  },
  4: {
    ...DEFAULT_MECHANICS,
    breathingEffect: true,
    breathingAmplitude: 0.03,
    breathingSpeed: 2,
    growthPattern: "accelerating",
    waveEffect: true,
    waveAmplitude: 15,
    waveSpeed: 3,
  },
  5: {
    ...DEFAULT_MECHANICS,
    breathingEffect: true,
    breathingAmplitude: 0.03,
    breathingSpeed: 2,
    growthPattern: "accelerating",
    waveEffect: true,
    waveAmplitude: 15,
    waveSpeed: 3,
    colorShift: true,
    colorShiftSpeed: 30,
  },
  6: {
    ...DEFAULT_MECHANICS,
    breathingEffect: true,
    breathingAmplitude: 0.03,
    breathingSpeed: 2,
    growthPattern: "accelerating",
    waveEffect: true,
    waveAmplitude: 15,
    waveSpeed: 3,
    colorShift: true,
    colorShiftSpeed: 30,
    eclipseEffect: true,
    eclipsePulseSpeed: 0.5,
  },
};

/**
 * Get mechanics for a specific world.
 * Falls back to last world mechanics for worlds > max.
 */
export const getWorldMechanics = (world: number): WorldMechanics => {
  return (
    WORLD_MECHANICS[world] ??
    WORLD_MECHANICS[Object.keys(WORLD_MECHANICS).length - 1]
  );
};

export const MIN_GROWTH_SPEED = 35;
export const MAX_GROWTH_SPEED = 80;
export const STACKS_PER_LEVEL = 3;

/**
 * Reference initial shape size for normalizing growth speed.
 * Based on an 800px viewport (800 * 0.45 = 360).
 * Growth speed is scaled so gameplay feels consistent across screen sizes.
 */
export const REFERENCE_INITIAL_SIZE = 360;
export const LEVELS_PER_WORLD = 5;

// Mode specific constants
export const TIME_ATTACK_START_TIME = 60;
export const PERFECT_STACK_TIME_BONUS = 5;

export interface BossShapeConfig {
  type: ShapeType;
  growthSpeedMultiplier: number;
  rotationSpeedMultiplier: number;
  hueShift: boolean;
  pulseEnabled?: boolean;
  erraticRotationEnabled?: boolean;
}

export const BOSS_SHAPES: Record<number, BossShapeConfig> = {
  5: {
    type: "hexagon",
    growthSpeedMultiplier: 1.5,
    rotationSpeedMultiplier: 2.0,
    hueShift: true,
    pulseEnabled: true,
  },
  10: {
    type: "octagon",
    growthSpeedMultiplier: 2.0,
    rotationSpeedMultiplier: 2.5,
    hueShift: true,
    erraticRotationEnabled: true,
  },
  15: {
    type: "diamond",
    growthSpeedMultiplier: 2.2,
    rotationSpeedMultiplier: 3.0,
    hueShift: true,
    pulseEnabled: true,
  },
  20: {
    type: "star",
    growthSpeedMultiplier: 2.5,
    rotationSpeedMultiplier: 3.5,
    hueShift: true,
    pulseEnabled: true,
    erraticRotationEnabled: true,
  },
};

export const SHAPE_UNLOCKS: Record<number, ShapeType[]> = {
  1: ["circle", "octagon"],
  2: ["pentagon", "hexagon"],
  3: ["square"],
  4: ["triangle"],
  5: ["rectangle"],
};

export const LEVEL_ZOOM_MAP: Record<number, number> = {
  1: 1.0,
  2: 1.25,
  3: 2.0,
  4: 4.5,
  5: 12,
};

export const getZoomForLevel = (level: number): number => {
  return LEVEL_ZOOM_MAP[level] ?? LEVEL_ZOOM_MAP[5];
};

export const COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
];

export const getUnlockedShapes = (level: number): ShapeType[] => {
  const unlocked: ShapeType[] = [];
  for (let i = 1; i <= level; i++) {
    if (SHAPE_UNLOCKS[i]) {
      unlocked.push(...SHAPE_UNLOCKS[i]);
    }
  }
  return unlocked;
};
