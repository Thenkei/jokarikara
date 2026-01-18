import type { ShapeType } from "../utils/geometry";

export const MIN_GROWTH_SPEED = 35;
export const MAX_GROWTH_SPEED = 80;
export const STACKS_PER_LEVEL = 3;

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
