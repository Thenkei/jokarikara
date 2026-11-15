import type { GameMode } from "../types";
import type { Translator } from "../i18n";

/**
 * "Chase your best": the run's previous personal best (the target shown in
 * the HUD) and the one-shot moment the score first beats it. Pure helpers;
 * App owns the run state in a ref and only re-renders when it flips.
 *
 * Semantics match the game over screen's `isNewBest` (storage.ts): the score
 * must be strictly greater than the previous best, so tying it is not a
 * record. A best of 0 (or none) is not a target: there is nothing to chase,
 * and celebrating the first stack of a fresh profile would be noise.
 */

export interface PersonalBestSource {
  mode: GameMode;
  /** Date key of a Daily run, null for a regular run. */
  dailyKey: string | null;
  /** Practice runs (Zen from a later world) never touch leaderboards. */
  practice: boolean;
  /** Top score of the run's mode (per-mode leaderboard), if any. */
  modeBest: number | undefined;
  /** Today's Daily record, read fresh at run start. */
  dailyRecord: { best: number; attempts: number } | null;
}

const isTarget = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * The best this run races against, or null when there is no race:
 * - Daily: today's Daily best (the Classic leaderboard is a different seed
 *   mix, so beating it on a known seed means nothing).
 * - Classic / Time Attack: the mode's top score.
 * - Zen: excluded. There is no fail state and undo can lower the score again,
 *   so "passing" the best is a matter of patience, not a race.
 */
export const selectPreviousBest = ({
  mode,
  dailyKey,
  practice,
  modeBest,
  dailyRecord,
}: PersonalBestSource): number | null => {
  if (practice || mode === "ZEN") return null;
  if (dailyKey !== null) {
    if (!dailyRecord || dailyRecord.attempts <= 0) return null;
    return isTarget(dailyRecord.best) ? dailyRecord.best : null;
  }
  return isTarget(modeBest) ? modeBest : null;
};

export interface PersonalBestState {
  /** Previous best for this run, null when there is nothing to chase. */
  readonly target: number | null;
  /** Latched once the score has beaten the target; never resets in a run. */
  readonly passed: boolean;
}

export const createPersonalBestState = (target: number | null): PersonalBestState => ({
  target: isTarget(target ?? undefined) ? target : null,
  passed: false,
});

export interface PersonalBestStep {
  state: PersonalBestState;
  /** True only on the single score update that first beats the target. */
  crossed: boolean;
}

/**
 * Feeds a new score. Returns the same state object when nothing changes, so
 * callers can skip work cheaply.
 */
export const advancePersonalBest = (
  state: PersonalBestState,
  score: number,
): PersonalBestStep => {
  if (state.passed || state.target === null || !Number.isFinite(score)) {
    return { state, crossed: false };
  }
  if (score <= state.target) return { state, crossed: false };
  return { state: { ...state, passed: true }, crossed: true };
};

/** HUD target: shown while a best exists and has not been beaten yet. */
export const getVisibleTarget = (state: PersonalBestState): number | null =>
  state.passed ? null : state.target;

/** Screen-reader text for the moment (the banner itself is decorative). */
export const getPersonalBestAnnouncement = (
  i18n: Translator,
  previousBest: number,
  daily: boolean,
): string =>
  i18n.t(daily ? "announce.newDailyBest" : "announce.newBest", { score: previousBest });
