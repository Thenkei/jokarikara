import { getWorldCount } from "./selectors";

/**
 * World intro: the overlay shown when a run enters a new world.
 *
 * Every entry shows the world's name and tagline for WORLD_INTRO_MS. The
 * first time a player ever enters a world (above their lifetime best world,
 * and not yet taught this run) it also teaches the mechanic with the atlas
 * how-to line, and holds the game while it is read: the simulation is frozen
 * (no growth, game clock, Time Attack timer or containment check) until the
 * player taps / presses Space or Enter, or FIRST_VISIT_MAX_HOLD_MS passes.
 * The new world's first shape is freshly spawned and small, so resuming after
 * the hold costs nothing: no run can be lost while reading.
 *
 * Pure rules + a state machine on an injected clock (`now`, in ms); the
 * driver (`useWorldIntroHold`) owns the timer and side effects.
 */

/** Short overlay (every world entry): long enough for name + tagline. */
export const WORLD_INTRO_MS = 2800;

/**
 * Longest the game waits on a first-visit intro before playing on by itself.
 * About 4 words/s for the longest how-to line plus name and tagline (~35
 * words); a player who keeps reading is not penalised by the auto-release
 * either, since the new world's first shape starts small.
 */
export const FIRST_VISIT_MAX_HOLD_MS = 9000;

/**
 * Taps right after the hold starts are swallowed without dismissing it: the
 * finger that completed the world (or an accidental double tap) must not
 * skip the lesson. Shorter than any deliberate "read, then tap".
 */
export const FIRST_VISIT_GRACE_MS = 600;

/** First world with a mechanic to teach (world 1 has the first-run hint). */
export const FIRST_TAUGHT_WORLD = 2;

/**
 * Whether entering `world` teaches it (how-to line + hold) rather than
 * showing the short overlay. The line itself is `getWorldHowTo` (worldText).
 *
 * `taughtThrough` is the highest world the player has already met: their
 * lifetime best world when the run started, raised by every world taught
 * during the run (so a Zen undo that steps back and forth never re-teaches).
 * A practice run starts at a reached world, so it only teaches beyond it.
 * Worlds past the last configured one (the game loops on its rules) have no
 * lesson of their own and are never taught.
 */
export const shouldTeachWorld = (world: number, taughtThrough: number): boolean =>
  Number.isInteger(world) &&
  world >= FIRST_TAUGHT_WORLD &&
  world > taughtThrough &&
  world <= getWorldCount();

export type WorldIntroHold =
  | { readonly phase: "idle" }
  | {
      readonly phase: "holding";
      readonly world: number;
      readonly startedAt: number;
      /** Max wait for this hold (FIRST_VISIT_MAX_HOLD_MS outside E2E). */
      readonly maxHoldMs: number;
    };

export const IDLE_HOLD: WorldIntroHold = { phase: "idle" };

export type WorldIntroReleaseReason =
  /** The player tapped / pressed Space or Enter after the grace period. */
  | "tap"
  /** FIRST_VISIT_MAX_HOLD_MS passed without a tap. */
  | "timeout"
  /** The player paused (the resume countdown protects the restart). */
  | "pause"
  /** The player acted on the board (Zen restart / undo). */
  | "board"
  /** E2E bridge. */
  | "test";

export type WorldIntroStep = {
  readonly hold: WorldIntroHold;
  /** Set when the hold ended on this step. */
  readonly released: WorldIntroReleaseReason | null;
  /** Delay until the next timer check (null: nothing to schedule). */
  readonly nextInMs: number | null;
};

const remaining = (
  hold: { readonly startedAt: number; readonly maxHoldMs: number },
  now: number,
): number => Math.max(0, hold.maxHoldMs - Math.max(0, now - hold.startedAt));

/**
 * Hold for `world` from `now`. Entering another new world while holding (only
 * the E2E bridge can stack meanwhile) restarts the hold for that world.
 * `maxHoldMs` is only overridden by the E2E bridge (slow CI browsers).
 */
export const startWorldIntroHold = (
  world: number,
  now: number,
  maxHoldMs: number = FIRST_VISIT_MAX_HOLD_MS,
): WorldIntroStep => ({
  hold: { phase: "holding", world, startedAt: now, maxHoldMs },
  released: null,
  nextInMs: maxHoldMs,
});

export type WorldIntroTap =
  /** Not holding: the tap plays as usual. */
  | "play"
  /** Holding, within the grace period: swallowed, the hold continues. */
  | "ignored"
  /** Holding: the tap ends the hold (and is not a stack or a miss). */
  | "dismissed";

/** A tap while the intro may be holding the game. */
export const tapWorldIntroHold = (
  hold: WorldIntroHold,
  now: number,
): WorldIntroStep & { readonly tap: WorldIntroTap } => {
  if (hold.phase !== "holding") {
    return { hold, released: null, nextInMs: null, tap: "play" };
  }
  if (now - hold.startedAt < FIRST_VISIT_GRACE_MS) {
    return {
      hold,
      released: null,
      nextInMs: remaining(hold, now),
      tap: "ignored",
    };
  }
  return { hold: IDLE_HOLD, released: "tap", nextInMs: null, tap: "dismissed" };
};

/**
 * Timer callback. An early timer (clock skew) reschedules for the rest; a
 * late one (throttled tab) releases at once.
 */
export const advanceWorldIntroHold = (
  hold: WorldIntroHold,
  now: number,
): WorldIntroStep => {
  if (hold.phase !== "holding") return { hold, released: null, nextInMs: null };
  const left = remaining(hold, now);
  if (left > 0) return { hold, released: null, nextInMs: left };
  return { hold: IDLE_HOLD, released: "timeout", nextInMs: null };
};

/** End the hold now for `reason` (no-op when not holding). */
export const releaseWorldIntroHold = (
  hold: WorldIntroHold,
  reason: Exclude<WorldIntroReleaseReason, "tap" | "timeout">,
): WorldIntroStep =>
  hold.phase === "holding"
    ? { hold: IDLE_HOLD, released: reason, nextInMs: null }
    : { hold, released: null, nextInMs: null };

export const isWorldIntroHolding = (hold: WorldIntroHold): boolean =>
  hold.phase === "holding";
