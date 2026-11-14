import type { GameState } from "../types";
import type { Shape } from "../utils/geometry";
import { getVertices, isPointInShape } from "../utils/geometry";
import { getWorldMechanics } from "../constants/game";

/**
 * Reverse Stack (inspired by PR #2): shapes expand *outward*. The growing
 * shape must fully contain the previous one, and a circular arena on screen
 * is the outer limit. The camera zooms out after each stack so the last shape
 * always occupies the same screen fraction, which keeps the world endless and
 * the timing window constant, mirroring the zoom-in of regular worlds.
 *
 * All sizes are in world units; screen size = world size × zoom.
 */

/** Seed shape size on entering a reverse world, as a fraction of initialSize. */
export const REVERSE_SEED_RATIO = 0.3;
/** The growing shape spawns just inside the previous one (no dead time). */
export const REVERSE_SPAWN_RATIO = 0.75;
/** On-screen size of the last stacked shape, as a fraction of initialSize. */
export const REVERSE_DISPLAY_RATIO = 0.9;
/** On-screen arena diameter, as a fraction of initialSize (≈ 0.9 viewport). */
export const REVERSE_ARENA_RATIO = 2;

export const isReverseWorld = (world: number): boolean =>
  getWorldMechanics(world).reverseStacking;

export const isReverseState = (state: GameState): boolean =>
  isReverseWorld(state.world);

/** Zoom that shows `lastSize` at REVERSE_DISPLAY_RATIO × initialSize. */
export const getReverseZoom = (initialSize: number, lastSize: number): number =>
  lastSize > 0 ? (REVERSE_DISPLAY_RATIO * initialSize) / lastSize : 1;

/** Arena radius in world units for the current zoom. */
export const getArenaRadius = (state: Pick<GameState, "initialSize" | "zoom">) =>
  (REVERSE_ARENA_RATIO * state.initialSize) / (2 * state.zoom);

/** Seed shape that starts a reverse world (keeps type/colour of `from`). */
export const createReverseSeed = (from: Shape, initialSize: number): Shape => ({
  ...from,
  size: initialSize * REVERSE_SEED_RATIO,
  opacity: 1,
});

/** True while every vertex of the growing shape stays inside the arena. */
export const isWithinArena = (state: GameState): boolean => {
  if (!state.activeShape) return true;
  const radius = getArenaRadius(state);
  const offset = state.activeOffset ?? { x: 0, y: 0 };
  return getVertices(state.activeShape).every((v) => {
    const x = v.x + offset.x;
    const y = v.y + offset.y;
    return x * x + y * y <= radius * radius;
  });
};

/**
 * True when the growing shape (centred at its drift offset) fully contains
 * the last stacked shape (centred at the origin).
 */
export const containsPrevious = (state: GameState): boolean => {
  const active = state.activeShape;
  const last = state.shapes[state.shapes.length - 1];
  if (!active || !last) return false;
  const offset = state.activeOffset ?? { x: 0, y: 0 };
  return getVertices(last).every((v) =>
    isPointInShape({ x: v.x - offset.x, y: v.y - offset.y }, active),
  );
};

/** Tap too early: the growing shape cannot contain the previous one yet. */
export const isEarlyReverseTap = (state: GameState): boolean => {
  const active = state.activeShape;
  const last = state.shapes[state.shapes.length - 1];
  return !!active && !!last && active.size < last.size;
};

/** Quality ratio: 1 means the new shape hugs the previous one perfectly. */
export const getReverseQualityRatio = (activeSize: number, lastSize: number) =>
  activeSize > 0 ? lastSize / activeSize : 0;
