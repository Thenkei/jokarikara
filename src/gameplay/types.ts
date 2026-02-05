import type { ShapeType } from "../utils/geometry";

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

  /** Gravity drift: active shape drifts downward over time */
  gravityDrift: boolean;
  gravityDriftSpeed: number; // units per second

  /** Rotation inversion rules for stacked shapes */
  rotationInvertByLevel: boolean;
  rotationFlipOnBoss: boolean;
}

export interface BossConfig {
  type: ShapeType;
  growthSpeedMultiplier: number;
  rotationSpeedMultiplier: number;
  hueShift: boolean;
  pulseEnabled?: boolean;
  erraticRotationEnabled?: boolean;
}

export interface WorldConfig {
  mechanics: WorldMechanics;
  name?: string;
}

export interface LevelConfig {
  zoom: number;
  unlocks?: ShapeType[];
}

export interface GameplayConfig {
  progression: {
    stacksPerLevel: number;
    levelsPerWorld: number;
  };
  growth: {
    minSpeed: number;
    maxSpeed: number;
    referenceInitialSize: number;
  };
  modes: {
    timeAttack: {
      startTime: number;
      perfectStackBonus: number;
    };
    zen: {
      minClickRatio: number;
    };
  };
  colors: string[];
  levels: Record<number, LevelConfig>;
  worlds: Record<number, WorldConfig>;
  bosses: Record<number, BossConfig>;
}
