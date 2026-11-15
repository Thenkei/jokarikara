import type { Shape, ShapeType } from "./utils/geometry";

export type GameMode = "CLASSIC" | "ZEN" | "TIME_ATTACK";
export type StackQuality = "PERFECT" | "GREAT" | "GOOD" | "OK";

/** Why a stack attempt failed. */
export type MissReason =
  /** The growing shape crossed its limit (container edge or reverse arena). */
  | "overflow"
  /** A tap that did not fit (e.g. not yet wrapping in Reverse Stack). */
  | "badTap"
  /** A tap while a fracture sector crossed the growing shape. */
  | "fracture";

/**
 * How far a miss was off, captured at the moment of the miss (pure core:
 * `getMissMargin`). Sizes are compared with the same type, rotation and drift
 * offset as the shape that missed; fractions are relative to the *target*
 * size, never to the container, so "4 %" means the same thing on every level.
 *
 * - `lateTime`: an untapped overflow (the shape crossed the container edge,
 *   or the Reverse Stack arena, on its own). A size margin would always be
 *   about one frame of growth, so this is time instead: `seconds` of game
 *   clock between the shape entering the PERFECT band and the overflow, i.e.
 *   how long the player waited too long. Absent when the shape never reached
 *   the band (it could not fit up to PERFECT).
 * - `late`: a tap that did not fit (a corner out: rotation, drift; or past
 *   the arena). `fraction = (size − fit) / fit`, where `fit` is the largest
 *   size that still satisfied the limit it broke.
 * - `early`: Reverse Stack tap before wrapping the previous shape.
 *   `fraction = (wrap − size) / wrap`, where `wrap` is the smallest size that
 *   fully contains the previous shape.
 * - `fracture`: seconds until no red sector crossed the shape, simulating the
 *   run forward from the tap (growth, rotation, drift and sectors all move).
 *   Absent when it would have overflowed before clearing.
 */
export type MissMargin =
  | { kind: "lateTime"; seconds: number }
  | { kind: "late"; fraction: number }
  | { kind: "early"; fraction: number }
  | { kind: "fracture"; clearInSec: number };

/**
 * Why a run ended (shown on the game over screen). `finished`: the player
 * ended a Zen run from the pause menu (FINISH RUN), not a failure.
 */
export type EndReason = MissReason | "timeout" | "lives" | "finished";

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
  /**
   * The player ended the run on purpose (Zen FINISH RUN, see `finishRun`).
   * Takes precedence over every other end reason.
   */
  finishedByPlayer?: boolean;
  /** Cause of the most recent miss (null until the first one). */
  lastMissReason: MissReason | null;
  /** How far that miss was off (null when not computable). */
  lastMissMargin?: MissMargin | null;
  /**
   * Game clock (`elapsedTime`) at which the current growing shape entered the
   * PERFECT band (see `getPerfectBandEntrySize`), interpolated within the
   * frame; null until it does. Reset whenever a new shape starts growing.
   * Lets an untapped overflow say how long the player waited too long.
   */
  perfectBandEnteredAt?: number | null;
  styleScore: number;
  streak: number;
  bestStreak: number;
  /** Number of PERFECT stacks landed this run (reduced by Zen undo). */
  perfectCount: number;
  lastStackQuality: StackQuality | null;
}

/**
 * Emitted after every successful stack, with the post-stack values. Feeds
 * progression bookkeeping (achievements); fired per tap, never per frame.
 */
export interface StackEvent {
  quality: StackQuality;
  stackCount: number;
  perfectCount: number;
  score: number;
  world: number;
  /** Level within the current world. */
  level: number;
  /** Combo streak (always 0 in Zen). */
  streak: number;
  /** The shape just stacked was a boss shape. */
  wasBoss: boolean;
}

/** End-of-run summary handed to the UI. */
export interface RunStats {
  stackCount: number;
  perfectCount: number;
  bestStreak: number;
  /** Points awarded per stack, in order (drives the Daily share trail). */
  scoreHistory: readonly number[];
  /** Why the run ended; null if it was left without a game over. */
  endReason?: EndReason | null;
  /** How far the miss that ended the run was off (only for a miss reason). */
  endMargin?: MissMargin | null;
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
