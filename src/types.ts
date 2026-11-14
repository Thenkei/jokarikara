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
  currentSpeed: number;
  isGameOver: boolean;
  mode: GameMode;
  timeRemaining?: number; // For Time Attack
  zenLivesRemaining?: number; // For Zen Mode - decremented on misses
  undoStack?: Shape[][]; // For Zen Mode - stores previous stacks of shapes
  isBossLevel?: boolean; // For Boss Mechanics
  runSeed: number;
  rngState: number;
  /**
   * Seconds of simulated play. Advances only while the game is running, so
   * time-driven mechanics (fractures, boss pulse/hue) freeze during pause and
   * are deterministic under the test bridge. Never use wall-clock time for
   * gameplay.
   */
  elapsedTime: number;
  styleScore: number;
  streak: number;
  bestStreak: number;
  /** Number of PERFECT stacks landed this run (reduced by Zen undo). */
  perfectCount: number;
  lastStackQuality: StackQuality | null;
}

/** End-of-run summary handed to the UI. */
export interface RunStats {
  stackCount: number;
  perfectCount: number;
  bestStreak: number;
  /** Points awarded per stack, in order (drives the Daily share trail). */
  scoreHistory: readonly number[];
}

/**
 * Callbacks for game events.
 */
export interface GameCallbacks {
  onScore: (score: number) => void;
  onGameOver: (
    finalScore: number,
    world: number,
    level: number,
    stats?: RunStats,
  ) => void;
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
    __GAME_AUDIO__?: import("./utils/testBridge").AudioTestBridge;
  }
}

export {};
