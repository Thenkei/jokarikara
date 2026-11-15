import { isE2eMode } from "../utils/e2e";

/**
 * How long the game over actions ignore input once the screen appears.
 *
 * Players tap in rhythm: the tap or Enter that follows a miss is often a
 * reflex from the run, not a choice. Without this beat it lands on RETRY
 * (the sticky bar sits right under the thumb) or MAIN MENU before the
 * score was even read. Counted from the screen, after the run's own end
 * hold (fail 400 ms, time-up 1 s), so a deliberate tap is never refused for
 * long. 0 under E2E, like the end holds.
 */
export const GAME_OVER_INPUT_GUARD_MS = isE2eMode() ? 0 : 500;
