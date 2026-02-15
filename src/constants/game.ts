import type { ShapeType } from "../utils/geometry";
import type { BossConfig, WorldMechanics } from "../gameplay/types";
import { getGameplayConfig, getWorldMechanics, getZoomForLevel, getUnlockedShapes, getBossConfigForScore, computeProgression } from "../gameplay/selectors";

export type { WorldMechanics, BossConfig as BossShapeConfig } from "../gameplay/types";

const config = getGameplayConfig();

export const MIN_GROWTH_SPEED = config.growth.minSpeed;
export const MAX_GROWTH_SPEED = config.growth.maxSpeed;
export const REFERENCE_INITIAL_SIZE = config.growth.referenceInitialSize;
export const STYLE_QUALITY_THRESHOLDS = config.scoring.qualityThresholds;
export const STYLE_QUALITY_POINTS = config.scoring.qualityPoints;
export const STYLE_STREAK_BONUS_PER_STACK = config.scoring.streakBonusPerStack;

export const STACKS_PER_LEVEL = config.progression.stacksPerLevel;
export const LEVELS_PER_WORLD = config.progression.levelsPerWorld;
export const TIME_ATTACK_START_TIME = config.modes.timeAttack.startTime;
export const PERFECT_STACK_TIME_BONUS =
  config.modes.timeAttack.perfectStackBonus;
export const ZEN_MIN_CLICK_RATIO = config.modes.zen.minClickRatio;
export const ZEN_MAX_LIVES = config.modes.zen.maxLives;
export const COLORS = config.colors;

export const WORLD_MECHANICS: Record<number, WorldMechanics> = Object.keys(
  config.worlds,
).reduce((acc, key) => {
  const world = Number(key);
  acc[world] = config.worlds[world].mechanics;
  return acc;
}, {} as Record<number, WorldMechanics>);

export const LEVEL_ZOOM_MAP: Record<number, number> = Object.keys(
  config.levels,
).reduce((acc, key) => {
  const level = Number(key);
  acc[level] = config.levels[level].zoom;
  return acc;
}, {} as Record<number, number>);

export const SHAPE_UNLOCKS: Record<number, ShapeType[]> = Object.keys(
  config.levels,
).reduce((acc, key) => {
  const level = Number(key);
  const unlocks = config.levels[level].unlocks;
  if (unlocks && unlocks.length > 0) {
    acc[level] = [...unlocks];
  }
  return acc;
}, {} as Record<number, ShapeType[]>);

export const BOSS_SHAPES: Record<number, BossConfig> = {
  ...config.bosses,
};

export {
  getWorldMechanics,
  getZoomForLevel,
  getUnlockedShapes,
  getBossConfigForScore,
  computeProgression,
};
