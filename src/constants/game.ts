import type { ShapeType } from "../utils/geometry";

export const MIN_GROWTH_SPEED = 25;
export const MAX_GROWTH_SPEED = 90;
export const STACKS_PER_LEVEL = 5;

export const SHAPE_UNLOCKS: Record<number, ShapeType[]> = {
  1: ["circle", "square"],
  2: ["pentagon", "hexagon"],
  3: ["octagon"],
  4: ["triangle"],
  5: ["rectangle"],
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
