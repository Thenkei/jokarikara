import type { Shape, ShapeType } from "./utils/geometry";

export type GameMode = "CLASSIC" | "ZEN" | "TIME_ATTACK";

/**
 * Game state representing all mutable game data.
 */
export interface GameState {
  shapes: Shape[];
  activeShape: Shape | null;
  world: number;
  score: number;
  level: number;
  zoom: number;
  targetZoom: number;
  initialSize: number;
  currentSpeed: number;
  isGameOver: boolean;
  mode: GameMode;
  timeRemaining?: number; // For Time Attack
  undoStack?: Shape[][]; // For Zen Mode - stores previous stacks of shapes
  isBossLevel?: boolean; // For Boss Mechanics
}

/**
 * Callbacks for game events.
 */
export interface GameCallbacks {
  onScore: (score: number) => void;
  onGameOver: (finalScore: number, world: number, level: number) => void;
  onLevelUp: (level: number) => void;
  onWorldUp: (world: number) => void;
}

/**
 * Configuration for shape creation.
 */
export interface ShapeCreationOptions {
  type?: ShapeType;
  size?: number;
  color?: string;
  rotation?: number;
  opacity?: number;
}
