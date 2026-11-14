import { DEFAULT_IMPULSE_RESPONSE } from "./reverb";

/**
 * Idle suspension rules for the AudioContext (pure; the manager owns the one
 * timer that applies them).
 *
 * A running context keeps the audio thread busy even when every source has
 * ended: the reverb convolver, the compressor/limiter and the destination are
 * processed every render quantum. On phones that is measurable battery drain
 * on screens where nothing plays (start, game over, pause). So once the last
 * scheduled sound, its reverb tail and a grace period have all passed, with
 * nothing keeping audio alive (soundtrack, a run in progress), the context is
 * suspended; the next sound or music start resumes it first.
 *
 * All times are on the audio clock (`AudioContext.currentTime`, seconds),
 * which freezes while suspended: scheduling at `currentTime` right after
 * `resume()` simply plays once the clock moves again.
 */

/**
 * Silence required after the last tail before suspending. Long enough that a
 * player browsing menus does not pay a resume per click (resume costs a few
 * ms to tens of ms), short enough that a game over screen goes quiet fast.
 */
export const IDLE_SUSPEND_GRACE_SECONDS = 2.5;

/** Every voice may feed the shared reverb: its tail rings this long after the dry. */
export const REVERB_TAIL_SECONDS = DEFAULT_IMPULSE_RESPONSE.seconds;

export interface IdleSnapshot {
  /** Audio clock now. */
  now: number;
  /**
   * Audio clock time when everything scheduled so far is silent, reverb tail
   * included (`-Infinity` when nothing has played).
   */
  audibleUntil: number;
  /**
   * Something must stay live regardless of scheduled voices: the soundtrack
   * is running, or a run is in progress (so rhythm feedback is never delayed
   * by a resume).
   */
  keepAwake: boolean;
  /** Required silence after `audibleUntil`; 0 when nothing can play (muted). */
  graceSeconds: number;
}

/**
 * Seconds until the context may be suspended: `0` means now, `null` means
 * not while it is kept awake (re-evaluate when that changes). A corrupt
 * clock reading (NaN) waits a full grace instead of suspending blindly.
 */
export const secondsUntilIdle = ({
  now,
  audibleUntil,
  keepAwake,
  graceSeconds,
}: IdleSnapshot): number | null => {
  if (keepAwake) return null;
  const grace = Math.max(0, graceSeconds);
  const remaining = audibleUntil + grace - now;
  if (Number.isNaN(remaining)) return grace;
  return Math.max(0, remaining);
};

export const shouldSuspend = (snapshot: IdleSnapshot): boolean =>
  secondsUntilIdle(snapshot) === 0;

/**
 * Extend the silence deadline with audio scheduled until `end` (audio clock,
 * dry), adding the reverb tail. Never moves the deadline earlier.
 */
export const extendAudibleUntil = (
  audibleUntil: number,
  end: number,
  tailSeconds = REVERB_TAIL_SECONDS,
): number => (Number.isFinite(end) ? Math.max(audibleUntil, end + tailSeconds) : audibleUntil);
