import { gameplayConfig } from "./config";
import type { BossConfig, GameplayConfig, WorldConfig } from "./types";
import type { ShapeType } from "../utils/geometry";

const getMaxNumericKey = (record: Record<number, unknown>): number => {
  const keys = Object.keys(record).map((key) => Number(key));
  return keys.length > 0 ? Math.max(...keys) : 1;
};

export const getGameplayConfig = (): GameplayConfig => gameplayConfig;

// The gameplay config is built once and never mutated, so the max keys can be
// resolved at module load instead of on every call. These selectors run
// several times per animation frame.
const MAX_WORLD = getMaxNumericKey(gameplayConfig.worlds);
const MAX_LEVEL = getMaxNumericKey(gameplayConfig.levels);

/** Highest configured world (later worlds reuse its rules). */
export const getWorldCount = (): number => MAX_WORLD;

export const getWorldConfig = (world: number): WorldConfig => {
  const config = getGameplayConfig();
  return config.worlds[world] ?? config.worlds[MAX_WORLD];
};

export const getWorldMechanics = (world: number) =>
  getWorldConfig(world).mechanics;

export const getZoomForLevel = (level: number): number => {
  const config = getGameplayConfig();
  return config.levels[level]?.zoom ?? config.levels[MAX_LEVEL].zoom;
};

export const getUnlockedShapes = (level: number): ShapeType[] => {
  const config = getGameplayConfig();
  const unlocked: ShapeType[] = [];
  for (let i = 1; i <= level; i += 1) {
    const unlocks = config.levels[i]?.unlocks;
    if (unlocks) {
      unlocked.push(...unlocks);
    }
  }
  return unlocked;
};

export const getBossConfigForScore = (
  scorePlusOne: number,
): BossConfig | undefined => {
  const config = getGameplayConfig();
  return config.bosses[scorePlusOne];
};

export const computeProgression = (
  stackCount: number,
  config: GameplayConfig = getGameplayConfig(),
) => {
  const totalLevels = Math.floor(
    stackCount / config.progression.stacksPerLevel,
  );
  const world = Math.floor(totalLevels / config.progression.levelsPerWorld) + 1;
  const level = (totalLevels % config.progression.levelsPerWorld) + 1;
  return { world, level, totalLevels };
};
