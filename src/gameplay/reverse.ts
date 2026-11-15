import type { GameState } from "../types";
import type { Shape } from "../utils/geometry";
import { findSizeThreshold, getVertices, isPointInShape } from "../utils/geometry";
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

const shapeWithinArena = (
  shape: Shape,
  offset: { x: number; y: number },
  radius: number,
): boolean =>
  getVertices(shape).every((v) => {
    const x = v.x + offset.x;
    const y = v.y + offset.y;
    return x * x + y * y <= radius * radius;
  });

/** True while every vertex of the growing shape stays inside the arena. */
export const isWithinArena = (state: GameState): boolean => {
  if (!state.activeShape) return true;
  return shapeWithinArena(
    state.activeShape,
    state.activeOffset ?? { x: 0, y: 0 },
    getArenaRadius(state),
  );
};

const wrapsShape = (
  outer: Shape,
  offset: { x: number; y: number },
  inner: Shape,
): boolean =>
  getVertices(inner).every((v) =>
    isPointInShape({ x: v.x - offset.x, y: v.y - offset.y }, outer),
  );

/**
 * True when the growing shape (centred at its drift offset) fully contains
 * the last stacked shape (centred at the origin).
 */
export const containsPrevious = (state: GameState): boolean => {
  const active = state.activeShape;
  const last = state.shapes[state.shapes.length - 1];
  if (!active || !last) return false;
  return wrapsShape(active, state.activeOffset ?? { x: 0, y: 0 }, last);
};

/** Upper bracket doublings when searching for the wrapping size. */
const WRAP_SEARCH_DOUBLINGS = 6;

/**
 * Smallest size the growing shape (same type, rotation, offset) needed to
 * fully contain the previous shape: the target an early tap fell short of.
 * Null when it already wraps it, or when no size up to 64x would.
 */
export const getReverseWrapSize = (state: GameState): number | null => {
  const active = state.activeShape;
  const last = state.shapes[state.shapes.length - 1];
  if (!active || !last || active.size <= 0) return null;
  const offset = state.activeOffset ?? { x: 0, y: 0 };
  const wrapsAt = (size: number) => wrapsShape({ ...active, size }, offset, last);
  if (wrapsAt(active.size)) return null;
  let upper = Math.max(active.size, last.size) * 2;
  for (let i = 0; i < WRAP_SEARCH_DOUBLINGS && !wrapsAt(upper); i += 1) {
    upper *= 2;
  }
  if (!wrapsAt(upper)) return null;
  return findSizeThreshold(wrapsAt, upper, active.size);
};

/**
 * Largest size the growing shape (same type, rotation, offset) could have
 * had while staying inside the arena: the limit an overflow crossed. Null
 * when it is still inside, or when its centre has left the arena.
 */
export const getLargestArenaSize = (state: GameState): number | null => {
  const active = state.activeShape;
  if (!active) return null;
  const offset = state.activeOffset ?? { x: 0, y: 0 };
  const radius = getArenaRadius(state);
  const fitsAt = (size: number) => shapeWithinArena({ ...active, size }, offset, radius);
  if (fitsAt(active.size)) return null;
  const smallest = active.size * 1e-3;
  if (!fitsAt(smallest)) return null;
  return findSizeThreshold(fitsAt, smallest, active.size);
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
