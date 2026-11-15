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

  /** Fracture windows: rotating unsafe sectors near container boundary */
  fractureWindows: boolean;
  fractureSectorCount: number;
  fractureSectorWidthDeg: number;
  fractureBaseRotationSpeed: number; // radians/sec
  fractureBandMinRatio: number; // active/container size ratio threshold
  fractureDisableOnBoss: boolean;

  /**
   * Reverse stacking: the growing shape must contain the previous one; a
   * circular on-screen arena is the outer limit and the camera zooms out.
   */
  reverseStacking: boolean;

  /** Heartbeat: growth advances in bursts on a fixed tempo. */
  heartbeat: boolean;
  heartbeatBpm: number;
}

export interface WorldVisualProfile {
  /** Base hue center for this world (0-359) */
  hueCenter: number;
  /**
   * How much of the hue wheel the world's palette covers: below 90 it widens
   * a one-sided arc around hueCenter, from 90 the palette is the full wheel
   * (see getPaletteArc in visual/theme.ts).
   */
  hueSpread: number;
  /** Saturation bounds (%) */
  saturationMin: number;
  saturationMax: number;
  /** Lightness bounds (%) */
  lightnessMin: number;
  lightnessMax: number;
  /** Extra neon intensity for world look (0-1) */
  neonBias: number;
  /**
   * Relief of the layer material (0-1): how far each layer's cast shadow
   * falls. (Named for the glow it used to drive.)
   */
  glowIntensity: number;
  /** Minimum color/background contrast ratio */
  contrastFloor: number;
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
  visualProfile?: Partial<WorldVisualProfile>;
}

export interface LevelConfig {
  zoom: number;
  unlocks?: ShapeType[];
}

export interface StyleScoringConfig {
  qualityThresholds: {
    perfectMinRatio: number;
    greatMinRatio: number;
    goodMinRatio: number;
  };
  qualityPoints: {
    perfect: number;
    great: number;
    good: number;
    ok: number;
  };
  streakBonusPerStack: number;
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
      /** Seconds added by a GREAT stack (default 0). */
      greatStackBonus?: number;
      /**
       * Seconds lost on a miss. When set, a miss resets the growing shape and
       * the run only ends when the clock runs out; when unset, a miss ends the
       * run as in Classic.
       */
      missPenalty?: number;
    };
    zen: {
      minClickRatio: number;
      maxLives: number;
    };
  };
  scoring: StyleScoringConfig;
  colors: string[];
  levels: Record<number, LevelConfig>;
  worlds: Record<number, WorldConfig>;
  bosses: Record<number, BossConfig>;
}
