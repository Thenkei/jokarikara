import type { Shape, ShapeType } from "./utils/geometry";

export type GameMode = "CLASSIC" | "ZEN" | "TIME_ATTACK";
export type StackQuality = "PERFECT" | "GREAT" | "GOOD" | "OK";

export interface StyleUpdate {
  styleScore: number;
  streak: number;
  bestStreak: number;
  lastStackQuality: StackQuality | null;
}

/**
 * Game state representing all mutable game data.
 */
export interface GameState {
  shapes: Shape[];
  activeShape: Shape | null;
  activeOffset?: { x: number; y: number };
  world: number;
  score: number;
  stackCount: number;
  scoreHistory: number[];
  level: number;
  zoom: number;
  targetZoom: number;
  initialSize: number;
  viewportSize: number;
  currentSpeed: number;
  isGameOver: boolean;
  mode: GameMode;
  timeRemaining?: number; // For Time Attack
  zenLivesRemaining?: number; // For Zen Mode - decremented on misses
  undoStack?: Shape[][]; // For Zen Mode - stores previous stacks of shapes
  isBossLevel?: boolean; // For Boss Mechanics
  runSeed: number;
  rngState: number;
  styleScore: number;
  streak: number;
  bestStreak: number;
  lastStackQuality: StackQuality | null;
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

declare global {
  interface Window {
    __GAME_TEST__?: import("./utils/testBridge").GameTestBridge;
  }
}

export {};
